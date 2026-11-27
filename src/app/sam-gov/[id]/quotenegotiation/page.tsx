'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PageBand, PageMain } from "@/components/design/PageFrame";
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Icons } from '@/components/icons';
import Loading from '@/app/loading';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsTrigger } from '@/components/ui/tabs';
import { ScrollableTabsList } from '@/components/negotiation/ScrollableTabsList';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { Plus, Trash2, Building2, Mail, StickyNote, Trophy, ShieldCheck, FileDown, Send, AlertTriangle, CheckCircle2, Star, Sparkles } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { getStoredUser } from '@/lib/auth';
import { useActiveGmailSync } from '@/lib/useActiveGmailSync';
import { formatMoney, type BidConversationEvent } from '@/lib/pipeline';

interface Supplier {
  accepted_price?: number | null;
  id: number;
  company_name: string;
  email?: string;
  notes?: string;
  is_manual?: boolean;
  email_sent?: boolean;
  email_channel?: "gmail" | "legacy" | null;
  bid_id?: number | null;
  initial_rfq_draft?: string | null;
  status: string;
  negotiation_round: number;
  rounds?: { round_number: number; price: number | null; status: string }[];
  gmail_negotiation?: {
    bid_id: number;
    latest_price: number | null;
    rounds: NonNullable<Supplier["rounds"]>;
    messages: BidConversationEvent[];
  };
  messages: Message[];
  metrics?: {
    initial_price: string;
    final_price: string;
    savings: string;
    savings_percent: string;
  };
}

interface Message {
  sender: 'buyer' | 'supplier';
  content: string;
  price_mentioned?: number;
  created_at?: string;
}

interface NegotiationSession {
  bid_internal_status?: string | null;
  id: number;
  status: string;
  suppliers: Supplier[];
  opportunity_id: string;
  created_at: string;
  initial_messages?: InitialMessage[];
}

interface DraftResponse {
  draft: string;
  round: number;
  is_final_round: boolean;
}

interface InitialMessage {
  supplier_id: number;
  supplier_name: string;
  supplier_email?: string;
  is_manual?: boolean;
  draft_message: string;
  sent?: boolean;
  edited_message?: string;
}

interface SupplierDraft {
  supplierId: number;
  draft: string;
  editedDraft: string;
  draftInfo: DraftResponse;
  isPending: boolean; // Draft exists but not sent
}

// New interfaces for vendor selection
interface AiSupplier {
  name: string;
  email: string;
  selected?: boolean;
}

interface ManualVendor {
  id: string;
  name: string;
  email: string;
  notes: string;
}

interface VendorScore {
  vendor_id: number;
  company_name: string;
  price_score: number;
  status_score: number;
  engagement_score: number;
  overall_score: number;
  is_recommended: boolean;
}

interface Recommendations {
  best_vendor: string;
  ranking: string[];
  price_analysis: string;
  risk_factors: string[];
  recommendation_reasoning: string;
  savings_potential: string;
  vendor_scores: VendorScore[];
}

interface ComplianceCheck {
  name: string;
  requirement: string;
  status: 'passed' | 'warning' | 'failed';
  details: string;
}

interface ComplianceResult {
  vendor_name: string;
  overall_status: string;
  compliance_score: number;
  checks: ComplianceCheck[];
  warnings: { type: string; message: string }[];
}

/** True when UI shows "waiting for vendor email" — same logic as getSupplierActionState awaiting_response + email_sent. */
function isAwaitingVendorEmailReply(
  supplier: Supplier,
  drafts: Map<number, SupplierDraft>
): boolean {
  if (!supplier.email_sent || supplier.status === 'completed') return false;
  if (drafts.get(supplier.id)?.isPending) return false;
  const buyerMessages = supplier.messages.filter((m) => m.sender === 'buyer').length;
  const supplierMessages = supplier.messages.filter((m) => m.sender === 'supplier').length;
  if (buyerMessages === 0) return false;
  if (buyerMessages > supplierMessages) return true;
  if (buyerMessages === supplierMessages && buyerMessages > 0) {
    const last = supplier.messages[supplier.messages.length - 1];
    return last?.sender === 'buyer';
  }
  return false;
}

function getSupplierFinalPrice(supplier: Supplier | undefined): number | null {
  if (!supplier) return null;

  const latestQuotedPrice = [...supplier.messages]
    .reverse()
    .find((message) => message.sender === 'supplier' && message.price_mentioned != null)
    ?.price_mentioned;
  const rawPrice = supplier.accepted_price ?? supplier.metrics?.final_price ??
    supplier.gmail_negotiation?.latest_price ?? latestQuotedPrice;
  const parsedPrice = Number(rawPrice);

  return Number.isFinite(parsedPrice) && parsedPrice >= 0 ? parsedPrice : null;
}


export default function BidSummaryPage() {
  const params = useParams();
  const router = useRouter();
  const opportunityId = params.id as string;

  const [opportunity, setOpportunity] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [targetPrice, setTargetPrice] = useState('');
  const [additionalRequirements, setAdditionalRequirements] = useState('');
  const [numSuppliers, setNumSuppliers] = useState('5');
  const [negotiationSession, setNegotiationSession] = useState<NegotiationSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [replyNotice, setReplyNotice] = useState<string | null>(null);

  // State for initial message review
  const [showInitialReview, setShowInitialReview] = useState(false);
  const [initialMessages, setInitialMessages] = useState<InitialMessage[]>([]);
  const [currentInitialIndex, setCurrentInitialIndex] = useState(0);
  const [sendingInitial, setSendingInitial] = useState(false);

  // State for draft editing during negotiation - IMPROVED
  const [supplierDrafts, setSupplierDrafts] = useState<Map<number, SupplierDraft>>(new Map());
  const negotiationSessionRef = useRef<NegotiationSession | null>(null);
  const supplierDraftsRef = useRef(supplierDrafts);

  negotiationSessionRef.current = negotiationSession;
  supplierDraftsRef.current = supplierDrafts;
  const [draftModalOpen, setDraftModalOpen] = useState(false);
  const [currentSupplierId, setCurrentSupplierId] = useState<number | null>(null);
  const [sendingResponse, setSendingResponse] = useState(false);
  const [generatingDraft, setGeneratingDraft] = useState<number | null>(null); // Track which supplier is generating
  const [gettingResponse, setGettingResponse] = useState<number | null>(null); // Track which supplier is getting response

  // Vendor selection states
  const [showVendorSelection, setShowVendorSelection] = useState(false);
  const [loadingAiSuppliers, setLoadingAiSuppliers] = useState(false);
  const [aiSuppliers, setAiSuppliers] = useState<AiSupplier[]>([]);
  const [manualVendors, setManualVendors] = useState<ManualVendor[]>([]);
  const [preferredVendors, setPreferredVendors] = useState<Array<{ name: string; email: string }>>([]);
  const [newVendorName, setNewVendorName] = useState('');
  const [newVendorEmail, setNewVendorEmail] = useState('');
  const [newVendorNotes, setNewVendorNotes] = useState('');

  // Review & Submission states
  const [showReviewSection, setShowReviewSection] = useState(false);
  const [recommendations, setRecommendations] = useState<Recommendations | null>(null);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [complianceResults, setComplianceResults] = useState<Map<number, ComplianceResult>>(new Map());
  const [loadingCompliance, setLoadingCompliance] = useState(false);
  const [selectedVendorForBid, setSelectedVendorForBid] = useState<number | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [submittingBid, setSubmittingBid] = useState(false);
  const [bidSubmitted, setBidSubmitted] = useState(false);
  const [customerSubmittedPrice, setCustomerSubmittedPrice] = useState('');
  const selectedSupplierForBid = negotiationSession?.suppliers.find(
    (supplier) => supplier.id === selectedVendorForBid,
  );
  const selectedSupplierCost = getSupplierFinalPrice(selectedSupplierForBid);
  const parsedCustomerSubmittedPrice = Number(customerSubmittedPrice);
  const hasValidCustomerSubmittedPrice =
    customerSubmittedPrice.trim() !== '' &&
    Number.isFinite(parsedCustomerSubmittedPrice) &&
    parsedCustomerSubmittedPrice >= 0;
  const previewGrossProfit =
    selectedSupplierCost !== null && hasValidCustomerSubmittedPrice
      ? parsedCustomerSubmittedPrice - selectedSupplierCost
      : null;

  // AI target price estimation states
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [estimatedByAi, setEstimatedByAi] = useState(false);
  const [aiPriceReasoning, setAiPriceReasoning] = useState('');

  const getRequesterQuery = () => {
    const currentUser = getStoredUser();
    if (!currentUser) return '';

    const query = new URLSearchParams({
      company_id: String(currentUser.company_id),
      requester_user_id: String(currentUser.id),
    });

    return `?${query.toString()}`;
  };

  const getRequesterPayload = () => {
    const currentUser = getStoredUser();
    if (!currentUser) return {};

    return {
      company_id: currentUser.company_id,
      requester_user_id: currentUser.id,
    };
  };

  useEffect(() => {
    if (!opportunityId) return
    fetchOpportunityDetails();
    void checkExistingSession().then((found) => {
      if (found === false) void fetchAiTargetEstimate();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opportunityId]);

  const sessionLookupUrl = () => {
    const query = new URLSearchParams(getRequesterQuery());
    query.set("opportunity_id", opportunityId);
    return `/api/sam-gov/sessions?${query}`;
  };

  // Check if there's an existing negotiation session for this opportunity
  const checkExistingSession = async () => {
    try {
      const response = await fetch(sessionLookupUrl(), {
        cache: 'no-store',
      });
      if (response.ok) {
        const data = await response.json();
        console.log('Fetched sessions:', data.sessions?.length, 'Looking for:', opportunityId);
        const existingSession = data.sessions?.find(
          (s: any) => s.opportunity_id === opportunityId
        );

        console.log('Found existing session:', existingSession ? existingSession.id : 'none');

        if (existingSession) {
          // Fetch the full session details
          const sessionResponse = await fetch(`/api/sam-gov/negotiate/${existingSession.id}${getRequesterQuery()}`, {
            cache: 'no-store',
          });
          if (sessionResponse.ok) {
            const sessionData: NegotiationSession = await sessionResponse.json();
            setNegotiationSession(sessionData);
            const unsent = sessionData.suppliers.flatMap((supplier) => (
              !supplier.email_sent && supplier.initial_rfq_draft && supplier.status === "pending" ? [{
                supplier_id: supplier.id, supplier_name: supplier.company_name,
                supplier_email: supplier.email, is_manual: supplier.is_manual,
                draft_message: supplier.initial_rfq_draft,
                edited_message: supplier.initial_rfq_draft, sent: false,
              }] : []
            ));
            if (sessionData.status === "active" && unsent.length) {
              setInitialMessages(unsent);
              setCurrentInitialIndex(0);
              setShowInitialReview(true);
            }

            // Auto-check for responses for pending suppliers who have messages sent
            setTargetPrice(String(existingSession.target_price ?? ''));
            return true;
          }
          return undefined;
        }
        return false;
      }
    } catch (err) {
      console.error('Error checking for existing session:', err);
    }
  };

  useEffect(() => {
    if (!negotiationSession?.id || showInitialReview) return;

    const needsInitialMessages =
      initialMessages.length > 0 && initialMessages.some((m) => !m.sent);
    if (needsInitialMessages) return;

    const tick = async () => {
      const session = negotiationSessionRef.current;
      if (!session) return;

      const drafts = supplierDraftsRef.current;
      const awaitingEmail = session.suppliers.some((s) =>
        isAwaitingVendorEmailReply(s, drafts)
      );

      if (!awaitingEmail || session.status !== "active" || document.visibilityState !== "visible") return;

      try {
        const response = await fetch(
          `/api/sam-gov/negotiate/${session.id}${getRequesterQuery()}`,
          { cache: 'no-store' }
        );
        if (response.ok) {
          const data = await response.json();
          setNegotiationSession(data);
        }
      } catch (err) {
        console.error('Failed to fetch negotiation status:', err);
      }
    };

    void tick();
    const interval = setInterval(() => void tick(), 15_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negotiationSession?.id, showInitialReview, initialMessages]);

  const fetchOpportunityDetails = async () => {
    try {
      setLoading(true);
      let foundOpportunity;
      if (!opportunityId.startsWith('PIPELINE-')) {
        const single = await fetch(`/api/sam-gov/opportunity/${encodeURIComponent(opportunityId)}`, { cache: 'no-store' });
        if (single.ok) foundOpportunity = await single.json();
      }
      // Bids without a SAM.gov notice (vendors added from the bid page create a PIPELINE-<id>
      // negotiation; bids from other portals): show the negotiation from its own record.
      if (!foundOpportunity) {
        const sessionsResponse = await fetch(sessionLookupUrl(), { cache: 'no-store' });
        const sessionsData = sessionsResponse.ok ? await sessionsResponse.json() : null;
        const ownSession = sessionsData?.sessions?.find((s: any) => s.opportunity_id === opportunityId);
        if (ownSession) {
          foundOpportunity = {
            id: opportunityId,
            title: ownSession.opportunity_title || opportunityId,
            department: null,
            ncode: null,
            type: 'No SAM.gov notice',
            closingDate: null,
            description: '',
          };
        }
      }

      if (foundOpportunity) {
        setOpportunity(foundOpportunity);

        if (foundOpportunity.description?.startsWith('http')) {
          try {
            const descResponse = await fetch(foundOpportunity.description);
            const text = await descResponse.text();
            foundOpportunity.fullDescription = text.replace(/<[^>]+>/g, '');
          } catch (e) {
            foundOpportunity.fullDescription = foundOpportunity.description;
          }
        } else {
          foundOpportunity.fullDescription = foundOpportunity.description;
        }
      }
    } catch (err) {
      setError('Failed to load opportunity details');
    } finally {
      setLoading(false);
    }
  };

  const fetchAiTargetEstimate = async () => {
    const savedData = localStorage.getItem(`summary-${opportunityId}`);
    if (!savedData) return;

    try {
      setLoadingEstimate(true);
      const parsedData = JSON.parse(savedData);

      const response = await fetch('/api/sam-gov/estimate-target-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunity: parsedData }),
      });

      if (!response.ok) throw new Error('Estimate failed');

      const data = await response.json();
      if (data.estimated_price && !targetPrice) {
        setTargetPrice(String(data.estimated_price));
        setEstimatedByAi(true);
        if (data.reasoning) setAiPriceReasoning(data.reasoning);
      }
    } catch (err) {
      console.error('Failed to fetch AI target price estimate:', err);
    } finally {
      setLoadingEstimate(false);
    }
  };

  // Fetch AI-suggested suppliers
  const fetchAiSuppliers = async () => {
    if (!targetPrice || parseFloat(targetPrice) <= 0) {
      setError('Please enter a valid target price');
      return;
    }

    const savedData = localStorage.getItem(`summary-${opportunityId}`);
    if (!savedData) {
      setError('No opportunity summary found. Please go back and generate a summary first.');
      return;
    }

    setLoadingAiSuppliers(true);
    setError(null);

    try {
      const parsedData = JSON.parse(savedData);
      const response = await fetch('/api/sam-gov/get-ai-suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunity: parsedData }),
      });

      if (!response.ok) {
        throw new Error('Failed to get AI supplier suggestions');
      }

      const data = await response.json();
      const suppliers = (data.ai_suppliers || []).map((s: AiSupplier) => ({
        ...s,
        selected: true // All AI suppliers selected by default
      }));

      setAiSuppliers(suppliers);
      setPreferredVendors(data.preferred_vendors || []);
      setShowVendorSelection(true);
    } catch (err) {
      console.error('Error fetching AI suppliers:', err);
      setError('Failed to get AI supplier suggestions. Please try again.');
    } finally {
      setLoadingAiSuppliers(false);
    }
  };

  // Toggle AI supplier selection
  const toggleAiSupplier = (index: number) => {
    setAiSuppliers(prev => prev.map((s, i) =>
      i === index ? { ...s, selected: !s.selected } : s
    ));
  };

  // Add manual vendor
  const addManualVendor = () => {
    if (!newVendorName.trim() || !newVendorEmail.trim()) {
      setError('Please enter both vendor name and email');
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newVendorEmail.trim())) {
      setError('Please enter a valid email address');
      return;
    }

    const newVendor: ManualVendor = {
      id: `manual-${Date.now()}`,
      name: newVendorName.trim(),
      email: newVendorEmail.trim(),
      notes: newVendorNotes.trim()
    };

    setManualVendors(prev => [...prev, newVendor]);
    setNewVendorName('');
    setNewVendorEmail('');
    setNewVendorNotes('');
    setError(null);
  };

  // Remove manual vendor
  const removeManualVendor = (id: string) => {
    setManualVendors(prev => prev.filter(v => v.id !== id));
  };

  // Back to settings from vendor selection
  const backToSettings = () => {
    setShowVendorSelection(false);
    setAiSuppliers([]);
    setManualVendors([]);
  };

  const startNegotiation = async () => {
    const selectedAiSuppliers = aiSuppliers.filter(s => s.selected);

    if (selectedAiSuppliers.length === 0 && manualVendors.length === 0) {
      setError('Please select at least one vendor to start negotiation');
      return;
    }

    const savedData = localStorage.getItem(`summary-${opportunityId}`);
    if (!savedData) return;
    const parsedData = JSON.parse(savedData);

    setSubmitting(true);
    setError(null);

    try {
      const currentUser = getStoredUser();
      const response = await fetch('/api/sam-gov/negotiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...getRequesterPayload(),
          company_id: currentUser?.company_id ?? null,
          created_by_user_id: currentUser?.id ?? null,
          opportunity: parsedData,
          targetPrice: parseFloat(targetPrice),
          additionalRequirements,
          selectedAiSuppliers: selectedAiSuppliers.map(s => ({ name: s.name, email: s.email })),
          manualSuppliers: manualVendors.map(v => ({ name: v.name, email: v.email, notes: v.notes })),
        }),
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => null);
        throw new Error(errBody?.error || `Server error (${response.status}). Please try again.`);
      }

      const data = await response.json();
      setNegotiationSession(data);

      // Set up initial message review with proper draft messages
      if (data.initial_messages || data.suppliers) {
        const messages = (data.initial_messages || data.suppliers.map((s: Supplier) => ({
          supplier_id: s.id,
          supplier_name: s.company_name,
          draft_message: `Subject: Request for Quote - Government Contract Opportunity

Dear ${s.company_name},

We are seeking competitive quotes from qualified suppliers for the following government contract opportunity:

${parsedData.title || 'Government Contract'}

Requirements:
- Complete pricing breakdown with all costs itemized
- Delivery timeline and milestones
- Compliance with all federal acquisition regulations
- Evidence of relevant past performance
- Quality assurance and control measures
${additionalRequirements ? `\nAdditional Requirements:\n${additionalRequirements}` : ''}

Target Budget Range: Competitive pricing expected

Please provide your most competitive proposal including any volume discounts or early delivery incentives.

We look forward to your response.

Best regards,
Procurement Team`
        }))).map((msg: InitialMessage) => ({
          ...msg,
          edited_message: msg.draft_message,
          sent: false
        }));
        setInitialMessages(messages);
        setShowInitialReview(true);
        setCurrentInitialIndex(0);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to start negotiation process. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchNegotiationStatus = async () => {
    if (!negotiationSession) return;

    try {
      const response = await fetch(
        `/api/sam-gov/negotiate/${negotiationSession.id}${getRequesterQuery()}`,
        { cache: 'no-store' }
      );
      const data = await response.json();
      setNegotiationSession(data);
    } catch (err) {
      console.error('Failed to fetch negotiation status:', err);
    }
  };

  useActiveGmailSync(
    Boolean(negotiationSession?.status === "active" && getStoredUser()?.role === "agent" &&
      negotiationSession.suppliers.some((supplier) => supplier.email_channel === "gmail" &&
        supplier.status !== "completed" && supplier.status !== "stopped" && supplier.negotiation_round < 3)),
    fetchNegotiationStatus,
  );

  const sendInitialMessage = async (supplierId: number, content: string, advance = true) => {
    if (!negotiationSession) return false;

    try {
      setSendingInitial(true);
      setSendError(null);

      const response = await fetch(
        `/api/sam-gov/negotiate/${negotiationSession.id}/send-initial/${supplierId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content, ...getRequesterPayload() })
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.email_sent) {
        throw new Error(data.email_error || data.error || 'Failed to send the RFQ. Please try again.');
      }

      // Mark message as sent
      setInitialMessages(prev =>
        prev.map(msg =>
          msg.supplier_id === supplierId
            ? { ...msg, sent: true }
            : msg
        )
      );

      if (!advance) return true;
      // Move to next supplier or complete
      const nextIndex = initialMessages.findIndex((msg) => msg.supplier_id !== supplierId && !msg.sent);
      if (nextIndex !== -1) {
        setCurrentInitialIndex(nextIndex);
      } else {
        // All initial messages sent, refresh and show negotiation view
        setShowInitialReview(false);
        await fetchNegotiationStatus();
      }
      return true;

    } catch (err) {
      console.error('Failed to send initial message:', err);
      setSendError(err instanceof Error ? err.message : 'Failed to send the RFQ. Please try again.');
      return false;
    } finally {
      setSendingInitial(false);
    }
  };

  const sendAllInitialMessages = async () => {
    for (let index = 0; index < initialMessages.length; index++) {
      const msg = initialMessages[index];
      if (msg.sent) continue;
      setCurrentInitialIndex(index);
      if (!await sendInitialMessage(msg.supplier_id, msg.edited_message || msg.draft_message, false)) return;
    }
    setShowInitialReview(false);
    await fetchNegotiationStatus();
  };

  // Get supplier response only (no draft generation)
  const getSupplierResponse = async (supplierId: number) => {
    try {
      setGettingResponse(supplierId);
      setReplyNotice(null);

      // Trigger a scoped inbox poll for this specific supplier before checking
      const supplier = negotiationSession?.suppliers.find(s => s.id === supplierId);
      if (supplier?.email_sent && negotiationSession) {
        const poll = await fetch('/api/sam-gov/negotiate/poll-inbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            session_id: negotiationSession.id,
            supplier_id: supplierId,
            ...getRequesterPayload(),
          }),
        });
        const result = await poll.json().catch(() => ({}));
        if (!poll.ok || result.success === false) {
          throw new Error(result.error || 'The RFQ inbox could not be checked.');
        }
        setReplyNotice(result.processed
          ? `${result.processed} new vendor replies imported.`
          : result.unmatched
            ? "No reply matched this RFQ. Review unmatched mail in the connected inbox."
            : "No new replies for this RFQ.");
      }

      const response = await fetch(
        `/api/sam-gov/negotiate/${negotiationSession?.id}/respond/${supplierId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(getRequesterPayload()),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to get supplier response');
      }

      const data = await response.json();

      if (data.waiting_for_email) {
        setError(null);
        // Refresh session to pick up any newly ingested messages
        await fetchNegotiationStatus();
        return;
      }

      // Update the negotiation status to show the new supplier message
      await fetchNegotiationStatus();

    } catch (err) {
      console.error('Failed to get response:', err);
      setReplyNotice(err instanceof Error ? err.message : 'Failed to get supplier response. Please try again.');
    } finally {
      setGettingResponse(null);
    }
  };

  // Generate draft response (separate from getting supplier response)
  const generateDraftResponse = async (supplierId: number) => {
    try {
      setGeneratingDraft(supplierId);

      const draftResponse = await fetch(
        `/api/sam-gov/negotiate/${negotiationSession?.id}/draft/${supplierId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(getRequesterPayload()),
        }
      );

      if (!draftResponse.ok) {
        throw new Error('Failed to generate draft response');
      }

      const draftData = await draftResponse.json();

      // Store the draft
      const newDraft: SupplierDraft = {
        supplierId,
        draft: draftData.draft,
        editedDraft: draftData.draft,
        draftInfo: draftData,
        isPending: true
      };

      setSupplierDrafts(prev => new Map(prev).set(supplierId, newDraft));

      // Open the modal
      setCurrentSupplierId(supplierId);
      setDraftModalOpen(true);

    } catch (err) {
      console.error('Failed to generate draft:', err);
      setError('Failed to generate draft response. Please try again.');
    } finally {
      setGeneratingDraft(null);
    }
  };

  // Open existing draft
  const openDraft = (supplierId: number) => {
    setCurrentSupplierId(supplierId);
    setDraftModalOpen(true);
  };

  const sendEditedResponse = async () => {
    if (!currentSupplierId || !negotiationSession) return;

    const draft = supplierDrafts.get(currentSupplierId);
    if (!draft) return;

    try {
      setSendingResponse(true);
      setSendError(null);

      const response = await fetch(
        `/api/sam-gov/negotiate/${negotiationSession.id}/send/${currentSupplierId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: draft.editedDraft, ...getRequesterPayload() })
        }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.email_sent) {
        throw new Error(data.email_error || data.error || 'Failed to send the response. Please try again.');
      }

      // Remove the draft and close modal
      setSupplierDrafts(prev => {
        const newMap = new Map(prev);
        newMap.delete(currentSupplierId);
        return newMap;
      });

      setDraftModalOpen(false);
      setCurrentSupplierId(null);
      await fetchNegotiationStatus();

    } catch (err) {
      console.error('Failed to send response:', err);
      setSendError(err instanceof Error ? err.message : 'Failed to send the response. Please try again.');
    } finally {
      setSendingResponse(false);
    }
  };

  const stopNegotiation = async (supplierId: number) => {
    try {
      const response = await fetch(`/api/sam-gov/negotiate/${negotiationSession?.id}/stop/${supplierId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(getRequesterPayload()),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error || 'Unable to stop negotiation.');
        return;
      }
      fetchNegotiationStatus();
    } catch (err) {
      console.error('Failed to stop negotiation:', err);
      setError('Unable to stop negotiation.');
    }
  };

  const acceptQuote = async (supplierId: number) => {
    const supplier = negotiationSession?.suppliers.find((item) => item.id === supplierId);
    const price = getSupplierFinalPrice(supplier);
    if (!supplier || price === null || !window.confirm(`Accept ${supplier.company_name}'s offer of ${formatMoney(price)}?`)) return;
    try {
      const response = await fetch(`/api/sam-gov/negotiate/${negotiationSession?.id}/accept/${supplierId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...getRequesterPayload(), expected_price: price }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error || 'Unable to accept the quote.');
      }
      fetchNegotiationStatus();
    } catch (err) {
      console.error('Failed to accept quote:', err);
      setError('Unable to accept the quote.');
    }
  };

  // Fetch AI recommendations
  const fetchRecommendations = async () => {
    if (!negotiationSession) return;

    setLoadingRecommendations(true);
    try {
      const response = await fetch(`/api/sam-gov/negotiate/${negotiationSession.id}/recommendations${getRequesterQuery()}`);
      if (response.ok) {
        const data = await response.json();
        setRecommendations(data.recommendations);
      }
    } catch (err) {
      console.error('Failed to fetch recommendations:', err);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  // Run compliance checks for all vendors
  const runComplianceChecks = async () => {
    if (!negotiationSession || !opportunity) return;

    setLoadingCompliance(true);
    const savedData = localStorage.getItem(`summary-${opportunityId}`);
    const requirements = savedData ? JSON.parse(savedData) : {};

    try {
      const results = new Map<number, ComplianceResult>();

      for (const supplier of negotiationSession.suppliers) {
        const response = await fetch('/api/compliance', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vendor_name: supplier.company_name,
            vendor_email: supplier.email,
            requirements: {
              opportunity_title: opportunity.title,
              naics_code: opportunity.ncode,
              set_aside_type: requirements.set_aside_type,
              certifications_needed: requirements.certifications_needed || [],
              delivery_requirements: requirements.delivery_requirements,
              timeline: requirements.timeline
            },
            is_manual: supplier.is_manual
          })
        });

        if (response.ok) {
          const data = await response.json();
          results.set(supplier.id, data);
        } else {
          setError('Compliance check failed for ' + supplier.company_name + '. Please retry.');
        }
      }

      setComplianceResults(results);
    } catch (err) {
      console.error('Failed to run compliance checks:', err);
    } finally {
      setLoadingCompliance(false);
    }
  };

  // Generate bid package PDF
  const generateBidPackage = async () => {
    if (!negotiationSession || !selectedVendorForBid || !opportunity) return;

    const selectedSupplier = negotiationSession.suppliers.find(s => s.id === selectedVendorForBid);
    if (!selectedSupplier) return;

    const quotePrice = getSupplierFinalPrice(selectedSupplier);
    if (quotePrice === null) {
      setError("This vendor has no priced offer for the bid package.");
      return;
    }
    setGeneratingPdf(true);
    const compliance = complianceResults.get(selectedVendorForBid);
    const savedData = localStorage.getItem(`summary-${opportunityId}`);
    const opportunityData = savedData ? { ...JSON.parse(savedData), ...opportunity } : opportunity;

    try {
      const response = await fetch('/api/pdf/generate-bid-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity: opportunityData,
          vendor: {
            ...selectedSupplier,
            current_price: quotePrice,
          },
          compliance: compliance,
          negotiation: {
            round_count: selectedSupplier.gmail_negotiation?.rounds.length ?? selectedSupplier.negotiation_round,
            initial_price: parseFloat(selectedSupplier.metrics?.initial_price || '0'),
            final_price: quotePrice,
            savings: parseFloat(selectedSupplier.metrics?.savings || '0'),
            savings_percent: parseFloat(selectedSupplier.metrics?.savings_percent || '0'),
            messages: selectedSupplier.gmail_negotiation?.messages ?? selectedSupplier.messages,
          }
        })
      });

      if (!response.ok) throw new Error('Bid package service returned ' + response.status);
      {
        const contentType = response.headers.get('content-type');

        if (contentType?.includes('application/pdf')) {
          // Download PDF
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `bid_package_${opportunity.id?.substring(0, 8)}_${new Date().toISOString().split('T')[0]}.pdf`;
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
          a.remove();
        } else {
          // HTML fallback - open in new window
          const data = await response.json();
          if (data.html) {
            const newWindow = window.open();
            if (newWindow) {
              newWindow.document.write(data.html);
              newWindow.document.close();
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to generate bid package:', err);
      setError('Failed to generate bid package. Please try again.');
    } finally {
      setGeneratingPdf(false);
    }
  };

  // Submit bid
  const submitBid = async () => {
    if (!negotiationSession || !selectedVendorForBid || !opportunity) return;

    const selectedSupplier = negotiationSession.suppliers.find(s => s.id === selectedVendorForBid);
    if (!selectedSupplier) return;
    const submittedPrice = Number(customerSubmittedPrice);
    if (!Number.isFinite(submittedPrice) || submittedPrice < 0 || !customerSubmittedPrice.trim()) {
      setError('Enter the customer submitted price before submitting the bid.');
      return;
    }
    if (selectedSupplierCost === null) {
      setError('Select a vendor with a valid final supplier quote before submitting the bid.');
      return;
    }
    const requiresConfirmation = negotiationSession.bid_internal_status === "Waiting Approval" ||
      negotiationSession.bid_internal_status === "Bid No Approved";
    if (requiresConfirmation && !window.confirm("Record this submission without manager approval?")) return;
    setSubmittingBid(true);

    try {
      // Update localStorage with bid status
      const existingBidsString = localStorage.getItem('ongoingBids');
      let existingBids: any[] = [];
      if (existingBidsString) {
        try {
          existingBids = JSON.parse(existingBidsString);
        } catch {
          existingBids = [];
        }
      }

      const bidIndex = existingBids.findIndex(b => b.id === opportunity.id);
      const bidData = {
        id: opportunity.id,
        title: opportunity.title,
        agency: opportunity.department || 'N/A',
        status: 'Bid Submitted',
        deadline: opportunity.closingDate || 'N/A',
        source: 'SAM.gov',
        linkToOpportunity: `/sam-gov/${opportunity.id}`,
        selectedVendor: selectedSupplier.company_name,
        supplierCost: selectedSupplierCost,
        submittedPrice,
        submittedAt: new Date().toISOString()
      };

      if (bidIndex !== -1) {
        existingBids[bidIndex] = { ...existingBids[bidIndex], ...bidData };
      } else {
        existingBids.push(bidData);
      }

      // Update session status to bid_submitted
      if (negotiationSession) {
        try {
          const statusRes = await fetch(`/api/sam-gov/negotiate/${negotiationSession.id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'bid_submitted',
              portal: 'SAM.GOV',
              supplier_cost: selectedSupplierCost,
              submitted_price: submittedPrice,
              confirm_without_approval: requiresConfirmation,
              supplier_id: selectedSupplier.id,
              ...getRequesterPayload(),
            }),
          });
          const statusData = await statusRes.json().catch(() => ({}));
          if (!statusRes.ok) {
            console.error('[stats] Submit bid status update failed', {
              status: statusRes.status,
              body: statusData,
              sessionId: negotiationSession.id,
            });
            throw new Error(statusData.error || `Failed to submit bid (${statusRes.status})`);
          }
          if (!statusData.pipeline_id) {
            console.warn('[pipeline] Bid submitted but no pipeline_id returned', statusData);
          } else {
            console.log('[pipeline] Linked pipeline row', statusData.pipeline_id);
          }
        } catch (statusErr) {
          console.error('[stats] Failed to update session status / record bid:', statusErr);
          throw statusErr;
        }
      }

      localStorage.setItem('ongoingBids', JSON.stringify(existingBids));
      setBidSubmitted(true);

    } catch (err) {
      console.error('Failed to submit bid:', err);
      setError(err instanceof Error ? err.message : 'Failed to submit bid. Please try again.');
    } finally {
      setSubmittingBid(false);
    }
  };

  // Open review section
  const openReviewSection = async () => {
    setShowReviewSection(true);
    await Promise.all([fetchRecommendations(), runComplianceChecks()]);
  };

  // Helper to determine what action is needed for a supplier
  const getSupplierActionState = (supplier: Supplier) => {
    const draft = supplierDrafts.get(supplier.id);
    const buyerMessages = supplier.messages.filter(m => m.sender === 'buyer').length;
    const supplierMessages = supplier.messages.filter(m => m.sender === 'supplier').length;

    if (supplier.status === 'completed') {
      return { type: 'completed', label: 'Negotiation Complete' };
    }

    if (supplier.status === 'stopped') {
      return { type: 'stopped', label: 'Stopped' };
    }

    if (supplier.negotiation_round >= 3) {
      return { type: 'best_offer', label: 'Best offer' };
    }

    if (draft?.isPending) {
      return { type: 'draft_pending', label: 'Draft Ready - Review & Send' };
    }

    if (buyerMessages === 0) {
      return { type: 'need_initial', label: 'Waiting for Initial Message' };
    }

    if (buyerMessages > supplierMessages) {
      return { type: 'awaiting_response', label: 'Awaiting Supplier Response' };
    }

    if (supplierMessages > buyerMessages) {
      return { type: 'need_draft', label: 'Generate Your Response' };
    }

    // When messages are equal, check if we need to generate a draft or get supplier response
    if (buyerMessages === supplierMessages && buyerMessages > 0) {
      // Get the last message to determine who sent it
      const lastMessage = supplier.messages[supplier.messages.length - 1];

      if (lastMessage?.sender === 'supplier') {
        // Supplier just responded, we need to generate our draft
        return { type: 'need_draft', label: 'Generate Your Response' };
      } else {
        // We just sent a message, waiting for supplier
        return { type: 'awaiting_response', label: 'Awaiting Supplier Response' };
      }
    }

    return { type: 'ready', label: 'Continue Negotiation' };
  };

  if (loading) {
    return <Loading />;
  }

  if (!opportunity) {
    return (
      <PageMain className="cf-workspace items-center">
        <Card className="cf-card">
          <CardHeader>
            <CardTitle className="cf-h2">Opportunity not found</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.back()}>Go Back</Button>
          </CardContent>
        </Card>
      </PageMain>
    );
  }

  const currentDraft = currentSupplierId ? supplierDrafts.get(currentSupplierId) : null;
  const sendFailure = sendError && (
    <Alert variant="destructive">
      <AlertDescription>
        {sendError}
        {/connect gmail/i.test(sendError) && (
          <Link className="ml-2 underline" href="/settings" target="_blank" rel="noopener">Open Gmail settings</Link>
        )}
      </AlertDescription>
    </Alert>
  );

  return (
    <>
      <PageBand
        eyebrow="RFQ workspace"
        title="Quote negotiation"
        lead={opportunity.title}
        actions={
          <button type="button" className="cf-btn cf-btn-secondary" onClick={() => router.back()}>
            <Icons.arrowRight className="h-4 w-4 rotate-180" aria-hidden />
            Back
          </button>
        }
      />
      <PageMain className="cf-workspace">
        {!draftModalOpen && sendFailure}
        {replyNotice && <p className="cf-banner" role="status">{replyNotice}</p>}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)]">
          {/* Opportunity Summary */}
          <div className="min-w-0">
            <Card className="cf-card">
              <CardHeader>
                <CardTitle className="cf-h2">Opportunity summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label className="text-sm text-muted-foreground">Title</Label>
                  <p className="text-sm font-medium line-clamp-2">{opportunity.title}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Notice ID</Label>
                  <p className="text-sm font-mono">{opportunity.id}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Department</Label>
                  <p className="text-sm">{opportunity.department || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">NAICS Code</Label>
                  <p className="text-sm">{opportunity.ncode || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Type</Label>
                  <Badge variant="secondary">{opportunity.type || 'N/A'}</Badge>
                </div>
                <div>
                  <Label className="text-sm text-muted-foreground">Closing Date</Label>
                  <p className="text-sm">
                    {opportunity.closingDate
                      ? format(new Date(opportunity.closingDate), 'PPP')
                      : 'N/A'}
                  </p>
                </div>

                {targetPrice && (
                  <>
                    <Separator />
                    <div>
                      <Label className="text-sm text-muted-foreground">Your Target Price</Label>
                      <p className="text-sm font-semibold">${parseFloat(targetPrice).toFixed(2)}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Main Content Area */}
          <div className="min-w-0">
            {!negotiationSession && !showVendorSelection ? (
              // Initial setup card
              <Card className="cf-card">
                <CardHeader>
                  <CardTitle className="cf-h2">Start Bidding Process</CardTitle>
                  <CardDescription>
                    Set your target price and requirements to begin automated supplier negotiations
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="targetPrice">
                        Target Price ($) *
                        <span className="text-xs text-muted-foreground ml-2">
                          This will not be revealed to suppliers
                        </span>
                      </Label>
                      <div className="relative">
                        <Input
                          id="targetPrice"
                          type="number"
                          placeholder={loadingEstimate ? 'AI is estimating a target...' : 'Enter your maximum budget'}
                          value={targetPrice}
                          onChange={(e) => {
                            setTargetPrice(e.target.value);
                            setEstimatedByAi(false);
                          }}
                          step="0.01"
                          min="0"
                          disabled={loadingEstimate}
                          className={loadingEstimate ? 'pr-10' : estimatedByAi ? 'pr-28' : ''}
                        />
                        {loadingEstimate && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            <Icons.spinner className="h-4 w-4 animate-spin text-muted-foreground" />
                          </div>
                        )}
                        {estimatedByAi && !loadingEstimate && (
                          <Badge variant="secondary" className="absolute right-2 top-1/2 -translate-y-1/2 text-xs gap-1">
                            <Sparkles className="h-3 w-3" />
                            AI Estimated
                          </Badge>
                        )}
                      </div>
                      {estimatedByAi && aiPriceReasoning && (
                        <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                          {aiPriceReasoning}
                        </p>
                      )}
                    </div>

                    <div>
                      <Label htmlFor="requirements">
                        Additional Requirements
                        <span className="text-xs text-muted-foreground ml-2">
                          (Optional - specific needs, certifications, etc.)
                        </span>
                      </Label>
                      <Textarea
                        id="requirements"
                        placeholder="Enter any specific requirements or preferences..."
                        value={additionalRequirements}
                        onChange={(e) => setAdditionalRequirements(e.target.value)}
                        rows={4}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-end gap-3">
                    <Button
                      variant="outline"
                      onClick={() => router.back()}
                      disabled={loadingAiSuppliers}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={fetchAiSuppliers}
                      disabled={loadingAiSuppliers || !targetPrice}
                    >
                      {loadingAiSuppliers ? (
                        <>
                          <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                          Finding Vendors...
                        </>
                      ) : (
                        <>
                          <Icons.arrowRight className="mr-2 h-4 w-4" />
                          Find Vendors
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : !negotiationSession && showVendorSelection ? (
              // Vendor selection card
              <Card className="cf-card">
                <CardHeader>
                  <CardTitle className="cf-h2">Select Vendors</CardTitle>
                  <CardDescription>
                    Review AI-suggested vendors and add your own. Select the vendors you want to contact.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {error && (
                    <Alert variant="destructive">
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}

                  {/* AI-Suggested Vendors */}
                  <div className="space-y-3">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <Building2 className="h-4 w-4" />
                      AI-Suggested Vendors ({aiSuppliers.filter(s => s.selected).length} selected)
                    </Label>
                    <div className="space-y-2 border rounded-lg p-4 bg-muted/30">
                      {aiSuppliers.map((supplier, idx) => (
                        <div
                          key={idx}
                          className={`flex items-center justify-between p-3 rounded-md border transition-colors ${supplier.selected ? 'bg-primary/5 border-primary/30' : 'bg-background'
                            }`}
                        >
                          <div className="flex items-center gap-3">
                            <Checkbox
                              checked={supplier.selected}
                              onCheckedChange={() => toggleAiSupplier(idx)}
                            />
                            <div>
                              <p className="font-medium">{supplier.name}</p>
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {supplier.email}
                              </p>
                            </div>
                          </div>
                          <Badge variant="secondary">AI Suggested</Badge>
                        </div>
                      ))}
                    </div>
                  </div>

                  <Separator />

                  {preferredVendors.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-base font-semibold">Preferred vendors</Label>
                      <p className="text-sm text-muted-foreground">Saved from earlier bids. Adding one includes them in this RFQ. It does not send email yet.</p>
                      <div className="flex flex-wrap gap-2">
                        {preferredVendors.map((vendor) => (
                          <Button key={vendor.email} type="button" variant="outline" size="sm" onClick={() => {
                            const email = vendor.email.trim().toLowerCase();
                            const already = manualVendors.some((item) => item.email.trim().toLowerCase() === email)
                              || aiSuppliers.some((item) => item.selected && item.email.trim().toLowerCase() === email);
                            if (already) {
                              setError("That vendor is already included.");
                              return;
                            }
                            setManualVendors((current) => [...current, {
                              id: `preferred-${email}`,
                              name: vendor.name,
                              email: vendor.email,
                              notes: "",
                            }]);
                            setError(null);
                          }}>
                            Add {vendor.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Manual Vendor Input */}
                  <div className="space-y-3">
                    <Label className="text-base font-semibold flex items-center gap-2">
                      <Plus className="h-4 w-4" />
                      Add Vendor Manually
                    </Label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor="vendorName" className="text-sm">Vendor Name *</Label>
                        <Input
                          id="vendorName"
                          placeholder="Company name"
                          value={newVendorName}
                          onChange={(e) => setNewVendorName(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="vendorEmail" className="text-sm">Email Address *</Label>
                        <Input
                          id="vendorEmail"
                          type="email"
                          placeholder="sales@company.com"
                          value={newVendorEmail}
                          onChange={(e) => setNewVendorEmail(e.target.value)}
                        />
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="vendorNotes" className="text-sm">Notes (optional)</Label>
                      <Input
                        id="vendorNotes"
                        placeholder="Any specific instructions for this vendor..."
                        value={newVendorNotes}
                        onChange={(e) => setNewVendorNotes(e.target.value)}
                      />
                    </div>
                    <Button
                      variant="outline"
                      onClick={addManualVendor}
                      disabled={!newVendorName.trim() || !newVendorEmail.trim()}
                      className="w-full"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Vendor
                    </Button>
                  </div>

                  {/* Manually Added Vendors List */}
                  {manualVendors.length > 0 && (
                    <div className="space-y-3">
                      <Label className="text-base font-semibold">
                        Manually Added Vendors ({manualVendors.length})
                      </Label>
                      <div className="space-y-2 border rounded-lg p-4">
                        {manualVendors.map((vendor) => (
                          <div
                            key={vendor.id}
                            className="flex items-center justify-between p-3 rounded-md bg-green-50 border border-green-200"
                          >
                            <div>
                              <p className="font-medium">{vendor.name}</p>
                              <p className="text-sm text-muted-foreground flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                {vendor.email}
                              </p>
                              {vendor.notes && (
                                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                  <StickyNote className="h-3 w-3" />
                                  {vendor.notes}
                                </p>
                              )}
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => removeManualVendor(vendor.id)}
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  <Alert>
                    <AlertDescription>
                      <strong>Total vendors selected:</strong>{' '}
                      {aiSuppliers.filter(s => s.selected).length + manualVendors.length}
                      {aiSuppliers.filter(s => s.selected).length + manualVendors.length === 0 && (
                        <span className="text-destructive ml-2">
                          (Select at least one vendor to continue)
                        </span>
                      )}
                    </AlertDescription>
                  </Alert>

                  <div className="flex justify-between">
                    <Button
                      variant="outline"
                      onClick={backToSettings}
                      disabled={submitting}
                    >
                      <Icons.arrowRight className="mr-2 h-4 w-4 rotate-180" />
                      Back
                    </Button>
                    <Button
                      onClick={startNegotiation}
                      disabled={
                        submitting ||
                        (aiSuppliers.filter(s => s.selected).length === 0 && manualVendors.length === 0)
                      }
                    >
                      {submitting ? (
                        <>
                          <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                          Preparing Initial Messages...
                        </>
                      ) : (
                        <>
                          <Icons.arrowRight className="mr-2 h-4 w-4" />
                          Continue to Review Messages
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : showInitialReview ? (
              // Initial message review/edit
              <Card className="cf-card">
                <CardHeader>
                  <CardTitle className="cf-h2">Review Initial Messages</CardTitle>
                  <CardDescription>
                    Review and customize your initial request for quote before sending to suppliers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {initialMessages.length > 0 && (
                    <div className="space-y-4">
                      <div className="flex items-center justify-between mb-4">
                        <Badge variant="outline">
                          Supplier {currentInitialIndex + 1} of {initialMessages.length}
                        </Badge>
                        <div className="flex gap-2">
                          {initialMessages.map((_, idx) => (
                            <button
                              key={idx}
                              onClick={() => !sendingInitial && setCurrentInitialIndex(idx)}
                              className={`w-8 h-2 rounded-full transition-colors cursor-pointer hover:opacity-80 ${initialMessages[idx].sent
                                ? 'bg-green-500'
                                : idx === currentInitialIndex
                                  ? 'bg-primary'
                                  : 'bg-gray-300'
                                }`}
                              disabled={sendingInitial}
                              title={`Go to supplier ${idx + 1}`}
                            />
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Label className="text-base font-semibold">
                            To: {initialMessages[currentInitialIndex].supplier_name}
                          </Label>
                          {initialMessages[currentInitialIndex].is_manual && (
                            <Badge variant="outline" className="text-xs">Manual</Badge>
                          )}
                          {initialMessages[currentInitialIndex].sent && (
                            <Badge variant="default">Sent</Badge>
                          )}
                        </div>
                        {initialMessages[currentInitialIndex].supplier_email && (
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {initialMessages[currentInitialIndex].supplier_email}
                          </p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="initial-edit">
                          Your Message {initialMessages[currentInitialIndex].sent ? '(Already Sent)' : '(Edit as needed)'}
                        </Label>
                        <Textarea
                          id="initial-edit"
                          value={initialMessages[currentInitialIndex].edited_message || ''}
                          onChange={(e) => {
                            const newMessages = [...initialMessages];
                            newMessages[currentInitialIndex].edited_message = e.target.value;
                            setInitialMessages(newMessages);
                          }}
                          rows={16}
                          className="mt-2 font-mono text-sm"
                          placeholder="Edit your message here..."
                          disabled={initialMessages[currentInitialIndex].sent}
                        />
                      </div>

                      {!initialMessages[currentInitialIndex].sent && (
                        <Alert>
                          <AlertDescription>
                            This RFQ will be sent from your connected Gmail. Review the draft before sending it to the vendor.
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="mt-6 flex flex-wrap justify-between items-center gap-3">
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setCurrentInitialIndex(Math.max(0, currentInitialIndex - 1))}
                            disabled={currentInitialIndex === 0 || sendingInitial}
                          >
                            <Icons.arrowRight className="mr-2 h-4 w-4 rotate-180" />
                            Previous
                          </Button>
                          {currentInitialIndex < initialMessages.length - 1 && (
                            <Button
                              variant="outline"
                              onClick={() => setCurrentInitialIndex(currentInitialIndex + 1)}
                              disabled={sendingInitial}
                            >
                              Next
                              <Icons.arrowRight className="ml-2 h-4 w-4" />
                            </Button>
                          )}
                        </div>

                        <div className="flex gap-2">
                          {!initialMessages[currentInitialIndex].sent && (
                            <>
                              <Button
                                variant="ghost"
                                onClick={() => {
                                  const newMessages = [...initialMessages];
                                  newMessages[currentInitialIndex].edited_message =
                                    newMessages[currentInitialIndex].draft_message;
                                  setInitialMessages(newMessages);
                                }}
                                disabled={sendingInitial}
                              >
                                Reset to Default
                              </Button>
                              <Button
                                onClick={() => sendInitialMessage(
                                  initialMessages[currentInitialIndex].supplier_id,
                                  initialMessages[currentInitialIndex].edited_message ||
                                  initialMessages[currentInitialIndex].draft_message
                                )}
                                disabled={sendingInitial || !initialMessages[currentInitialIndex].edited_message?.trim()}
                              >
                                {sendingInitial ? (
                                  <>
                                    <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                                    Sending...
                                  </>
                                ) : currentInitialIndex === initialMessages.length - 1 ? (
                                  'Send & Start Negotiations'
                                ) : (
                                  'Send & Continue'
                                )}
                              </Button>
                            </>
                          )}
                        </div>
                      </div>

                      {initialMessages.some(m => !m.sent) && (
                        <div className="mt-4 text-center">
                          <Button
                            variant="secondary"
                            onClick={sendAllInitialMessages}
                            disabled={sendingInitial}
                          >
                            Send All Remaining Messages
                          </Button>
                        </div>
                      )}

                      {initialMessages.every(m => m.sent) && (
                        <div className="mt-4 text-center">
                          <Button
                            onClick={() => {
                              setShowInitialReview(false);
                              fetchNegotiationStatus();
                            }}
                          >
                            View Negotiations
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              // Negotiation tabs
              <Card className="cf-card">
                <CardHeader>
                  <CardTitle className="cf-h2">Negotiation in Progress</CardTitle>
                  <CardDescription>
                    Managing negotiations with {negotiationSession?.suppliers?.length ?? 0} suppliers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="0" className="w-full">
                    <ScrollableTabsList>
                      {negotiationSession?.suppliers?.map((supplier, idx) => {
                        const actionState = getSupplierActionState(supplier);
                        const hasPendingDraft = supplierDrafts.get(supplier.id)?.isPending;

                        return (
                          <TabsTrigger className="min-w-[132px] flex-none" key={supplier.id} value={idx.toString()}>
                            <div className="text-center relative">
                              {hasPendingDraft && (
                                <div className="absolute -top-1 -right-1 w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                              )}
                              <div className="text-xs truncate max-w-[100px]">
                                {supplier.company_name}
                              </div>
                              <Badge
                                variant={
                                  supplier.status === 'completed' ? 'default' :
                                    hasPendingDraft ? 'destructive' :
                                      supplier.status === 'negotiating' ? 'secondary' :
                                        'outline'
                                }
                                className="mt-1 text-xs"
                              >
                                {hasPendingDraft ? 'Draft Ready' : supplier.status}
                              </Badge>
                            </div>
                          </TabsTrigger>
                        );
                      })}
                    </ScrollableTabsList>

                    {negotiationSession?.suppliers?.map((supplier, idx) => {
                      const gmail = supplier.gmail_negotiation;
                      const gmailHistory = gmail && (
                          <Card className="cf-card">
                            <CardHeader>
                              <CardTitle>{supplier.company_name}</CardTitle>
                              <CardDescription>Latest quote: {formatMoney(gmail.latest_price)}</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                              <Link href={`/bids/${gmail.bid_id}#bid-emails`} className="cf-btn cf-btn-secondary">Open bid email conversation</Link>
                              {supplier.status !== "completed" && gmail.latest_price != null && (
                                <Button variant="outline" onClick={() => acceptQuote(supplier.id)}>
                                  Accept {formatMoney(gmail.latest_price)} offer
                                </Button>
                              )}
                              {supplier.status !== "stopped" && supplier.status !== "completed" && gmail.rounds.length < 3 && (
                                <Button variant="outline" onClick={() => stopNegotiation(supplier.id)}>Stop negotiation</Button>
                              )}
                              <ol aria-label="Negotiation rounds" className="space-y-2">
                                {gmail.rounds.map((round) => (
                                  <li key={round.round_number}>
                                    Round {round.round_number} · {formatMoney(round.price)} · {round.status === "best_offer" ? "Best offer" : round.status === "stopped" ? "Stopped" : "Received"}
                                  </li>
                                ))}
                              </ol>
                              <ol aria-label="Negotiation messages" className="space-y-3">
                                {gmail.messages.map((message, index) => (
                                  <li key={index} className="rounded border p-3">
                                    <p className="text-sm font-medium">{message.sender === "supplier" ? "Vendor" : "Employee"} · {message.channel === "gmail" ? "Gmail" : "RFQ"}</p>
                                    <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                                  </li>
                                ))}
                              </ol>
                            </CardContent>
                          </Card>
                      );
                      const actionState = getSupplierActionState(supplier);
                      const hasPendingDraft = supplierDrafts.get(supplier.id)?.isPending;

                      return (
                        <TabsContent key={supplier.id} value={idx.toString()} className="space-y-4">
                          {gmailHistory}
                          {(!gmail || supplier.messages.length > 0) && <Card className="cf-card">
                            <CardHeader>
                              <div className="flex flex-wrap justify-between items-start gap-3">
                                <div>
                                  <CardTitle className="text-lg flex items-center gap-2">
                                    {gmail ? "RFQ channel" : supplier.company_name}
                                    {supplier.is_manual && (
                                      <Badge variant="outline" className="text-xs">Manual</Badge>
                                    )}
                                    {supplier.email_channel === "gmail" && <Badge variant="outline">Gmail</Badge>}
                                    {supplier.email_channel === "legacy" && <Badge variant="outline">Shared mailbox</Badge>}
                                  </CardTitle>
                                  {supplier.email && (
                                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                      <Mail className="h-3 w-3" />
                                      {supplier.email}
                                    </p>
                                  )}
                                  {supplier.email_channel === "gmail" && supplier.bid_id && (
                                    <Link href={`/bids/${supplier.bid_id}#bid-emails`} className="text-sm text-primary underline">
                                      Open bid email conversation
                                    </Link>
                                  )}
                                </div>
                                <div className="flex gap-2">
                                  {hasPendingDraft && (
                                    <Badge variant="destructive" className="animate-pulse">
                                      Unsent Draft
                                    </Badge>
                                  )}
                                  <Badge variant={
                                    supplier.status === 'completed' ? 'default' :
                                      supplier.status === 'negotiating' ? 'secondary' :
                                        'outline'
                                  }>
                                    {supplier.status === 'stopped' ? 'Stopped' : supplier.negotiation_round >= 3 ? 'Best offer' : `Round ${supplier.negotiation_round}/3`}
                                  </Badge>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <ScrollArea className="pr-3 [&_[data-radix-scroll-area-viewport]]:max-h-80">
                                <div className="space-y-4">
                                  {supplier.messages.length === 0 && (
                                    <Alert>
                                      <AlertDescription>
                                        No messages yet. Send your initial request to start the negotiation.
                                      </AlertDescription>
                                    </Alert>
                                  )}
                                  {supplier.messages.map((message, msgIdx) => (
                                    <div key={msgIdx}>
                                      <div className={`p-4 rounded-lg ${message.sender === 'buyer'
                                        ? 'bg-primary/10 ml-8'
                                        : 'bg-secondary/30 mr-8'
                                        }`}>
                                        <div className="flex justify-between items-start mb-2">
                                          <span className="font-semibold text-sm">
                                            {message.sender === 'buyer' ? 'You' : supplier.company_name}
                                          </span>
                                          {message.price_mentioned && (
                                            <Badge variant="outline" className="text-xs">
                                              ${message.price_mentioned.toFixed(2)}
                                            </Badge>
                                          )}
                                        </div>
                                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </ScrollArea>

                              <Separator className="my-4" />

                              <div className="flex flex-wrap justify-between items-center gap-2">
                                {/* Action buttons based on state */}
                                {actionState.type === 'completed' && supplier.metrics && (
                                  <Card className="p-3 bg-success/10 w-full">
                                    <div className="text-xs space-y-1">
                                      <div>Initial Quote: ${supplier.metrics.initial_price}</div>
                                      <div>Final Quote: ${supplier.metrics.final_price}</div>
                                      <div className="font-semibold text-success">
                                        Saved: ${supplier.metrics.savings} ({supplier.metrics.savings_percent}%)
                                      </div>
                                    </div>
                                  </Card>
                                )}

                                {actionState.type === 'draft_pending' && (
                                  <>
                                    <Alert className="flex-1">
                                      <AlertDescription>
                                        You have an unsent draft response. Review and send it to continue.
                                      </AlertDescription>
                                    </Alert>
                                    <Button
                                      onClick={() => openDraft(supplier.id)}
                                      variant="default"
                                      size="sm"
                                    >
                                      Review & Send Draft
                                    </Button>
                                  </>
                                )}

                                {actionState.type === 'awaiting_response' && (
                                  <>
                                    <div className="flex items-center gap-2 flex-1">
                                      <Mail className="h-4 w-4 text-muted-foreground animate-pulse" />
                                      <span className="text-sm text-muted-foreground">
                                        {supplier.email_sent
                                          ? 'Waiting for vendor to reply by email...'
                                          : 'Waiting for supplier response...'}
                                      </span>
                                    </div>
                                    <Button
                                      onClick={() => getSupplierResponse(supplier.id)}
                                      variant="outline"
                                      size="sm"
                                      disabled={gettingResponse === supplier.id}
                                    >
                                      {gettingResponse === supplier.id ? (
                                        <>
                                          <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                                          Checking Inbox...
                                        </>
                                      ) : (
                                        'Check for Response'
                                      )}
                                    </Button>
                                  </>
                                )}

                                {actionState.type === 'need_draft' && (
                                  <>
                                    <Alert className="min-w-0 basis-56 flex-1" variant="default">
                                      <AlertDescription>
                                        Supplier has responded. Generate your counter-offer.
                                      </AlertDescription>
                                    </Alert>
                                    <Button
                                      onClick={() => generateDraftResponse(supplier.id)}
                                      variant="default"
                                      size="sm"
                                      disabled={generatingDraft === supplier.id}
                                    >
                                      {generatingDraft === supplier.id ? (
                                        <>
                                          <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                                          Generating...
                                        </>
                                      ) : (
                                        'Generate Response'
                                      )}
                                    </Button>
                                  </>
                                )}

                                {actionState.type === 'ready' && (
                                  <Button
                                    onClick={() => getSupplierResponse(supplier.id)}
                                    variant="default"
                                    size="sm"
                                    disabled={gettingResponse === supplier.id}
                                  >
                                    {gettingResponse === supplier.id ? (
                                      <>
                                        <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                                        Getting Response...
                                      </>
                                    ) : (
                                      'Get Supplier Response'
                                    )}
                                  </Button>
                                )}

                                {actionState.type === 'stopped' && (
                                  <Alert className="min-w-0 basis-56 flex-1">
                                    <AlertDescription>
                                      Negotiation stopped. Further vendor emails stay in the thread and do not open another round.
                                    </AlertDescription>
                                  </Alert>
                                )}

                                {actionState.type === 'best_offer' && (
                                  <Alert className="min-w-0 basis-56 flex-1">
                                    <AlertDescription>
                                      The third reply is the best offer. This negotiation is closed.
                                    </AlertDescription>
                                  </Alert>
                                )}

                                {!gmail && supplier.status !== 'completed' && supplier.status !== 'stopped' && supplier.negotiation_round < 3
                                  && (supplier.email_sent || supplier.messages.length > 0) && (
                                  <Button
                                    onClick={() => stopNegotiation(supplier.id)}
                                    variant="outline"
                                    size="sm"
                                  >
                                    Stop negotiation
                                  </Button>
                                )}

                                {supplier.status === 'negotiating' && supplier.messages.length > 0 && (
                                  <div className="flex flex-col items-start gap-1">
                                    <Button
                                      onClick={() => acceptQuote(supplier.id)}
                                      variant="outline"
                                      size="sm"
                                    >
                                      Accept latest vendor quote
                                    </Button>
                                    <p className="max-w-xs text-xs text-slate-600">
                                      Records this supplier quote only. The customer award is recorded later in Award Tracking.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>}
                        </TabsContent>
                      );
                    })}
                  </Tabs>

                  {/* Review Button */}
                  {negotiationSession?.suppliers?.some(s => s.status === 'completed' || s.messages.length > 0) && (
                    <div className="mt-6 flex justify-end">
                      <Button onClick={openReviewSection} disabled={loadingRecommendations || loadingCompliance}>
                        {loadingRecommendations || loadingCompliance ? (
                          <>
                            <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                            Analyzing...
                          </>
                        ) : (
                          <>
                            <Trophy className="mr-2 h-4 w-4" />
                            Review & Compare Vendors
                          </>
                        )}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Review & Submission Section */}
            {showReviewSection && negotiationSession && (
              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-primary" />
                    Review & Submit Bid
                  </CardTitle>
                  <CardDescription>
                    Compare vendor offers, verify compliance, and submit your bid
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Vendor Comparison Table */}
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Vendor Comparison</h3>
                    <div className="cf-table-scroll rounded-lg border" role="region" aria-label="Vendor comparison table" tabIndex={0}>
                      <table className="cf-table min-w-[560px]">
                        <thead className="bg-muted">
                          <tr>
                            <th className="px-4 py-3 text-left text-sm font-medium">Select</th>
                            <th className="px-4 py-3 text-left text-sm font-medium">Vendor</th>
                            <th className="px-4 py-3 text-left text-sm font-medium">Price</th>
                            <th className="px-4 py-3 text-left text-sm font-medium">Status</th>
                            <th className="px-4 py-3 text-left text-sm font-medium">Score</th>
                            <th className="px-4 py-3 text-left text-sm font-medium">Compliance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {negotiationSession?.suppliers?.map((supplier) => {
                            const score = recommendations?.vendor_scores?.find(s => s.vendor_id === supplier.id);
                            const compliance = complianceResults.get(supplier.id);
                            const isRecommended = recommendations?.best_vendor === supplier.company_name;
                            const price = supplier.metrics?.final_price ||
                              supplier.messages?.filter(m => m.sender === 'supplier' && m.price_mentioned).pop()?.price_mentioned;

                            return (
                              <tr
                                key={supplier.id}
                                className={`border-t ${selectedVendorForBid === supplier.id ? 'bg-primary/5' : ''} ${isRecommended ? 'bg-green-50' : ''}`}
                              >
                                <td className="px-4 py-3">
                                  <Checkbox
                                    aria-label={"Select " + supplier.company_name}
                                    checked={selectedVendorForBid === supplier.id}
                                    onCheckedChange={(checked) => setSelectedVendorForBid(checked ? supplier.id : null)}
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium">{supplier.company_name}</span>
                                    {isRecommended && (
                                      <Badge className="bg-green-100 text-green-700 border-green-300">
                                        <Star className="h-3 w-3 mr-1" /> Recommended
                                      </Badge>
                                    )}
                                    {supplier.is_manual && (
                                      <Badge variant="outline" className="text-xs">Manual</Badge>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3">
                                  {price ? (
                                    <span className="font-semibold text-green-600">${parseFloat(String(price)).toFixed(2)}</span>
                                  ) : (
                                    <span className="text-muted-foreground">Pending</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  <Badge variant={supplier.status === 'completed' ? 'default' : 'secondary'}>
                                    {supplier.status}
                                  </Badge>
                                </td>
                                <td className="px-4 py-3">
                                  {score ? (
                                    <div className="flex items-center gap-2">
                                      <Progress value={score.overall_score} className="w-16 h-2" />
                                      <span className="text-sm">{score.overall_score}%</span>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">N/A</span>
                                  )}
                                </td>
                                <td className="px-4 py-3">
                                  {compliance ? (
                                    <div className="flex items-center gap-1">
                                      {compliance.overall_status === 'compliant' ? (
                                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                                      ) : compliance.overall_status === 'needs_review' ? (
                                        <AlertTriangle className="h-4 w-4 text-yellow-500" />
                                      ) : (
                                        <AlertTriangle className="h-4 w-4 text-red-500" />
                                      )}
                                      <span className="text-sm">{compliance.compliance_score}%</span>
                                    </div>
                                  ) : (
                                    <Icons.spinner className="h-4 w-4 animate-spin" />
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* AI Recommendations */}
                  {recommendations && (
                    <div className="grid gap-4 md:grid-cols-2">
                      <Card className="bg-green-50 border-green-200">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <Star className="h-4 w-4 text-green-600" />
                            AI Recommendation
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="font-semibold text-green-700">{recommendations.best_vendor}</p>
                          <p className="text-sm text-muted-foreground mt-1">{recommendations.recommendation_reasoning}</p>
                          {recommendations.savings_potential && (
                            <p className="text-sm font-medium text-green-600 mt-2">
                              Potential Savings: {recommendations.savings_potential}
                            </p>
                          )}
                        </CardContent>
                      </Card>

                      <Card className="cf-card">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-yellow-600" />
                            Risk Factors
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          {Array.isArray(recommendations.risk_factors) && recommendations.risk_factors.length > 0 ? (
                            <ul className="text-sm space-y-1">
                              {recommendations.risk_factors.map((risk, idx) => (
                                <li key={idx} className="flex items-start gap-2">
                                  <span className="text-yellow-600">•</span>
                                  <span>{risk}</span>
                                </li>
                              ))}
                            </ul>
                          ) : typeof recommendations.risk_factors === 'string' && recommendations.risk_factors ? (
                            <p className="text-sm">{recommendations.risk_factors}</p>
                          ) : (
                            <p className="text-sm text-muted-foreground">No significant risks identified</p>
                          )}
                        </CardContent>
                      </Card>
                    </div>
                  )}

                  {!bidSubmitted && (
                    <Card className="cf-card">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base">Submission financials</CardTitle>
                        <CardDescription>
                          Enter the customer-facing amount AMAFHH will submit. It is kept separate from the selected vendor&apos;s cost.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <Label>Selected supplier cost</Label>
                            <div className="h-10 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                              {selectedSupplierCost === null
                                ? 'Select a vendor with a final quote'
                                : `$${selectedSupplierCost.toFixed(2)}`}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="customer-submitted-price">
                              Submitted price / gross sale <span className="text-destructive">*</span>
                            </Label>
                            <Input
                              id="customer-submitted-price"
                              type="number"
                              min="0"
                              step="0.01"
                              value={customerSubmittedPrice}
                              onChange={(event) => setCustomerSubmittedPrice(event.target.value)}
                              placeholder="Customer-facing bid amount"
                            />
                          </div>
                        </div>

                        {previewGrossProfit !== null && (
                          <div className="text-sm">
                            Gross profit:{' '}
                            <span className={previewGrossProfit < 0 ? 'font-semibold text-destructive' : 'font-semibold text-green-700'}>
                              ${previewGrossProfit.toFixed(2)}
                            </span>
                          </div>
                        )}

                        {previewGrossProfit !== null && previewGrossProfit < 0 && (
                          <Alert variant="destructive">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription>
                              Warning: the submitted price is below the selected supplier cost and will produce a negative gross profit.
                            </AlertDescription>
                          </Alert>
                        )}
                      </CardContent>
                    </Card>
                  )}

                  {/* Compliance Details for Selected Vendor */}
                  {selectedVendorForBid && complianceResults.get(selectedVendorForBid) && (
                    <Card className="cf-card">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-primary" />
                          Compliance Details - {negotiationSession.suppliers.find(s => s.id === selectedVendorForBid)?.company_name}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          {complianceResults.get(selectedVendorForBid)?.checks.map((check, idx) => (
                            <div key={idx} className="flex items-center justify-between py-2 border-b last:border-0">
                              <div>
                                <p className="font-medium text-sm">{check.name}</p>
                                <p className="text-xs text-muted-foreground">{check.details}</p>
                              </div>
                              <Badge
                                variant={check.status === 'passed' ? 'default' : check.status === 'warning' ? 'secondary' : 'destructive'}
                                className={check.status === 'passed' ? 'bg-green-100 text-green-700' : ''}
                              >
                                {check.status === 'passed' ? '✓' : check.status === 'warning' ? '⚠' : '✗'} {check.status}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Action Buttons */}
                  <Separator />

                  {bidSubmitted ? (
                    <Alert className="bg-green-50 border-green-200">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-700">
                        Your bid has been submitted successfully! You can track its status on the dashboard.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="flex flex-wrap justify-between items-center gap-3">
                      <Button
                        variant="outline"
                        onClick={() => setShowReviewSection(false)}
                      >
                        Back to Negotiations
                      </Button>

                      <div className="flex flex-wrap gap-3">
                        <Button
                          variant="outline"
                          onClick={generateBidPackage}
                          disabled={!selectedVendorForBid || generatingPdf}
                        >
                          {generatingPdf ? (
                            <>
                              <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>
                              <FileDown className="mr-2 h-4 w-4" />
                              Download Bid Package
                            </>
                          )}
                        </Button>

                        <Button
                          onClick={submitBid}
                          disabled={
                            !selectedVendorForBid ||
                            selectedSupplierCost === null ||
                            submittingBid ||
                            !hasValidCustomerSubmittedPrice
                          }
                        >
                          {submittingBid ? (
                            <>
                              <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                              Submitting...
                            </>
                          ) : (
                            <>
                              <Send className="mr-2 h-4 w-4" />
                              Submit Bid
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Draft Response Modal */}
        <Dialog open={draftModalOpen} onOpenChange={(open) => {
          if (!open && currentDraft?.isPending) {
            // Save the edited draft when closing
            if (currentSupplierId) {
              setSupplierDrafts(prev => {
                const newMap = new Map(prev);
                const draft = newMap.get(currentSupplierId);
                if (draft) {
                  newMap.set(currentSupplierId, draft);
                }
                return newMap;
              });
            }
          }
          setDraftModalOpen(open);
        }}>
          <DialogContent className="cf-workspace max-h-[80vh] w-[calc(100%-2rem)] max-w-3xl overflow-y-auto rounded-xl break-words">
            <DialogHeader>
              <DialogTitle>Review & Edit Your Response</DialogTitle>
              <DialogDescription>
                {currentDraft?.draftInfo && (
                  <span>
                    Round {currentDraft.draftInfo.round} of negotiation
                    {currentDraft.draftInfo.is_final_round && ' (Final Round)'}
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>

            {sendFailure}
            {currentDraft && (
              <div className="space-y-4 py-4">
                <div>
                  <Label className="text-sm text-muted-foreground mb-2">
                    AI-Generated Draft Response
                  </Label>
                  <div className="p-3 bg-muted rounded-md max-h-48 overflow-y-auto">
                    <p className="text-sm whitespace-pre-wrap">{currentDraft.draft}</p>
                  </div>
                </div>

                <div>
                  <Label htmlFor="edited-draft">
                    Your Response (Edit as needed)
                  </Label>
                  <Textarea
                    id="edited-draft"
                    value={currentDraft.editedDraft}
                    onChange={(e) => {
                      if (currentSupplierId) {
                        setSupplierDrafts(prev => {
                          const newMap = new Map(prev);
                          const draft = newMap.get(currentSupplierId);
                          if (draft) {
                            newMap.set(currentSupplierId, {
                              ...draft,
                              editedDraft: e.target.value
                            });
                          }
                          return newMap;
                        });
                      }
                    }}
                    rows={12}
                    className="mt-2"
                    placeholder="Edit your response here..."
                  />
                </div>

                <Alert>
                  <AlertDescription>
                    Review the response carefully. You can save and come back to edit later, or send it now.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDraftModalOpen(false)}
                disabled={sendingResponse}
              >
                Save & Close
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  if (currentSupplierId && currentDraft) {
                    setSupplierDrafts(prev => {
                      const newMap = new Map(prev);
                      newMap.set(currentSupplierId, {
                        ...currentDraft,
                        editedDraft: currentDraft.draft
                      });
                      return newMap;
                    });
                  }
                }}
                disabled={sendingResponse}
              >
                Reset to Draft
              </Button>
              <Button
                onClick={sendEditedResponse}
                disabled={sendingResponse || !currentDraft?.editedDraft.trim()}
              >
                {sendingResponse ? (
                  <>
                    <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send Response'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageMain>
    </>
  );
}
