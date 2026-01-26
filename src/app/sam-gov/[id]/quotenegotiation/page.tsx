'use client';

import { useEffect, useState } from 'react';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { format } from 'date-fns';
import { Plus, Trash2, Building2, Mail, StickyNote, Trophy, ShieldCheck, FileDown, Send, AlertTriangle, CheckCircle2, Star } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

interface Supplier {
  id: number;
  company_name: string;
  email?: string;
  notes?: string;
  is_manual?: boolean;
  status: string;
  negotiation_round: number;
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

  // State for initial message review
  const [showInitialReview, setShowInitialReview] = useState(false);
  const [initialMessages, setInitialMessages] = useState<InitialMessage[]>([]);
  const [currentInitialIndex, setCurrentInitialIndex] = useState(0);
  const [sendingInitial, setSendingInitial] = useState(false);

  // State for draft editing during negotiation - IMPROVED
  const [supplierDrafts, setSupplierDrafts] = useState<Map<number, SupplierDraft>>(new Map());
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

  useEffect(() => {
    if (!opportunityId) return
    fetchOpportunityDetails();
    checkExistingSession();
  }, [opportunityId]);

  // Check if there's an existing negotiation session for this opportunity
  const checkExistingSession = async () => {
    try {
      const response = await fetch('/api/sam-gov/sessions', {
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
          const sessionResponse = await fetch(`/api/sam-gov/negotiate/${existingSession.id}`, {
            cache: 'no-store',
          });
          if (sessionResponse.ok) {
            const sessionData = await sessionResponse.json();
            setNegotiationSession(sessionData);

            // Auto-check for responses for pending suppliers who have messages sent
            autoCheckPendingSuppliers(sessionData);
          }
        }
      }
    } catch (err) {
      console.error('Error checking for existing session:', err);
    }
  };

  // Automatically check for responses for pending suppliers
  const autoCheckPendingSuppliers = async (session: NegotiationSession) => {
    if (!session?.suppliers) return;

    // Find suppliers that are pending and have buyer messages (initial message sent)
    const pendingWithMessages = session.suppliers.filter(
      s => s.status === 'pending' && s.messages?.some(m => m.sender === 'buyer')
    );

    // Auto-trigger response check for each pending supplier (with delay to not overwhelm)
    for (const supplier of pendingWithMessages) {
      try {
        await fetch(
          `/api/sam-gov/negotiate/${session.id}/get-supplier-response/${supplier.id}`,
          { method: 'POST' }
        );
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        console.error(`Failed to auto-check response for supplier ${supplier.id}:`, err);
      }
    }

    // Refresh session data after checking
    if (pendingWithMessages.length > 0) {
      const refreshResponse = await fetch(`/api/sam-gov/negotiate/${session.id}`);
      if (refreshResponse.ok) {
        const refreshedData = await refreshResponse.json();
        setNegotiationSession(refreshedData);
      }
    }
  };

  useEffect(() => {
    // Only auto-fetch if:
    // 1. We have a negotiation session
    // 2. We're not in initial review mode
    // 3. All initial messages have been sent
    if (negotiationSession && !showInitialReview) {
      const needsInitialMessages = initialMessages.length > 0 && initialMessages.some(m => !m.sent);

      if (!needsInitialMessages) {
        const interval = setInterval(fetchNegotiationStatus, 5000);
        return () => clearInterval(interval);
      }
    }
  }, [negotiationSession, showInitialReview, initialMessages]);

  const fetchOpportunityDetails = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/sam-gov`);
      const allOpportunities = await response.json();
      const foundOpportunity = allOpportunities.find((opp: any) => opp.id === opportunityId);

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
      const response = await fetch('/api/sam-gov/negotiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunity: parsedData,
          targetPrice: parseFloat(targetPrice),
          additionalRequirements,
          selectedAiSuppliers: selectedAiSuppliers.map(s => ({ name: s.name, email: s.email })),
          manualSuppliers: manualVendors.map(v => ({ name: v.name, email: v.email, notes: v.notes })),
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to start negotiation');
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
    } catch (err) {
      setError('Failed to start negotiation process');
    } finally {
      setSubmitting(false);
    }
  };

  const fetchNegotiationStatus = async () => {
    if (!negotiationSession) return;

    try {
      const response = await fetch(`/api/sam-gov/negotiate/${negotiationSession.id}`);
      const data = await response.json();
      setNegotiationSession(data);
    } catch (err) {
      console.error('Failed to fetch negotiation status:', err);
    }
  };

  const sendInitialMessage = async (supplierId: number, content: string) => {
    if (!negotiationSession) return;

    try {
      setSendingInitial(true);

      const response = await fetch(
        `/api/sam-gov/negotiate/${negotiationSession.id}/send-initial/${supplierId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to send initial message');
      }

      // Mark message as sent
      setInitialMessages(prev =>
        prev.map(msg =>
          msg.supplier_id === supplierId
            ? { ...msg, sent: true }
            : msg
        )
      );

      // Move to next supplier or complete
      if (currentInitialIndex < initialMessages.length - 1) {
        setCurrentInitialIndex(prev => prev + 1);
      } else {
        // All initial messages sent, refresh and show negotiation view
        setShowInitialReview(false);
        await fetchNegotiationStatus();
      }

    } catch (err) {
      console.error('Failed to send initial message:', err);
      setError('Failed to send initial message. Please try again.');
    } finally {
      setSendingInitial(false);
    }
  };

  const sendAllInitialMessages = async () => {
    for (let i = currentInitialIndex; i < initialMessages.length; i++) {
      const msg = initialMessages[i];
      if (!msg.sent) {
        await sendInitialMessage(msg.supplier_id, msg.edited_message || msg.draft_message);
      }
    }
  };

  // Get supplier response only (no draft generation)
  const getSupplierResponse = async (supplierId: number) => {
    try {
      setGettingResponse(supplierId);

      const response = await fetch(
        `/api/sam-gov/negotiate/${negotiationSession?.id}/respond/${supplierId}`,
        { method: 'POST' }
      );

      if (!response.ok) {
        throw new Error('Failed to get supplier response');
      }

      // Update the negotiation status to show the new supplier message
      await fetchNegotiationStatus();

    } catch (err) {
      console.error('Failed to get response:', err);
      setError('Failed to get supplier response. Please try again.');
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
        { method: 'POST' }
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

      const response = await fetch(
        `/api/sam-gov/negotiate/${negotiationSession.id}/send/${currentSupplierId}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: draft.editedDraft })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to send response');
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
      setError('Failed to send response. Please try again.');
    } finally {
      setSendingResponse(false);
    }
  };

  const acceptQuote = async (supplierId: number) => {
    try {
      await fetch(`/api/sam-gov/negotiate/${negotiationSession?.id}/accept/${supplierId}`, {
        method: 'POST',
      });
      fetchNegotiationStatus();
    } catch (err) {
      console.error('Failed to accept quote:', err);
    }
  };

  // Fetch AI recommendations
  const fetchRecommendations = async () => {
    if (!negotiationSession) return;

    setLoadingRecommendations(true);
    try {
      const response = await fetch(`/api/sam-gov/negotiate/${negotiationSession.id}/recommendations`);
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

    setGeneratingPdf(true);
    const selectedSupplier = negotiationSession.suppliers.find(s => s.id === selectedVendorForBid);
    if (!selectedSupplier) return;

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
            current_price: selectedSupplier.metrics?.final_price || selectedSupplier.messages?.find(m => m.price_mentioned)?.price_mentioned
          },
          compliance: compliance,
          negotiation: {
            round_count: selectedSupplier.negotiation_round,
            initial_price: parseFloat(selectedSupplier.metrics?.initial_price || '0'),
            final_price: parseFloat(selectedSupplier.metrics?.final_price || '0'),
            savings: parseFloat(selectedSupplier.metrics?.savings || '0'),
            savings_percent: parseFloat(selectedSupplier.metrics?.savings_percent || '0'),
            messages: selectedSupplier.messages
          }
        })
      });

      if (response.ok) {
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

    setSubmittingBid(true);
    const selectedSupplier = negotiationSession.suppliers.find(s => s.id === selectedVendorForBid);
    if (!selectedSupplier) return;

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
        finalPrice: selectedSupplier.metrics?.final_price,
        submittedAt: new Date().toISOString()
      };

      if (bidIndex !== -1) {
        existingBids[bidIndex] = { ...existingBids[bidIndex], ...bidData };
      } else {
        existingBids.push(bidData);
      }

      localStorage.setItem('ongoingBids', JSON.stringify(existingBids));

      // Update session status to bid_submitted
      if (negotiationSession) {
        try {
          await fetch(`/api/sam-gov/negotiate/${negotiationSession.id}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'bid_submitted' })
          });
        } catch (statusErr) {
          console.error('Failed to update session status:', statusErr);
        }
      }

      setBidSubmitted(true);

    } catch (err) {
      console.error('Failed to submit bid:', err);
      setError('Failed to submit bid. Please try again.');
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
      <div className="flex items-center justify-center min-h-screen">
        <Card>
          <CardHeader>
            <CardTitle>Opportunity Not Found</CardTitle>
          </CardHeader>
          <CardContent>
            <Button onClick={() => router.back()}>Go Back</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentDraft = currentSupplierId ? supplierDrafts.get(currentSupplierId) : null;

  return (
    <main className="flex-1 p-6 bg-gradient-to-br from-secondary/20 to-background">
      <div className="container mx-auto max-w-6xl">
        <Button
          onClick={() => router.back()}
          variant="outline"
          className="mb-6"
        >
          <Icons.arrowRight className="mr-2 h-4 w-4 rotate-180" />
          Back to Details
        </Button>

        <div className="grid gap-6 md:grid-cols-3">
          {/* Opportunity Summary */}
          <div className="md:col-span-1">
            <Card className="h-full">
              <CardHeader>
                <CardTitle className="text-lg">Opportunity Summary</CardTitle>
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
          <div className="md:col-span-2">
            {!negotiationSession && !showVendorSelection ? (
              // Initial setup card
              <Card>
                <CardHeader>
                  <CardTitle>Start Bidding Process</CardTitle>
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
                      <Input
                        id="targetPrice"
                        type="number"
                        placeholder="Enter your maximum budget"
                        value={targetPrice}
                        onChange={(e) => setTargetPrice(e.target.value)}
                        step="0.01"
                        min="0"
                      />
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

                  <div className="flex justify-end space-x-4">
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
              <Card>
                <CardHeader>
                  <CardTitle>Select Vendors</CardTitle>
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
              <Card>
                <CardHeader>
                  <CardTitle>Review Initial Messages</CardTitle>
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
                            This is your initial request for quote. Customize it for each supplier to get the best responses.
                          </AlertDescription>
                        </Alert>
                      )}

                      <div className="flex justify-between items-center mt-6">
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
              <Card>
                <CardHeader>
                  <CardTitle>Negotiation in Progress</CardTitle>
                  <CardDescription>
                    Managing negotiations with {negotiationSession.suppliers.length} suppliers
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="0" className="w-full">
                    <TabsList className="grid grid-cols-3 lg:grid-cols-5 mb-6">
                      {negotiationSession.suppliers.map((supplier, idx) => {
                        const actionState = getSupplierActionState(supplier);
                        const hasPendingDraft = supplierDrafts.get(supplier.id)?.isPending;

                        return (
                          <TabsTrigger key={supplier.id} value={idx.toString()}>
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
                    </TabsList>

                    {negotiationSession.suppliers.map((supplier, idx) => {
                      const actionState = getSupplierActionState(supplier);
                      const hasPendingDraft = supplierDrafts.get(supplier.id)?.isPending;

                      return (
                        <TabsContent key={supplier.id} value={idx.toString()}>
                          <Card>
                            <CardHeader>
                              <div className="flex justify-between items-start">
                                <div>
                                  <CardTitle className="text-lg flex items-center gap-2">
                                    {supplier.company_name}
                                    {supplier.is_manual && (
                                      <Badge variant="outline" className="text-xs">Manual</Badge>
                                    )}
                                  </CardTitle>
                                  {supplier.email && (
                                    <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                                      <Mail className="h-3 w-3" />
                                      {supplier.email}
                                    </p>
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
                                    Round {supplier.negotiation_round}/3
                                  </Badge>
                                </div>
                              </div>
                            </CardHeader>
                            <CardContent>
                              <ScrollArea className="h-[400px] pr-4">
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

                              <div className="flex justify-between items-center gap-2">
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
                                    <span className="text-sm text-muted-foreground">
                                      Waiting for supplier response...
                                    </span>
                                    <Button
                                      onClick={() => getSupplierResponse(supplier.id)}
                                      variant="outline"
                                      size="sm"
                                      disabled={gettingResponse === supplier.id}
                                    >
                                      {gettingResponse === supplier.id ? (
                                        <>
                                          <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                                          Checking...
                                        </>
                                      ) : (
                                        'Check for Response'
                                      )}
                                    </Button>
                                  </>
                                )}

                                {actionState.type === 'need_draft' && (
                                  <>
                                    <Alert className="flex-1" variant="default">
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

                                {supplier.status === 'negotiating' && supplier.messages.length > 0 && (
                                  <Button
                                    onClick={() => acceptQuote(supplier.id)}
                                    variant="outline"
                                    size="sm"
                                  >
                                    Accept Current Quote
                                  </Button>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        </TabsContent>
                      );
                    })}
                  </Tabs>

                  {/* Review Button */}
                  {negotiationSession.suppliers.some(s => s.status === 'completed' || s.messages.length > 0) && (
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
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full">
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
                          {negotiationSession.suppliers.map((supplier) => {
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
                                    checked={selectedVendorForBid === supplier.id}
                                    onCheckedChange={(checked) => setSelectedVendorForBid(checked ? supplier.id : null)}
                                  />
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2">
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

                      <Card>
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

                  {/* Compliance Details for Selected Vendor */}
                  {selectedVendorForBid && complianceResults.get(selectedVendorForBid) && (
                    <Card>
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
                    <div className="flex justify-between items-center">
                      <Button
                        variant="outline"
                        onClick={() => setShowReviewSection(false)}
                      >
                        Back to Negotiations
                      </Button>

                      <div className="flex gap-3">
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
                          disabled={!selectedVendorForBid || submittingBid}
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
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
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
      </div>
    </main>
  );
}