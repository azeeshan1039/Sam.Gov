"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import {
  BID_STATUSES,
  formatDate,
  formatMoney,
  statusStyle,
  type BidConversationEvent,
  type BidStatus,
  type BidVendor,
  type BidWorkspace,
  type OutreachState,
  type PipelineItem,
} from "@/lib/pipeline";
import { AwardPanel } from "@/components/awards/AwardPanel";
import { BidEmailsPanel, type ComposeRequest } from "@/components/emails/BidEmailsPanel";
import { Button } from "@/components/ui/button";
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

const SECTIONS = [
  ["vendors", "Vendors"],
  ["negotiation", "Negotiation"],
  ["bid-emails", "Emails"],
  ["notes", "Remarks & notes"],
  ["history", "History"],
] as const;

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

  const load = useCallback(async () => {
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
    setStatus(next.internal_status as BidStatus);
    setSupplierCost(next.supplier_cost?.toString() || "");
    setSubmittedPrice(next.submitted_price?.toString() || "");
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

  if (!bid) return <div className="p-6 lg:p-8">{message || "Loading bid…"}</div>;

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

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{bid.title || bid.bid_id}</h1>
          <p className="text-slate-600">{bid.solicitation_number || bid.bid_id}</p>
        </div>
        {workspace.rfq_href && (
          <Button asChild variant="outline">
            <Link href={workspace.rfq_href}>Open RFQ negotiation</Link>
          </Button>
        )}
      </div>

      <nav aria-label="On this page" className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-slate-600">On this page:</span>
        {SECTIONS.map(([id, label]) => (
          <a key={id} href={`#${id}`} className="rounded-full border px-3 py-1 font-medium hover:bg-slate-50">{label}</a>
        ))}
      </nav>

      {message && <div className="rounded border bg-slate-50 p-3 text-sm">{message}</div>}
      {!canEdit && (
        <div role="note" className="rounded border border-slate-300 bg-slate-50 p-3 text-sm">
          Read only: this bid now belongs to {bid.agent_name || "another employee"}. You can view it; only its current owner or an admin can change vendors, notes or emails.
        </div>
      )}
      {bid.negative_profit_warning && (
        <div role="alert" className="rounded border border-red-500 bg-red-50 p-3 font-semibold text-red-800">
          Warning: submitted price is below supplier cost, so this bid has negative gross profit.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        {[
          ["Portal", bid.portal || "—"],
          ["Agent", bid.agent_name || "—"],
          ["Due", formatDate(bid.due_date)],
          ["Size", bid.size_bucket || "—"],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
            <CardContent className="font-semibold">{value}</CardContent>
          </Card>
        ))}
      </div>
      {bid.bid_url && (
        <p className="text-sm">
          <a className="text-blue-600 underline" href={bid.bid_url} target="_blank" rel="noreferrer">Source listing</a>
        </p>
      )}

      <Card>
        <CardHeader><CardTitle>Current status</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <span className="inline-flex rounded-full px-3 py-1 text-sm font-semibold" style={statusStyle(bid.internal_status)}>{bid.internal_status}</span>
          {agentCanEdit && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="grid gap-1 text-sm">
                New status
                <select aria-label="New status" className="h-10 rounded-md border px-3" value={status} onChange={(e) => setStatus(e.target.value as BidStatus)}>
                  {Object.keys(BID_STATUSES).map((label) => <option key={label}>{label}</option>)}
                </select>
              </label>
              {status === "Bid submitted" && (
                <>
                  <label className="grid gap-1 text-sm">
                    Supplier cost
                    <Input aria-label="Supplier cost" type="number" min="0" step="0.01" value={supplierCost} onChange={(e) => setSupplierCost(e.target.value)} />
                  </label>
                  <label className="grid gap-1 text-sm">
                    Submitted price
                    <Input aria-label="Submitted price" type="number" min="0" step="0.01" value={submittedPrice} onChange={(e) => setSubmittedPrice(e.target.value)} />
                  </label>
                </>
              )}
              <Button onClick={saveStatus}>Update status</Button>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-5">
        {[
          ["Expected submitted", bid.expected_submitted_price],
          ["Supplier cost", bid.supplier_cost],
          ["Submitted price", bid.submitted_price],
          ["Gross profit", bid.gross_profit],
          ["Markup", bid.markup_percent == null ? null : `${bid.markup_percent.toFixed(2)}%`],
        ].map(([label, value]) => (
          <Card key={String(label)} className={label === "Gross profit" && bid.negative_profit_warning ? "border-red-500 bg-red-50" : ""}>
            <CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
            <CardContent className="font-semibold">{typeof value === "string" ? value : formatMoney(value as number | null)}</CardContent>
          </Card>
        ))}
      </div>

      <Card id="vendors" className="scroll-mt-6">
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
                  <Button type="submit" disabled={savingVendor}>{savingVendor ? "Adding…" : "Add vendor"}</Button>
                  <Button type="button" variant="outline" disabled={suggesting} onClick={suggestVendors}>
                    {suggesting ? "Asking AI…" : "Suggest vendors with AI"}
                  </Button>
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
                          <Button type="button" size="sm" variant="outline" disabled={savingVendor}
                            onClick={() => addVendor({ company_name: item.company_name, email: item.email, source: "ai_suggested" })}>
                            Add {item.company_name}
                          </Button>
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
                      <Button key={vendor.email} type="button" variant="outline" size="sm" disabled={savingVendor}
                        onClick={() => addVendor({ company_name: vendor.company_name, email: vendor.email, source: "manual" })}>
                        Add {vendor.company_name}
                      </Button>
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
                              <Button type="button" variant="outline" size="sm" onClick={() => stopVendor(vendor)}>Stop negotiation</Button>
                            )}
                            {canEdit && vendor.email && (
                              <Button type="button" variant="outline" size="sm" aria-label={`Email ${vendor.company_name || vendor.email}`} onClick={() => emailVendor(vendor)}>Email</Button>
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
                              <Button type="button" variant="outline" size="sm" onClick={() => updateVendor(vendor, { notes: noteDrafts[vendor.id] ?? "" })}>Save</Button>
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
                                <p className="font-medium">{event.sender === "supplier" ? "Vendor" : "Employee"}</p>
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

      <Card id="bid-emails" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>Emails</CardTitle>
          <CardDescription className="text-slate-600">Gmail conversations from connected mailboxes. Send from your own Gmail and review vendor replies here.</CardDescription>
        </CardHeader>
        <CardContent><BidEmailsPanel bidId={bid.id} composeRequest={composeRequest} readOnly={!canEdit} /></CardContent>
      </Card>

      <Card id="notes" className="scroll-mt-6">
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
              <Button onClick={saveNotes} disabled={savingNotes}>{savingNotes ? "Saving…" : "Save notes"}</Button>
              {notesUnsaved && <span className="text-sm text-amber-800">Unsaved changes</span>}
            </div>
          )}
        </CardContent>
      </Card>

      {bid.internal_status === "Bid submitted" && (
        <Card>
          <CardHeader><CardTitle>Award tracking</CardTitle></CardHeader>
          <CardContent><AwardPanel bidId={bid.id} onSaved={() => load()} /></CardContent>
        </Card>
      )}

      <div id="history" className="grid scroll-mt-6 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Status history</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {(bid.status_history || []).map((event) => (
                <li key={event.id} className="border-l-2 pl-4">
                  <p className="font-medium">{event.old_status} → {event.new_status}</p>
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
    </div>
  );
}
