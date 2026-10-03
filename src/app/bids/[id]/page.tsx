"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { BID_STATUSES, formatMoney, formatOutcome, statusStyle, type BidStatus, type PipelineItem } from "@/lib/pipeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function BidDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [bid, setBid] = useState<PipelineItem | null>(null);
  const [status, setStatus] = useState<BidStatus>("Finding Supplier");
  const [supplierCost, setSupplierCost] = useState("");
  const [submittedPrice, setSubmittedPrice] = useState("");
  const [outcome, setOutcome] = useState("pending");
  const [awardedTo, setAwardedTo] = useState("");
  const [awardedAmount, setAwardedAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { const current = getStoredUser(); if (!current) router.replace("/register"); else setUser(current); }, [router]);
  const load = useCallback(async () => {
    const response = await fetch(`/api/backend/pipeline/bids/${params.id}`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) { setMessage(data.error || "Unable to load bid."); return; }
    setBid(data.bid); setStatus(data.bid.internal_status);
    setSupplierCost(data.bid.supplier_cost?.toString() || ""); setSubmittedPrice(data.bid.submitted_price?.toString() || "");
    setOutcome(data.bid.award_outcome || "pending"); setAwardedTo(data.bid.awarded_to || ""); setAwardedAmount(data.bid.awarded_amount?.toString() || ""); setNotes(data.bid.outcome_notes || "");
  }, [params.id]);
  useEffect(() => { if (user) load(); }, [load, user]);

  async function saveStatus() {
    setMessage(null);
    const response = await fetch(`/api/backend/pipeline/bids/${params.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, supplier_cost: supplierCost, submitted_price: submittedPrice }) });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to update status.");
    setMessage(data.warning || "Status updated."); await load();
  }

  async function saveOutcome() {
    setMessage(null);
    const response = await fetch(`/api/backend/pipeline/bids/${params.id}/outcome`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ award_outcome: outcome, awarded_to: awardedTo, awarded_amount: awardedAmount, notes }) });
    const data = await response.json();
    if (!response.ok) return setMessage(data.error || "Unable to update outcome.");
    setMessage("Award outcome updated."); await load();
  }

  if (!bid) return <div className="p-6 lg:p-8">{message || "Loading bid…"}</div>;
  const agentCanEdit = user?.role === "admin" || (
    BID_STATUSES[bid.internal_status as BidStatus]?.classification === "active" &&
    bid.current_owner_user_id === user?.id
  );

  return <div className="space-y-6 p-6 lg:p-8">
    <div><h1 className="text-2xl font-bold">{bid.title || bid.bid_id}</h1><p className="text-muted-foreground">{bid.solicitation_number}</p></div>
    {message && <div className="rounded border bg-slate-50 p-3 text-sm">{message}</div>}
    {bid.negative_profit_warning && <div role="alert" className="rounded border border-red-500 bg-red-50 p-3 font-semibold text-red-800">Warning: submitted price is below supplier cost, so this bid has negative gross profit.</div>}
    <Card><CardHeader><CardTitle>Current status</CardTitle></CardHeader><CardContent className="space-y-4"><span className="inline-flex rounded-full px-3 py-1 text-sm font-semibold" style={statusStyle(bid.internal_status)}>{bid.internal_status}</span>{agentCanEdit && <div className="flex flex-wrap items-end gap-3"><label className="grid gap-1 text-sm">New status<select aria-label="New status" className="h-10 rounded-md border px-3" value={status} onChange={(e) => setStatus(e.target.value as BidStatus)}>{Object.keys(BID_STATUSES).map((label) => <option key={label}>{label}</option>)}</select></label>{status === "Bid submitted" && <><label className="grid gap-1 text-sm">Supplier cost<Input aria-label="Supplier cost" type="number" min="0" step="0.01" value={supplierCost} onChange={(e) => setSupplierCost(e.target.value)} /></label><label className="grid gap-1 text-sm">Submitted price<Input aria-label="Submitted price" type="number" min="0" step="0.01" value={submittedPrice} onChange={(e) => setSubmittedPrice(e.target.value)} /></label></>}<Button onClick={saveStatus}>Update status</Button></div>}</CardContent></Card>
    <div className="grid gap-4 md:grid-cols-5">{[["Expected submitted", bid.expected_submitted_price], ["Supplier cost", bid.supplier_cost], ["Submitted price", bid.submitted_price], ["Gross profit", bid.gross_profit], ["Markup", bid.markup_percent == null ? null : `${bid.markup_percent.toFixed(2)}%`]].map(([label, value]) => <Card key={String(label)} className={label === "Gross profit" && bid.negative_profit_warning ? "border-red-500 bg-red-50" : ""}><CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader><CardContent className="font-semibold">{typeof value === "string" ? value : formatMoney(value as number | null)}</CardContent></Card>)}</div>
    {bid.internal_status === "Bid submitted" && <Card><CardHeader><CardTitle>Award outcome: {formatOutcome(bid.award_outcome)}</CardTitle></CardHeader><CardContent className="space-y-3">{user?.role === "admin" ? <div className="grid gap-3 md:grid-cols-4"><label className="grid gap-1 text-sm">Outcome<select className="h-10 rounded-md border px-3" value={outcome} onChange={(e) => setOutcome(e.target.value)}>{["pending", "won", "lost", "unknown"].map((value) => <option key={value} value={value}>{formatOutcome(value)}</option>)}</select></label><label className="grid gap-1 text-sm">Awarded to<Input value={awardedTo} onChange={(e) => setAwardedTo(e.target.value)} /></label><label className="grid gap-1 text-sm">Awarded amount<Input type="number" min="0" step="0.01" value={awardedAmount} onChange={(e) => setAwardedAmount(e.target.value)} /></label><label className="grid gap-1 text-sm">Notes<Input value={notes} onChange={(e) => setNotes(e.target.value)} /></label><Button onClick={saveOutcome}>Save outcome</Button></div> : <p className="text-sm">{bid.awarded_to || "Awardee not recorded"} · {formatMoney(bid.awarded_amount)}</p>}</CardContent></Card>}
    <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>Status history</CardTitle></CardHeader><CardContent><ol className="space-y-4">{(bid.status_history || []).map((event) => <li key={event.id} className="border-l-2 pl-4"><p className="font-medium">{event.old_status} → {event.new_status}</p><p className="text-xs text-muted-foreground">{event.changed_by_name} · {new Date(event.changed_at_eastern).toLocaleString("en-US", { timeZone: "America/New_York", timeZoneName: "short" })}</p></li>)}</ol></CardContent></Card><Card><CardHeader><CardTitle>Ownership history</CardTitle></CardHeader><CardContent><ol className="space-y-4">{(bid.ownership_history || []).map((event) => <li key={event.id} className="border-l-2 pl-4"><p className="font-medium">{event.agent_name} · {event.action}</p><p className="text-xs text-muted-foreground">By {event.changed_by_name}{event.reason ? ` · ${event.reason}` : ""}</p></li>)}</ol></CardContent></Card></div>
  </div>;
}
