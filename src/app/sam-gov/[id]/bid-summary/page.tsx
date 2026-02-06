"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { SamGovOpportunity } from "@/types/sam-gov";
import { fetchAnalyzedContractSummary } from "@/ai/flows/summarize-contract-opportunity";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Loading from "@/app/loading";
import { parseDescriptionWithGemini } from "@/ai/flows/summarize-contract-opportunity";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { CollapsibleSection } from "@/components/ui/collapsible-section";
import {
  ClipboardList,
  FileText,
  ShoppingCart,
  Terminal,
  AlertCircle,
  Send,
  MessageCircle,
  Bot,
  User,
  Building2,
  DollarSign,
  Users,
  CheckCircle,
  List,
  Package,
  FileSearch,
  Handshake,
  ArrowLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import type { OngoingBid } from "@/types/sam-gov";

type ChatMessage = { role: "agent" | "user"; content: string };

// Map section keys to icons
const sectionIcons: Record<string, React.ReactNode> = {
  read_and_interpret_the_solicitations: <FileSearch className="h-5 w-5 text-primary" />,
  extract_all_key_contract_data: <ClipboardList className="h-5 w-5 text-primary" />,
  identify_and_understand_the_product_service: <Package className="h-5 w-5 text-primary" />,
  source_the_product_or_service: <ShoppingCart className="h-5 w-5 text-primary" />,
  find_suitable_and_compliant_suppliers: <Users className="h-5 w-5 text-primary" />,
  price_comparison_and_cost_optimization: <DollarSign className="h-5 w-5 text-primary" />,
  final_recommendations_and_next_steps: <CheckCircle className="h-5 w-5 text-primary" />,
  title: <FileText className="h-5 w-5 text-primary" />,
  agency: <Building2 className="h-5 w-5 text-primary" />,
  id: <List className="h-5 w-5 text-primary" />,
};

function formatKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function renderValue(value: any, depth: number = 0): React.ReactNode {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">N/A</span>;
  }

  if (typeof value === "string") {
    // Check if it's a URL
    if (value.startsWith("http://") || value.startsWith("https://")) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary hover:underline break-all"
        >
          {value}
        </a>
      );
    }
    // Check if it's multi-line
    if (value.includes("\n")) {
      return (
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {value}
        </div>
      );
    }
    return <span className="text-foreground">{value}</span>;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="font-mono text-foreground">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted-foreground italic">None</span>;
    }

    // Check if array contains simple strings/numbers
    if (value.every((item) => typeof item === "string" || typeof item === "number")) {
      return (
        <ul className="list-disc list-inside space-y-1 ml-2">
          {value.map((item, i) => (
            <li key={i} className="text-sm">{String(item)}</li>
          ))}
        </ul>
      );
    }

    // Complex array items
    return (
      <div className="space-y-3">
        {value.map((item, i) => (
          <div key={i} className="bg-muted/30 rounded-lg p-3 border-l-2 border-primary/30">
            <div className="text-xs text-muted-foreground mb-2">Item {i + 1}</div>
            {renderValue(item, depth + 1)}
          </div>
        ))}
      </div>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return <span className="text-muted-foreground italic">Empty</span>;
    }

    return (
      <div className={`space-y-3 ${depth > 0 ? "" : ""}`}>
        {entries.map(([k, v]) => (
          <div key={k} className="border-l-2 border-muted pl-3">
            <div className="text-sm font-medium text-muted-foreground mb-1">
              {formatKey(k)}
            </div>
            <div className="ml-1">{renderValue(v, depth + 1)}</div>
          </div>
        ))}
      </div>
    );
  }

  return <span>{String(value)}</span>;
}

// Keys that should NOT be shown as collapsible sections
const metaKeys = ["title", "id", "agency", "originalOpportunityLink", "originalClosingDate"];

export default function BidSummaryPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  // Chat state
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    { role: "agent", content: "How may I help you? What questions do you have about this contract?" }
  ]);
  const [chatInput, setChatInput] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [totalContext, setTotalContext] = useState<{ summary: any; chatHistory: ChatMessage[] } | null>(null);

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (summary) {
      setTotalContext({ summary, chatHistory: chatMessages });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [summary]);

  useEffect(() => {
    if (!isClient || !id) return;
    let savedData = localStorage.getItem(`summary-${id}`)
    if (savedData !== null) {
      const x = JSON.parse(savedData)
      if (x) {
        setSummary(x)
        setLoading(false)
        return;
      }
    }
    const fetchData = async () => {
      setLoading(true);
      try {
        const response = await fetch(`/api/sam-gov?id=${id}`);
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || "Failed to fetch opportunity.");
        }
        const opportunities: SamGovOpportunity[] = await response.json();
        const opportunity = opportunities.find((op) => op.id === id);
        if (!opportunity) throw new Error("Opportunity not found.");

        if (opportunity.resourceLinks.length == 0) {
          const api_key = process.env.NEXT_PUBLIC_SAM_GOV_API_KEY;
          const res = await fetch(
            `${opportunity.description}&api_key=${api_key}`
          );

          const desc = await res.json();
          const descsummary = await parseDescriptionWithGemini(desc);
          if (descsummary) {
            setSummary({
              ...descsummary,
              title: opportunity.title,
              id: opportunity.id,
              agency: opportunity.department || "N/A",
              originalOpportunityLink: opportunity.link,
              originalClosingDate: opportunity.closingDate,
            });
            const finalSummary = {
              ...descsummary,
              title: opportunity.title,
              id: opportunity.id,
              agency: opportunity.department || "N/A",
              originalOpportunityLink: opportunity.link,
              originalClosingDate: opportunity.closingDate,
            }
            sessionStorage.setItem(id, JSON.stringify(finalSummary))
            let savedData = localStorage.getItem(`summary-${id}`)
            if (!savedData) {
              localStorage.setItem(`summary-${id}`, JSON.stringify(finalSummary))
            }
          } else {
            throw new Error("Failed to generate AI Summary.")
          }
        } else {
          const aiSummary = await fetchAnalyzedContractSummary(
            opportunity.resourceLinks as string[]
          );
          if (aiSummary) {
            setSummary({
              ...aiSummary,
              title: opportunity.title,
              id: opportunity.id,
              agency: opportunity.department || "N/A",
              originalOpportunityLink: opportunity.link,
              originalClosingDate: opportunity.closingDate,
            });
            const finalSummary = {
              ...aiSummary,
              title: opportunity.title,
              id: opportunity.id,
              agency: opportunity.department || "N/A",
              originalOpportunityLink: opportunity.link,
              originalClosingDate: opportunity.closingDate,
            }
            let savedData = localStorage.getItem(`summary-${id}`)
            if (!savedData) {
              localStorage.setItem(`summary-${id}`, JSON.stringify(finalSummary))
            }
          } else {
            throw new Error("Failed to generate AI summary.");
          }
        }
      } catch (err: any) {
        console.error(err);
        setError(err.message || "Unexpected error");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, isClient]);

  const handleStartBiddingProcess = () => {
    if (!summary || !isClient) return;
    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const existingBidsString = localStorage.getItem("ongoingBids");
      let existingBids: OngoingBid[] = [];
      if (existingBidsString) {
        try {
          existingBids = JSON.parse(existingBidsString);
          if (!Array.isArray(existingBids)) existingBids = [];
        } catch {
          localStorage.removeItem("ongoingBids");
        }
      }

      const bidIndex = existingBids.findIndex((b) => b.id === id);
      if (bidIndex !== -1) {
        existingBids[bidIndex].status = "Drafting";
      } else {
        existingBids.push({
          id: summary.id,
          title: summary.title,
          agency: summary.agency,
          status: "Drafting",
          deadline: summary.originalClosingDate || "N/A",
          source: "SAM.gov",
          linkToOpportunity:
            summary.originalOpportunityLink || `/sam-gov/${summary.id}`,
        });
      }

      localStorage.setItem("ongoingBids", JSON.stringify(existingBids));
    } catch (err: any) {
      console.error(err);
      setSubmissionError(err.message || "Failed to start bid.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProceedToQuoteRequest = () => {
    handleStartBiddingProcess();

    const existingBidsString = localStorage.getItem("ongoingBids");
    let existingBids: OngoingBid[] = [];
    if (existingBidsString) {
      try {
        existingBids = JSON.parse(existingBidsString);
      } catch {
        localStorage.removeItem("ongoingBids");
      }
    }
    const bidIndex = existingBids.findIndex((b) => b.id === summary.id);
    if (bidIndex !== -1) {
      existingBids[bidIndex].status = "RFQs Sent";
    } else {
      existingBids.push({
        id: summary.id,
        title: summary.title,
        agency: summary.agency,
        status: "RFQs Sent",
        deadline: summary.originalClosingDate || "N/A",
        source: "SAM.gov",
        linkToOpportunity:
          summary.originalOpportunityLink || `/sam-gov/${summary.id}`,
      });
    }

    localStorage.setItem("ongoingBids", JSON.stringify(existingBids));
    localStorage.setItem("summary", JSON.stringify(summary));
    router.push(`/rfq/${summary.id}`);
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim() || isSendingMessage) return;

    const userMessage: ChatMessage = { role: "user", content: chatInput.trim() };
    const updatedMessages = [...chatMessages, userMessage];
    setChatMessages(updatedMessages);
    setChatInput("");
    setIsSendingMessage(true);

    setTotalContext({ summary, chatHistory: updatedMessages });

    try {
      const contextPayload = {
        summary: summary,
        chatHistory: updatedMessages,
        userMessage: userMessage.content,
      };

      const response = await fetch("/api/backend/message-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contextPayload),
      });

      if (!response.ok) {
        throw new Error("Failed to get response from assistant");
      }

      const data = await response.json();
      const agentMessage: ChatMessage = { role: "agent", content: data.message };
      const messagesWithAgent = [...updatedMessages, agentMessage];
      setChatMessages(messagesWithAgent);

      setTotalContext({ summary, chatHistory: messagesWithAgent });
    } catch (err: any) {
      console.error("Chat error:", err);
      const errorMessage: ChatMessage = { role: "agent", content: "Sorry, I encountered an error. Please try again." };
      const messagesWithError = [...updatedMessages, errorMessage];
      setChatMessages(messagesWithError);

      setTotalContext({ summary, chatHistory: messagesWithError });
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleKeyPress = (e: { key: string; shiftKey: boolean; preventDefault: () => void }) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  if (loading) return <Loading />;

  if (error) {
    return (
      <main className="flex flex-col items-center justify-center p-6">
        <Alert variant="destructive" className="w-full max-w-lg">
          <Terminal className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <Button
            onClick={() => router.back()}
            variant="secondary"
            className="mt-4"
          >
            Go Back
          </Button>
        </Alert>
      </main>
    );
  }

  if (!summary) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p>Bid summary could not be loaded.</p>
        <Button
          onClick={() => router.back()}
          variant="secondary"
          className="mt-4"
        >
          Go Back
        </Button>
      </main>
    );
  }

  // Separate meta info from content sections
  const contentSections = Object.entries(summary).filter(([key]) => !metaKeys.includes(key));

  return (
    <main className="container mx-auto p-6 space-y-6 max-w-5xl animate-fadeIn">
      {/* Back Button */}
      <Button onClick={() => router.back()} variant="outline" size="sm" className="gap-2">
        <ArrowLeft className="h-4 w-4" />
        Back
      </Button>

      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold flex items-center gap-3">
          <FileText className="text-primary h-8 w-8" />
          Contract Bid Summary
        </h1>
        {summary.title && (
          <p className="text-lg text-muted-foreground">{summary.title}</p>
        )}
      </div>

      {/* Meta Info Card */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            {summary.id && (
              <div>
                <span className="text-muted-foreground">Notice ID:</span>
                <span className="ml-2 font-mono">{summary.id}</span>
              </div>
            )}
            {summary.agency && (
              <div>
                <span className="text-muted-foreground">Agency:</span>
                <span className="ml-2">{summary.agency}</span>
              </div>
            )}
            {summary.originalClosingDate && (
              <div>
                <span className="text-muted-foreground">Deadline:</span>
                <span className="ml-2 font-semibold text-destructive">{summary.originalClosingDate}</span>
              </div>
            )}
          </div>
          {summary.originalOpportunityLink && (
            <div className="mt-3 pt-3 border-t border-primary/20">
              <a
                href={summary.originalOpportunityLink}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline text-sm"
              >
                View Original Opportunity →
              </a>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Collapsible Content Sections */}
      <div className="space-y-4">
        {contentSections.map(([key, value]) => (
          <CollapsibleSection
            key={key}
            title={formatKey(key)}
            icon={sectionIcons[key] || <ClipboardList className="h-5 w-5 text-primary" />}
            defaultOpen={false}
          >
            <div className="pt-2">
              {renderValue(value)}
            </div>
          </CollapsibleSection>
        ))}
      </div>

      {/* Chat Interface - Always visible */}
      <Card className="border-2 border-primary/20 sticky bottom-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-xl">
            <MessageCircle className="text-primary h-5 w-5" />
            Contract Assistant
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Messages Container */}
          <div className="h-64 overflow-y-auto rounded-lg bg-muted/30 p-4 space-y-4 border">
            {chatMessages.map((msg: ChatMessage, index: number) => (
              <div
                key={index}
                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"
                  }`}
              >
                <div
                  className={`flex-shrink-0 h-8 w-8 rounded-full flex items-center justify-center ${msg.role === "agent"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-secondary-foreground"
                    }`}
                >
                  {msg.role === "agent" ? (
                    <Bot className="h-4 w-4" />
                  ) : (
                    <User className="h-4 w-4" />
                  )}
                </div>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2.5 ${msg.role === "agent"
                      ? "bg-card border shadow-sm"
                      : "bg-primary text-primary-foreground"
                    }`}
                >
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))}
            {isSendingMessage && (
              <div className="flex gap-3">
                <div className="flex-shrink-0 h-8 w-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="bg-card border shadow-sm rounded-2xl px-4 py-2.5">
                  <div className="flex gap-1">
                    <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:0ms]"></span>
                    <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:150ms]"></span>
                    <span className="h-2 w-2 bg-muted-foreground/50 rounded-full animate-bounce [animation-delay:300ms]"></span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Input Area */}
          <div className="flex gap-2">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Ask about this contract..."
              disabled={isSendingMessage}
              className="flex-1"
            />
            <Button
              onClick={handleSendMessage}
              disabled={!chatInput.trim() || isSendingMessage}
              size="icon"
              className="shrink-0"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-4 justify-end pt-4">
        <Button asChild variant="outline" size="lg">
          <Link href={`/sam-gov/${id}/quotenegotiation`}>
            <Handshake className="mr-2 h-4 w-4" />
            Quote Negotiation
          </Link>
        </Button>
      </div>

      {submissionError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{submissionError}</AlertDescription>
        </Alert>
      )}
    </main>
  );
}
