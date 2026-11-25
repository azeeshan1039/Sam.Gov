"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { BidStepper, PageMain } from "@/components/design/PageFrame";
import {
  BID_STATUSES,
  statusStyle,
  formatMoney,
  type BidConversationEvent,
  type BidStatus,
  type BidVendor,
  type BidWorkspace,
  type OutreachState,
  type PipelineItem,
} from "@/lib/pipeline";
import { AwardPanel } from "@/components/awards/AwardPanel";
import { BidEmailsPanel, type ComposeRequest } from "@/components/emails/BidEmailsPanel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const OUTREACH_LABEL: Record<OutreachState, string> = {
  suggested: "Suggested",
  contacted: "Contacted",
  responded: "Responded",
};

const ROUND_LABEL: Record<string, string> = {
  received: "Received",
  best_offer: "Best offer",
  stopped: "Stopped",
};

function outreachClass(state: OutreachState) {
  if (state === "responded") return "bg-emerald-100 text-emerald-800";
  if (state === "contacted") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-700";
}

/** A vendor someone typed in is not "suggested" by anyone until contacted; say so plainly. */
function outreachLabel(vendor: BidVendor) {
  if (vendor.outreach_state === "suggested" && vendor.is_manual) return "Not contacted yet";
  return OUTREACH_LABEL[vendor.outreach_state];
}

function easternTime(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("en-US", { timeZone: "America/New_York" }) : "—";
}

function dueStamp(value: string | null | undefined, days: number | null | undefined) {
  let when = "—";
  if (value) {
    const date = new Date(value.includes("T") ? value : `${value}T12:00:00Z`);
    when = Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(date).toUpperCase();
  }
  if (days == null) return when;
  return `${when} · ${days} DAY${days === 1 ? "" : "S"}`;
}

function roundHeading(round: number | null | undefined) {
  if (round === 0) return "Initial RFQ";
  if (round == null) return "After the negotiation closed";
  return `Round ${round}`;
}

type SavedText = { remarks: string; research: string; vendorNotes: Record<number, string> };

export default function BidDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bid, setBid] = useState<PipelineItem | null>(null);
  const [status, setStatus] = useState<BidStatus>("Finding Supplier");
  const [supplierCost, setSupplierCost] = useState("");
  const [submittedPrice, setSubmittedPrice] = useState("");
  const [remarks, setRemarks] = useState("");
  const [researchNotes, setResearchNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [vendorName, setVendorName] = useState("");
  const [vendorEmail, setVendorEmail] = useState("");
  const [vendorNote, setVendorNote] = useState("");
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [preferredPending, setPreferredPending] = useState<Record<number, boolean>>({});
  const [savingVendor, setSavingVendor] = useState(false);
  const [composeRequest, setComposeRequest] = useState<ComposeRequest | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<{ company_name: string; email: string }[] | null>(null);
  const [suggestionMessage, setSuggestionMessage] = useState<string | null>(null);
  // Last values loaded from the server. A reload only replaces a text box the employee has not
  // edited since, so saving one thing never erases unsaved typing somewhere else on the page.
  const saved = useRef<SavedText | null>(null);

  // KAN-77: email a vendor from its row through the employee's Gmail (Emails card below).
  function emailVendor(vendor: BidVendor) {
    if (!vendor.email) return;
    setComposeRequest({ to: vendor.email.trim().toLowerCase(), name: vendor.company_name, nonce: Date.now() });
    document.getElementById("bid-emails")?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    const current = getStoredUser();
    if (!current) router.replace("/register");
    else setUser(current);
  }, [router]);

  const load = useCallback(async (preserveStatusDraft = false) => {
    const response = await fetch(`/api/backend/pipeline/bids/${params.id}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Unable to load bid.");
      return;
    }
    const next: PipelineItem = data.bid;
    const previous = saved.current;
    const serverNotes: Record<number, string> = {};
    for (const vendor of next.workspace?.vendors || []) serverNotes[vendor.id] = vendor.notes || "";
    const fresh = { remarks: next.bid_remarks || "", research: next.research_notes || "", vendorNotes: serverNotes };
    setBid(next);
    if (!preserveStatusDraft) {
      setStatus(next.internal_status as BidStatus);
      setSupplierCost(next.supplier_cost?.toString() || "");
      setSubmittedPrice(next.submitted_price?.toString() || "");
    }
    setRemarks((current) => (!previous || current === previous.remarks ? fresh.remarks : current));
    setResearchNotes((current) => (!previous || current === previous.research ? fresh.research : current));
    setNoteDrafts((current) => {
      const merged: Record<number, string> = {};
      for (const [id, value] of Object.entries(serverNotes)) {
        const key = Number(id);
        const edited = previous && key in current && current[key] !== (previous.vendorNotes[key] ?? "");
        merged[key] = edited ? current[key] : value;
      }
      return merged;
    });
    setPreferredPending({});
    saved.current = fresh;
  }, [params.id]);

  useEffect(() => {
    if (user) load();
  }, [load, user]);

  async function saveStatus() {
    setMessage(null);
    const response = await fetch(`/api/backend/pipeline/bids/${params.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, supplier_cost: supplierCost, submitted_price: submittedPrice }),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to update status.");
    setMessage(data.warning || "Status updated.");
    await load();
  }

  async function addVendor(payload: { company_name: string; email: string; notes?: string; source?: "manual" | "ai_suggested" }) {
    setMessage(null);
    setSavingVendor(true);
    try {
      const response = await fetch(`/api/backend/pipeline/bids/${params.id}/vendors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) return setMessage(data.error || "Unable to add vendor.");
      if (payload.source === "ai_suggested") {
        setSuggestions((current) => (current || []).filter((item) => item.email !== payload.email));
      } else {
        setVendorName("");
        setVendorEmail("");
        setVendorNote("");
      }
      setMessage("Vendor added.");
      await load();
    } finally {
      setSavingVendor(false);
    }
  }

  async function suggestVendors() {
    setMessage(null);
    setSuggesting(true);
    try {
      const response = await fetch(`/api/backend/pipeline/bids/${params.id}/vendor-suggestions`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setSuggestions(null);
        return setMessage(data.error || "Unable to get AI suggestions.");
      }
      setSuggestions(data.suggestions || []);
      setSuggestionMessage(data.message || null);
    } finally {
      setSuggesting(false);
    }
  }

  async function updateVendor(vendor: BidVendor, body: { notes?: string; preferred?: boolean }) {
    setMessage(null);
    if (body.preferred !== undefined) {
      const preferred = body.preferred;
      setPreferredPending((current) => ({ ...current, [vendor.id]: preferred }));
    }
    const response = await fetch(`/api/backend/pipeline/bids/${params.id}/vendors/${vendor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Unable to update vendor.");
      await load();
      return;
    }
    if (body.notes !== undefined && saved.current) {
      // This note is now the saved value, so the reload below may refresh it.
      saved.current.vendorNotes[vendor.id] = noteDrafts[vendor.id] ?? "";
    }
    setMessage(body.preferred === undefined ? "Vendor note saved." : body.preferred ? "Marked preferred." : "Preferred removed.");
    await load();
  }

  async function stopVendor(vendor: BidVendor) {
    setMessage(null);
    const response = await fetch(`/api/backend/pipeline/bids/${params.id}/vendors/${vendor.id}/stop`, { method: "POST" });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to stop negotiation.");
    setMessage("Negotiation stopped.");
    await load();
  }

  async function saveNotes() {
    setMessage(null);
    setSavingNotes(true);
    try {
      const response = await fetch(`/api/backend/pipeline/bids/${params.id}/notes`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ remarks, research_notes: researchNotes }),
      });
      const data = await response.json();
      if (!response.ok) return setMessage(data.error || "Unable to save notes.");
      if (saved.current) {
        saved.current.remarks = remarks;
        saved.current.research = researchNotes;
      }
      setMessage("Notes saved.");
      await load();
    } finally {
      setSavingNotes(false);
    }
  }

  if (!bid) return <PageMain>{message || "Loading bid…"}</PageMain>;

  const agentCanEdit = user?.role === "admin" || (
    BID_STATUSES[bid.internal_status as BidStatus]?.classification === "active" &&
    bid.current_owner_user_id === user?.id
  );
  // Vendors, notes and negotiation: admins and the bid's current owner (older backends omit the flag).
  const canEdit = bid.can_edit_workspace !== false;
  const workspace: BidWorkspace = bid.workspace || {
    session_id: null,
    negotiation_status: null,
    rfq_href: null,
    vendors: [],
    negotiation_history: [],
    email_conversations: [],
    preferred_vendors: [],
  };
  const onBid = new Set(workspace.vendors.map((vendor) => (vendor.email || "").trim().toLowerCase()));
  const reusable = (workspace.preferred_vendors || []).filter((vendor) => !onBid.has(vendor.email));
  const notesUnsaved = Boolean(saved.current && (remarks !== saved.current.remarks || researchNotes !== saved.current.research));

  // Negotiation history grouped by vendor, then by round (KAN-81: each round's messages, price and outcome).
  const historyByVendor = new Map<number, { name: string; vendor?: BidVendor; rounds: Map<string, BidConversationEvent[]> }>();
  for (const event of workspace.negotiation_history) {
    const group = historyByVendor.get(event.supplier_id) || {
      name: event.supplier_name || "Vendor",
      vendor: workspace.vendors.find((v) => v.id === event.supplier_id),
      rounds: new Map<string, BidConversationEvent[]>(),
    };
    const key = event.round_number == null ? "closed" : String(event.round_number);
    group.rounds.set(key, [...(group.rounds.get(key) || []), event]);
    historyByVendor.set(event.supplier_id, group);
  }

  const daysLeft = bid.days_remaining;
  const deadlinePassed = daysLeft != null && daysLeft < 0 && bid.internal_status !== "Bid submitted" && bid.internal_status !== "Bid got removed";
  const sentBack = bid.internal_status === "Bid No Approved";
  const waiting = bid.internal_status === "Waiting Approval";
  const approved = bid.internal_status === "Approved for Submission";
  const submitted = bid.internal_status === "Bid submitted";
  const released = bid.internal_status === "Bid got removed";
  const priceShown = bid.submitted_price ?? bid.expected_submitted_price;
  const typedPrice = Number(submittedPrice);
  const approvedPrice = bid.expected_submitted_price;
  const priceDiffers = approved && approvedPrice != null && Number.isFinite(typedPrice) && submittedPrice.trim() !== "" && Math.abs(typedPrice - approvedPrice) > 0.009;
  const dueText = dueStamp(bid.due_date, daysLeft);
  const quoteStep = !waiting && !approved && !submitted && !released;
  const stepWhen = (next: string) => {
    const hit = (bid.status_history || []).find((event) => event.new_status === next);
    return hit ? `${hit.changed_by_name || "—"} · ${hit.changed_at_eastern}` : "—";
  };
  const awardCaptions = submitted ? [
    stepWhen("Finding Supplier"),
    bid.supplier_cost != null ? `${formatMoney(bid.supplier_cost)} · ${stepWhen("Waiting Approval")}` : stepWhen("Waiting Approval"),
    bid.approved_by_name ? stepWhen("Approved for Submission") : "—",
    `${formatMoney(bid.submitted_price)} · ${bid.submitted_at || "—"}`,
    "WAITING",
  ] : undefined;

  return (
    <>
      <section className="cf-band">
        <div className="cf-wrap cf-band-in">
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 320px", minWidth: 0 }}>
            <nav aria-label="Breadcrumb" className="cf-mono" style={{ fontSize: 12, color: "var(--cf-text-3)", display: "flex", gap: 8, letterSpacing: "0.04em" }}>
              <Link href={user?.role === "admin" ? "/bid-history" : "/my-bids"}>{user?.role === "admin" ? "PIPELINE" : "MY BIDS"}</Link>
              <span aria-hidden="true">/</span>
              <span>{bid.solicitation_number || bid.bid_id}</span>
            </nav>
            <h1 className="cf-h1" style={{ overflowWrap: "anywhere" }}>{bid.title || bid.bid_id}</h1>
            <div className="cf-mono" style={{ fontSize: 12, color: "var(--cf-text-2)", letterSpacing: "0.03em", overflowWrap: "anywhere" }}>
              {submitted
                ? `${bid.solicitation_number || bid.bid_id} · ${(bid.portal || "—").toUpperCase()}${bid.naics_code ? ` · NAICS ${bid.naics_code}` : ""}`
                : `${bid.solicitation_number || bid.bid_id} · ${(bid.portal || "—").toUpperCase()} · QTY — · DUE ${dueText}`}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "nowrap", gap: 12, alignItems: "center", flex: "none", alignSelf: "flex-end", marginLeft: "auto" }}>
            <span className="cf-pill" style={{ ...statusStyle(bid.internal_status), alignSelf: "center" }}>{bid.internal_status}</span>
            {bid.bid_url ? <a className="cf-btn cf-btn-secondary" href={bid.bid_url} target="_blank" rel="noreferrer" style={{ minHeight: 40 }}>View on SAM.gov ↗</a> : null}
          </div>
        </div>
      </section>
      <PageMain>
        <nav aria-label="On this page" className="flex flex-wrap items-center gap-4">
          {workspace.rfq_href && <Link className="cf-btn cf-btn-primary" href={workspace.rfq_href}>Open RFQ negotiation</Link>}
          {[["vendors", "Vendors"], ["negotiation", "Negotiation"], ["bid-emails", "Emails"], ["notes", "Remarks & notes"], ["history", "History"]].map(([id, label]) => (
            <a className="cf-link" key={id} href={"#" + id}>{label}</a>
          ))}
        </nav>
      <BidStepper status={bid.internal_status} captions={awardCaptions} />

      {deadlinePassed ? (
        <div className="cf-banner cf-banner-bad" role="alert">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, color: "#BE123C" }}>The response deadline has passed</div>
            <div style={{ color: "var(--cf-text-2)" }}>This bid can&apos;t be sent for approval anymore. Ask whether the agency extended the deadline before changing it.</div>
          </div>
        </div>
      ) : null}
      {sentBack ? (
        <div className="cf-banner cf-banner-warn" role="status">
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 500, color: "#B45309" }}>Sent back{bid.approved_by_name ? ` by ${bid.approved_by_name}` : ""}</div>
            <div style={{ color: "var(--cf-text-2)" }}>{bid.bid_remarks || "Update the quote and send it back for approval."}</div>
          </div>
        </div>
      ) : null}
      {message ? <div className="cf-err" role="alert">{message}</div> : null}
      {!canEdit ? (
        <div role="note" className="cf-banner" style={{ border: "1px solid var(--cf-line)", background: "var(--cf-surface-2)" }}>
          Read only: this bid now belongs to {bid.agent_name || "another employee"}. You can view it; only its current owner or an admin can change vendors, notes or emails.
        </div>
      ) : null}

      {submitted ? (
        <section aria-label="Financials" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: 16 }}>
          <div className="cf-card cf-fin"><div className="cf-lbl">Expected submitted</div><div className="cf-fin-v">{formatMoney(bid.expected_submitted_price)}</div></div>
          <div className="cf-card cf-fin"><div className="cf-lbl">Supplier cost</div><div className="cf-fin-v">{formatMoney(bid.supplier_cost)}</div></div>
          <div className="cf-card cf-fin cf-kpi-hero"><div className="cf-lbl" style={{ color: "#0E7490" }}>Submitted price</div><div className="cf-fin-v">{formatMoney(bid.submitted_price)}</div></div>
          <div className="cf-card cf-fin"><div className="cf-lbl">Gross profit</div><div className="cf-fin-v" style={{ color: bid.negative_profit_warning ? "#BE123C" : "#047857" }}>{formatMoney(bid.gross_profit)}</div></div>
          <div className="cf-card cf-fin"><div className="cf-lbl">Markup</div><div className="cf-fin-v">{bid.markup_percent == null ? "—" : `${bid.markup_percent.toFixed(2)}%`}</div></div>
        </section>
      ) : null}

      <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
        <div style={{ flex: "2 1 640px", minWidth: 0, display: "flex", flexDirection: "column", gap: 24 }}>
          {submitted ? <AwardPanel bidId={bid.id} onSaved={() => load()} /> : null}
          {released ? (
            <section className="cf-card" role="status" style={{ padding: "28px 24px", display: "flex", flexDirection: "column", gap: 14, alignItems: "flex-start" }}>
              <span className="cf-lbl">Released</span>
              <h2 className="cf-h2">Back in the pool</h2>
              <p className="cf-sub">{bid.title || bid.bid_id} is no longer an active bid on your list.</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link className="cf-btn cf-btn-primary" href="/opportunities">Find another opportunity</Link>
                <Link className="cf-btn cf-btn-secondary" href={user?.role === "admin" ? "/bid-history" : "/my-bids"}>{user?.role === "admin" ? "Pipeline" : "My bids"}</Link>
              </div>
            </section>
          ) : null}
          {waiting ? (
            <section className="cf-card" aria-labelledby="ap-h" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18, borderColor: "rgba(251,191,36,.4)" }}>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <h2 id="ap-h" className="cf-h2">Waiting for approval</h2>
                <span className="cf-lbl" style={{ color: "#B45309" }}>Step 3 of 5</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 12, background: "var(--cf-surface-2)", border: "1px solid var(--cf-line)" }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 500 }}>{bid.approved_by_name ? `${bid.approved_by_name} will review this` : "A manager will review this"}</div>
                  <div className="cf-meta">You&apos;ll get an alert when it&apos;s approved or sent back.</div>
                </div>
              </div>
              {user?.role === "admin" ? <Link className="cf-link" href="/approvals">See the manager&apos;s view →</Link> : null}
            </section>
          ) : null}
          {approved ? (
            <section className="cf-card" aria-labelledby="sb-h" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18, borderColor: "rgba(52,211,153,.4)" }}>
              <div className="cf-banner cf-banner-ok" style={{ padding: "12px 14px" }}>
                <span><strong style={{ fontWeight: 500, color: "#047857" }}>Approved{bid.approved_by_name ? ` by ${bid.approved_by_name}` : ""}</strong> — submit it on the portal, then record the price here.</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <h2 id="sb-h" className="cf-h2">Record your portal submission</h2>
                <span className="cf-lbl" style={{ color: "#047857" }}>Step 4 of 5</span>
              </div>
              {priceDiffers ? <div className="cf-banner cf-banner-warn" role="status">Differs from the approved {formatMoney(approvedPrice)}. The recorded price is the one you save below.</div> : null}
            </section>
          ) : null}
          {quoteStep ? (
            <section className="cf-card" aria-labelledby="q-h" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <h2 id="q-h" className="cf-h2">Supplier quote</h2>
                <span className="cf-lbl">Step 2 of 5</span>
              </div>
              <p className="cf-sub">Supplier, freight and lead time stay on the vendor and notes sections below. This card keeps the status and price fields the bid already stores.</p>
            </section>
          ) : null}

          <section className="cf-card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 16 }}>
            <h2 className="cf-h3">Current status</h2>
            <span className="cf-pill" style={{ ...statusStyle(bid.internal_status), alignSelf: "flex-start" }}>{bid.internal_status}</span>
            {agentCanEdit ? (
              <div className="cf-grid2">
                <label className="cf-field">New status
                  <select aria-label="New status" className="cf-select" value={status} onChange={(e) => setStatus(e.target.value as BidStatus)}>
                    {Object.keys(BID_STATUSES).map((label) => <option key={label}>{label}</option>)}
                  </select>
                </label>
                {status === "Bid submitted" ? (
                  <>
                    <label className="cf-field">Supplier cost
                      <Input aria-label="Supplier cost" type="number" min="0" step="0.01" value={supplierCost} onChange={(e) => setSupplierCost(e.target.value)} />
                    </label>
                    <label className="cf-field">Submitted price
                      <Input aria-label="Submitted price" type="number" min="0" step="0.01" value={submittedPrice} onChange={(e) => setSubmittedPrice(e.target.value)} />
                    </label>
                  </>
                ) : null}
                <div style={{ display: "flex", alignItems: "flex-end" }}>
                  <button type="button" className="cf-btn cf-btn-primary" onClick={saveStatus}>Update status</button>
                </div>
              </div>
            ) : null}
          </section>
        </div>

        <aside style={{ flex: "1 1 340px", minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>
          {submitted ? null : (
          <section className="cf-card" aria-labelledby="pr-h" style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16, borderColor: "rgba(34,211,238,.4)", boxShadow: "0 14px 40px -24px rgba(34,211,238,.6)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <h2 id="pr-h" className="cf-lbl" style={{ margin: 0, color: "#0E7490" }}>Your bid price</h2>
              <span className="cf-mono cf-meta">{(bid.size_bucket || "—").toUpperCase()}</span>
            </div>
            <div className="cf-mono" style={{ fontWeight: 500, fontSize: 40, lineHeight: 1, letterSpacing: "-0.03em" }}>{formatMoney(priceShown)}</div>
            <div className="cf-sum">
              <span>Supplier cost</span><span>{formatMoney(bid.supplier_cost)}</span>
              <span>Markup</span><span>{bid.markup_percent == null ? "—" : `${bid.markup_percent.toFixed(1)}%`}</span>
              <span>Gross profit</span><span style={{ color: bid.negative_profit_warning ? "#BE123C" : "#047857" }}>{formatMoney(bid.gross_profit)}</span>
            </div>
            {bid.negative_profit_warning ? <div className="cf-err" role="alert">Submitted price is below supplier cost.</div> : null}
            <div style={{ borderTop: "1px solid var(--cf-line)", paddingTop: 14, fontSize: 13, color: "var(--cf-text-2)" }}>Approver · <strong style={{ color: "var(--cf-text)", fontWeight: 500 }}>{bid.approved_by_name || "—"}</strong></div>
          </section>
          )}
          <section className="cf-card" aria-labelledby="info-h" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>
            <h2 id="info-h" className="cf-h2">Solicitation</h2>
            {submitted ? (
              <dl className="cf-dl">
                <dt>NAICS</dt><dd>{bid.naics_code || "—"}</dd>
                <dt>Assigned</dt><dd className="cf-mono">{bid.assign_date || "—"}</dd>
                <dt>Response due</dt><dd className="cf-mono">{bid.due_date || "—"}</dd>
                <dt>Submitted</dt><dd className="cf-mono">{bid.submitted_at || "—"}</dd>
                <dt>Manufacturer</dt><dd style={{ color: bid.manufacturer ? undefined : "var(--cf-text-3)", fontWeight: bid.manufacturer ? 500 : 400 }}>{bid.manufacturer || "Not recorded"}</dd>
              </dl>
            ) : (
            <div className="cf-sum" style={{ fontSize: 13 }}>
              <span>Response due</span><span style={{ color: daysLeft != null && daysLeft <= 11 ? "#BE123C" : undefined }}>{dueText}</span>
              <span>Quantity</span><span>—</span>
              <span>Delivery</span><span>{bid.delivery_address || "—"}</span>
              <span>Set-aside</span><span>—</span>
            </div>
            )}
          </section>
          <section className="cf-card" style={{ padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
            <h2 className="cf-h3">Activity</h2>
            {(bid.status_history || []).length === 0 ? <p className="cf-meta">No status changes are recorded yet.</p> : (
              <ol aria-label="Status change events" style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                {(bid.status_history || []).map((event) => (
                  <li key={event.id}>
                    <div style={{ fontWeight: 500 }}>{event.old_status} → {event.new_status}</div>
                    {event.reason && <p>{event.reason}</p>}
                    <div className="cf-mono cf-meta">{event.changed_by_name || "—"} · {event.changed_at_eastern}</div>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section className="cf-card" aria-labelledby="own-h" style={{ padding: "20px 24px", display: submitted ? "flex" : "none", flexDirection: "column", gap: 12 }}>
            <h2 id="own-h" className="cf-h2">Ownership</h2>
            <div style={{ fontWeight: 500 }}>{bid.agent_name || "—"}</div>
            <div className="cf-meta">{(bid.ownership_history || [])[0]?.action || "Assigned"}{bid.assign_date ? ` · ${bid.assign_date}` : ""}</div>
          </section>
        </aside>
      </div>

      <Card id="vendors" className="cf-card scroll-mt-6 border-0 shadow-none">
        <CardHeader>
          <CardTitle>Vendors</CardTitle>
          <CardDescription className="text-slate-600">Add a vendor, keep a note for this bid, and mark an email preferred for the next RFQ.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canEdit && (
            <>
              <form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); addVendor({ company_name: vendorName, email: vendorEmail, notes: vendorNote, source: "manual" }); }}>
                <label className="grid gap-1 text-sm">Vendor name
                  <Input aria-label="Vendor name" value={vendorName} onChange={(event) => setVendorName(event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm">Email
                  <Input aria-label="Vendor email" type="email" value={vendorEmail} onChange={(event) => setVendorEmail(event.target.value)} />
                </label>
                <label className="grid gap-1 text-sm md:col-span-2">Note for this bid
                  <Input aria-label="Vendor note" value={vendorNote} onChange={(event) => setVendorNote(event.target.value)} />
                </label>
                <div className="flex flex-wrap gap-2 md:col-span-4">
                  <button type="submit" className="cf-btn cf-btn-primary" disabled={savingVendor}>{savingVendor ? "Adding…" : "Add vendor"}</button>
                  <button type="button" className="cf-btn cf-btn-secondary" disabled={suggesting} onClick={suggestVendors}>
                    {suggesting ? "Asking AI…" : "Suggest vendors with AI"}
                  </button>
                </div>
              </form>
              {suggestions && (
                <section aria-label="AI vendor suggestions" className="space-y-2 rounded border border-dashed p-3">
                  <p className="text-sm font-medium">AI vendor suggestions</p>
                  {suggestionMessage && <p className="text-xs text-slate-600">{suggestionMessage}</p>}
                  {suggestions.length === 0 ? null : (
                    <ul className="space-y-2">
                      {suggestions.map((item) => (
                        <li key={item.email} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                          <span><strong>{item.company_name}</strong> · {item.email}</span>
                          <button type="button" className="cf-btn cf-btn-secondary" disabled={savingVendor}
                            onClick={() => addVendor({ company_name: item.company_name, email: item.email, source: "ai_suggested" })}>
                            Add {item.company_name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              )}
              {reusable.length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium">Preferred vendors</p>
                  <div className="flex flex-wrap gap-2">
                    {reusable.map((vendor) => (
                      <button key={vendor.email} type="button" className="cf-btn cf-btn-secondary" disabled={savingVendor}
                        onClick={() => addVendor({ company_name: vendor.company_name, email: vendor.email, source: "manual" })}>
                        Add {vendor.company_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {workspace.vendors.length === 0 ? (
            <p className="text-sm text-slate-600">No vendors are linked to this bid yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-slate-600">
                    <th className="py-2 pr-3 font-medium">Vendor</th>
                    <th className="py-2 pr-3 font-medium">Outreach</th>
                    <th className="py-2 pr-3 font-medium">Note</th>
                    <th className="py-2 font-medium">Preferred</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.vendors.map((vendor) => {
                    const negotiationOpen = vendor.status !== "completed" && vendor.status !== "stopped" && vendor.negotiation_round < 3;
                    const preferred = preferredPending[vendor.id] ?? vendor.preferred;
                    return (
                      <tr key={vendor.id} className="border-b align-top last:border-0">
                        <td className="py-2 pr-3">
                          <p className="font-medium">{vendor.company_name || "Unnamed vendor"}</p>
                          <p className="text-xs text-slate-600">{vendor.email || "No email"}{vendor.is_manual ? " · added manually" : " · AI suggested"}</p>
                          {vendor.latest_price != null && <p className="text-xs text-slate-600">Latest quote: {formatMoney(vendor.latest_price)}</p>}
                          {(vendor.rounds || []).length === 0 ? (
                            <p className="text-xs text-slate-600">No negotiation round yet</p>
                          ) : (vendor.rounds || []).map((round) => (
                            <p key={round.round_number} className="text-xs text-slate-600">
                              Round {round.round_number} · {formatMoney(round.price)} · {ROUND_LABEL[round.status] || round.status}
                            </p>
                          ))}
                          <div className="mt-2 flex flex-wrap gap-2">
                            {canEdit && negotiationOpen && vendor.outreach_state !== "suggested" && (
                              <button type="button" className="cf-btn cf-btn-secondary" onClick={() => stopVendor(vendor)}>Stop negotiation</button>
                            )}
                            {canEdit && vendor.email && (
                              <button type="button" className="cf-btn cf-btn-secondary" aria-label={`Email ${vendor.company_name || vendor.email}`} onClick={() => emailVendor(vendor)}>Email</button>
                            )}
                          </div>
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${outreachClass(vendor.outreach_state)}`}>
                            {outreachLabel(vendor)}
                          </span>
                          {(vendor.gmail_message_count || 0) > 0 && (
                            <p className="mt-1 text-xs text-slate-600">{vendor.gmail_message_count} Gmail message{vendor.gmail_message_count === 1 ? "" : "s"}</p>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          <div className="flex items-start gap-2">
                            <Textarea aria-label={`Note for ${vendor.company_name || "vendor"}`} rows={2} className="min-h-0" readOnly={!canEdit}
                              value={noteDrafts[vendor.id] ?? vendor.notes ?? ""}
                              onChange={(event) => setNoteDrafts((current) => ({ ...current, [vendor.id]: event.target.value }))} />
                            {canEdit && (
                              <button type="button" className="cf-btn cf-btn-secondary" onClick={() => updateVendor(vendor, { notes: noteDrafts[vendor.id] ?? "" })}>Save</button>
                            )}
                          </div>
                        </td>
                        <td className="py-2">
                          <label className="flex items-center gap-2 text-sm">
                            <input type="checkbox" aria-label={`Preferred ${vendor.company_name || "vendor"}`} checked={preferred}
                              disabled={!vendor.email || !canEdit || vendor.id in preferredPending}
                              onChange={(event) => updateVendor(vendor, { preferred: event.target.checked })} />
                            Preferred
                          </label>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div id="negotiation" className="grid scroll-mt-6 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Negotiation history</CardTitle>
            <CardDescription className="text-slate-600">
              {workspace.negotiation_status ? `RFQ status: ${workspace.negotiation_status}. ` : "No RFQ session is linked yet. "}
              A round starts when the vendor replies. It stops when you stop it, or on the third reply, which is the best offer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {historyByVendor.size === 0 ? (
              <p className="text-sm text-slate-600">No negotiation messages yet.</p>
            ) : (
              <div className="space-y-5">
                {Array.from(historyByVendor.entries()).map(([vendorId, group]) => (
                  <section key={vendorId} aria-label={`Negotiation with ${group.name}`} className="space-y-3">
                    <h3 className="text-sm font-semibold">{group.name}</h3>
                    {Array.from(group.rounds.entries()).map(([key, events]) => {
                      const number = key === "closed" ? null : Number(key);
                      const round = number ? group.vendor?.rounds?.find((r) => r.round_number === number) : undefined;
                      return (
                        <div key={key} className="rounded border p-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
                            {roundHeading(number)}
                            {round ? ` · ${formatMoney(round.price)} · ${ROUND_LABEL[round.status] || round.status}` : ""}
                          </p>
                          <ol className="mt-2 space-y-2">
                            {events.map((event, index) => (
                              <li key={`${event.created_at}-${index}`} className="border-l-2 pl-3 text-sm">
                                <p className="font-medium">{event.sender === "supplier" ? "Vendor" : "Employee"}{event.channel === "gmail" ? " · Gmail" : ""}</p>
                                <p className="whitespace-pre-wrap">{event.content}</p>
                                <p className="text-xs text-slate-600">
                                  {easternTime(event.created_at)}
                                  {event.price_mentioned != null ? ` · ${formatMoney(event.price_mentioned)}` : ""}
                                </p>
                              </li>
                            ))}
                          </ol>
                        </div>
                      );
                    })}
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Email conversations</CardTitle>
            <CardDescription className="text-slate-600">Messages with this bid&apos;s vendors, from the RFQ negotiation and from connected Gmail. Open the Emails section below for full Gmail conversations.</CardDescription>
          </CardHeader>
          <CardContent>
            {workspace.email_conversations.length === 0 ? (
              <p className="text-sm text-slate-600">No vendor emails are recorded yet. RFQ negotiation and Gmail messages with a vendor appear here after they are sent or received.</p>
            ) : (
              <ol className="space-y-3">
                {workspace.email_conversations.map((event, index) => (
                  <li key={`${event.supplier_id}-${event.channel}-${event.created_at}-${index}`} className="border-l-2 pl-3 text-sm">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      {event.direction === "incoming" ? "From" : "To"} {event.supplier_name || "vendor"}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {event.channel === "gmail" ? "Gmail" : "RFQ negotiation"}
                      </span>
                    </p>
                    {event.subject && <p className="text-xs text-slate-600">{event.subject}</p>}
                    <p className="whitespace-pre-wrap">{event.content}</p>
                    <p className="text-xs text-slate-600">
                      {easternTime(event.created_at)}
                      {event.price_mentioned != null ? ` · Price mentioned: ${formatMoney(event.price_mentioned)}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Card id="bid-emails" className="cf-card scroll-mt-6 border-0 shadow-none">
        <CardHeader>
          <CardTitle>Emails</CardTitle>
          <CardDescription className="text-slate-600">Gmail conversations from connected mailboxes. Send from your own Gmail and review vendor replies here.</CardDescription>
        </CardHeader>
        <CardContent><BidEmailsPanel bidId={bid.id} composeRequest={composeRequest} readOnly={!canEdit} onMailChanged={() => load(true).catch(() => setMessage("Email updated, but bid details could not refresh."))} /></CardContent>
      </Card>

      <Card id="notes" className="cf-card scroll-mt-6 border-0 shadow-none">
        <CardHeader>
          <CardTitle>Remarks and research notes</CardTitle>
          <CardDescription className="text-slate-600">Saved on this bid and shown again the next time you open it.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="grid gap-1 text-sm">
            Remarks
            <Textarea aria-label="Remarks" value={remarks} readOnly={!canEdit} onChange={(event) => setRemarks(event.target.value)} rows={4} />
          </label>
          <label className="grid gap-1 text-sm">
            Research notepad
            <Textarea aria-label="Research notepad" value={researchNotes} readOnly={!canEdit} onChange={(event) => setResearchNotes(event.target.value)} rows={6} placeholder="Calls, follow-ups, and other research that does not fit a field." />
          </label>
          {canEdit && (
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" className="cf-btn cf-btn-primary" onClick={saveNotes} disabled={savingNotes}>{savingNotes ? "Saving…" : "Save notes"}</button>
              {notesUnsaved && <span className="text-sm text-amber-800">Unsaved changes</span>}
            </div>
          )}
        </CardContent>
      </Card>

      <div id="history" className="grid scroll-mt-6 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Status history</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {(bid.status_history || []).map((event) => (
                <li key={event.id} className="border-l-2 pl-4">
                  <p className="font-medium">{event.old_status} → {event.new_status}</p>
                  {event.reason && <p>{event.reason}</p>}
                  <p className="text-xs text-slate-600">{event.changed_by_name} · {new Date(event.changed_at_eastern).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" })}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Ownership history</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {(bid.ownership_history || []).map((event) => (
                <li key={event.id} className="border-l-2 pl-4">
                  <p className="font-medium">{event.agent_name} · {event.action}</p>
                  <p className="text-xs text-slate-600">By {event.changed_by_name}{event.reason ? ` · ${event.reason}` : ""}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
      </PageMain>
    </>
  );
}
