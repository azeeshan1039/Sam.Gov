"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import {
  BID_STATUSES,
  formatDate,
  formatMoney,
  statusStyle,
  type BidStatus,
  type BidVendor,
  type BidWorkspace,
  type OutreachState,
  type PipelineItem,
} from "@/lib/pipeline";
import { AwardPanel } from "@/components/awards/AwardPanel";
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

function outreachClass(state: OutreachState) {
  if (state === "responded") return "bg-emerald-100 text-emerald-800";
  if (state === "contacted") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-700";
}

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
  const [savingVendor, setSavingVendor] = useState(false);

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
    setBid(data.bid);
    setStatus(data.bid.internal_status);
    setSupplierCost(data.bid.supplier_cost?.toString() || "");
    setSubmittedPrice(data.bid.submitted_price?.toString() || "");
    setRemarks(data.bid.bid_remarks || "");
    setResearchNotes(data.bid.research_notes || "");
    const drafts: Record<number, string> = {};
    for (const vendor of data.bid.workspace?.vendors || []) drafts[vendor.id] = vendor.notes || "";
    setNoteDrafts(drafts);
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

  async function addVendor(payload: { company_name: string; email: string; notes?: string }) {
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
      setVendorName("");
      setVendorEmail("");
      setVendorNote("");
      setMessage("Vendor added.");
      await load();
    } finally {
      setSavingVendor(false);
    }
  }

  async function updateVendor(vendor: BidVendor, body: { notes?: string; preferred?: boolean }) {
    setMessage(null);
    const response = await fetch(`/api/backend/pipeline/bids/${params.id}/vendors/${vendor.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to update vendor.");
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

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{bid.title || bid.bid_id}</h1>
          <p className="text-muted-foreground">{bid.solicitation_number || bid.bid_id}</p>
        </div>
        {workspace.rfq_href && (
          <Button asChild variant="outline">
            <Link href={workspace.rfq_href}>Open RFQ negotiation</Link>
          </Button>
        )}
      </div>

      {message && <div className="rounded border bg-slate-50 p-3 text-sm">{message}</div>}
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

      <Card>
        <CardHeader>
          <CardTitle>Vendors</CardTitle>
          <CardDescription>Add a vendor, keep a note for this bid, and mark an email preferred for the next RFQ.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-3 md:grid-cols-4" onSubmit={(event) => { event.preventDefault(); addVendor({ company_name: vendorName, email: vendorEmail, notes: vendorNote }); }}>
            <label className="grid gap-1 text-sm">Vendor name
              <Input aria-label="Vendor name" value={vendorName} onChange={(event) => setVendorName(event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">Email
              <Input aria-label="Vendor email" type="email" value={vendorEmail} onChange={(event) => setVendorEmail(event.target.value)} />
            </label>
            <label className="grid gap-1 text-sm md:col-span-2">Note for this bid
              <Input aria-label="Vendor note" value={vendorNote} onChange={(event) => setVendorNote(event.target.value)} />
            </label>
            <div className="md:col-span-4">
              <Button type="submit" disabled={savingVendor}>{savingVendor ? "Adding…" : "Add vendor"}</Button>
            </div>
          </form>
          {reusable.length > 0 && (
            <div>
              <p className="mb-2 text-sm font-medium">Preferred vendors</p>
              <div className="flex flex-wrap gap-2">
                {reusable.map((vendor) => (
                  <Button key={vendor.email} type="button" variant="outline" size="sm" disabled={savingVendor}
                    onClick={() => addVendor({ company_name: vendor.company_name, email: vendor.email })}>
                    Add {vendor.company_name}
                  </Button>
                ))}
              </div>
            </div>
          )}
          {workspace.vendors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No vendors are linked to this bid yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">Vendor</th>
                    <th className="py-2 pr-3 font-medium">Outreach</th>
                    <th className="py-2 pr-3 font-medium">Note</th>
                    <th className="py-2 font-medium">Preferred</th>
                  </tr>
                </thead>
                <tbody>
                  {workspace.vendors.map((vendor) => (
                    <tr key={vendor.id} className="border-b align-top last:border-0">
                      <td className="py-2 pr-3">
                        <p className="font-medium">{vendor.company_name || "Unnamed vendor"}</p>
                        <p className="text-xs text-muted-foreground">{vendor.email || "No email"}{vendor.is_manual ? " · added manually" : " · AI suggested"}</p>
                        {(vendor.rounds || []).length === 0 ? (
                          <p className="text-xs text-muted-foreground">No vendor reply yet</p>
                        ) : (vendor.rounds || []).map((round) => (
                          <p key={round.round_number} className="text-xs text-muted-foreground">
                            Round {round.round_number} · {formatMoney(round.price)} · {ROUND_LABEL[round.status] || round.status}
                          </p>
                        ))}
                        {vendor.status !== "completed" && vendor.status !== "stopped" && vendor.negotiation_round < 3 && (
                          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => stopVendor(vendor)}>Stop negotiation</Button>
                        )}
                      </td>
                      <td className="py-2 pr-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${outreachClass(vendor.outreach_state)}`}>
                          {OUTREACH_LABEL[vendor.outreach_state]}
                        </span>
                      </td>
                      <td className="py-2 pr-3">
                        <div className="flex items-start gap-2">
                          <Textarea aria-label={`Note for ${vendor.company_name || "vendor"}`} rows={2} className="min-h-0" value={noteDrafts[vendor.id] ?? vendor.notes ?? ""}
                            onChange={(event) => setNoteDrafts((current) => ({ ...current, [vendor.id]: event.target.value }))} />
                          <Button type="button" variant="outline" size="sm" onClick={() => updateVendor(vendor, { notes: noteDrafts[vendor.id] ?? "" })}>Save</Button>
                        </div>
                      </td>
                      <td className="py-2">
                        <label className="flex items-center gap-2 text-sm">
                          <input type="checkbox" aria-label={`Preferred ${vendor.company_name || "vendor"}`} checked={vendor.preferred} disabled={!vendor.email}
                            onChange={(event) => updateVendor(vendor, { preferred: event.target.checked })} />
                          Preferred
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Negotiation history</CardTitle>
            <CardDescription>
              {workspace.negotiation_status ? `RFQ status: ${workspace.negotiation_status}. ` : "No RFQ session is linked yet. "}
              A round starts when the vendor replies. It stops when you stop it, or on the third reply, which is the best offer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {workspace.negotiation_history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No negotiation messages yet.</p>
            ) : (
              <ol className="space-y-3">
                {workspace.negotiation_history.map((event, index) => (
                  <li key={`${event.supplier_id}-${event.created_at}-${index}`} className="border-l-2 pl-3 text-sm">
                    <p className="font-medium">{event.supplier_name || "Vendor"} · {event.sender === "supplier" ? "Vendor" : "Employee"}</p>
                    <p className="whitespace-pre-wrap">{event.content}</p>
                    <p className="text-xs text-muted-foreground">
                      {event.created_at ? new Date(event.created_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : "—"}
                      {event.price_mentioned != null ? ` · ${formatMoney(event.price_mentioned)}` : ""}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Email conversations</CardTitle>
            <CardDescription>Messages sent to or received from a vendor email on this bid.</CardDescription>
          </CardHeader>
          <CardContent>
            {workspace.email_conversations.length === 0 ? (
              <p className="text-sm text-muted-foreground">No vendor emails are recorded yet. Messages from the RFQ negotiation appear here after they are sent or received.</p>
            ) : (
              <ol className="space-y-3">
                {workspace.email_conversations.map((event, index) => (
                  <li key={`${event.supplier_id}-email-${event.created_at}-${index}`} className="border-l-2 pl-3 text-sm">
                    <p className="font-medium">{event.direction === "incoming" ? "From" : "To"} {event.supplier_name || "vendor"}</p>
                    <p className="whitespace-pre-wrap">{event.content}</p>
                    <p className="text-xs text-muted-foreground">{event.created_at ? new Date(event.created_at).toLocaleString("en-US", { timeZone: "America/New_York" }) : "—"}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Remarks and research notes</CardTitle>
          <CardDescription>Saved on this bid and shown again the next time you open it.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <label className="grid gap-1 text-sm">
            Remarks
            <Textarea aria-label="Remarks" value={remarks} onChange={(event) => setRemarks(event.target.value)} rows={4} />
          </label>
          <label className="grid gap-1 text-sm">
            Research notepad
            <Textarea aria-label="Research notepad" value={researchNotes} onChange={(event) => setResearchNotes(event.target.value)} rows={6} placeholder="Calls, follow-ups, and other research that does not fit a field." />
          </label>
          <div>
            <Button onClick={saveNotes} disabled={savingNotes}>{savingNotes ? "Saving…" : "Save notes"}</Button>
          </div>
        </CardContent>
      </Card>

      {bid.internal_status === "Bid submitted" && (
        <Card>
          <CardHeader><CardTitle>Award tracking</CardTitle></CardHeader>
          <CardContent><AwardPanel bidId={bid.id} onSaved={() => load()} /></CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Status history</CardTitle></CardHeader>
          <CardContent>
            <ol className="space-y-4">
              {(bid.status_history || []).map((event) => (
                <li key={event.id} className="border-l-2 pl-4">
                  <p className="font-medium">{event.old_status} → {event.new_status}</p>
                  <p className="text-xs text-muted-foreground">{event.changed_by_name} · {new Date(event.changed_at_eastern).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" })}</p>
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
                  <p className="text-xs text-muted-foreground">By {event.changed_by_name}{event.reason ? ` · ${event.reason}` : ""}</p>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
