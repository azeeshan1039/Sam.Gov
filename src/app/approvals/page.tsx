"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { AdminTabs, PageBand, PageMain } from "@/components/design/PageFrame";
import { PipelineTable } from "@/components/pipeline/PipelineTable";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney, requesterQuery, type PipelineItem } from "@/lib/pipeline";

function money(value: number | null | undefined) {
  return value == null ? "—" : formatMoney(value);
}

export default function ApprovalsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [awaitingApproval, setAwaitingApproval] = useState<PipelineItem[]>([]);
  const [needsSupplier, setNeedsSupplier] = useState<PipelineItem[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState(false);
  const [sendingBack, setSendingBack] = useState(false);
  const [largeOk, setLargeOk] = useState(false);
  const [decision, setDecision] = useState<{ kind: "approved" | "sent"; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const current = getStoredUser();
    if (!current) {
      router.replace("/register");
      return;
    }
    if (current.role !== "admin") {
      router.replace("/my-bids?access=manager");
      return;
    }
    setUser(current);
    const bid = Number(new URLSearchParams(window.location.search).get("bid"));
    if (bid) setSelectedId(bid);
  }, [router]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/backend/pipeline/approvals?${requesterQuery(user)}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Failed to load approvals (${res.status})`);
      const waiting = (data.awaiting_approval || []) as PipelineItem[];
      setAwaitingApproval(waiting);
      setNeedsSupplier(data.needs_supplier || []);
      setSelectedId((current) => current && waiting.some((item) => item.id === current) ? current : waiting[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const item = awaitingApproval.find((row) => row.id === selectedId) || null;
  const price = item?.submitted_price ?? item?.expected_submitted_price ?? null;
  const large = (price || 0) >= 500000;
  const expired = (item?.days_remaining ?? 1) < 0;
  const markup = item?.markup_percent;

  function openItem(next: PipelineItem) {
    setSelectedId(next.id);
    setNote("");
    setNoteError(false);
    setSendingBack(false);
    setLargeOk(false);
    setDecision(null);
  }

  async function decide(status: "Approved for Submission" | "Bid No Approved") {
    if (!item) return;
    if (status === "Bid No Approved" && !note.trim()) {
      setNoteError(true);
      setSendingBack(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/backend/pipeline/bids/${item.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, ...(status === "Bid No Approved" && { reason: note.trim() }) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to update this bid.");
      setDecision({ kind: status === "Approved for Submission" ? "approved" : "sent", name: item.agent_name || "the agent" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update this bid.");
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <PageMain>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </PageMain>
    );
  }

  return (
    <>
      <PageBand
        eyebrow={`ADMIN · ${awaitingApproval.length} WAITING`}
        title="Approvals"
        lead="Check the recorded cost and price, then approve or send the bid back."
      />
      <AdminTabs current="/approvals" approvalCount={awaitingApproval.length} />
      <PageMain>
      {error && <div role="alert" className="cf-banner cf-banner-bad">{error}</div>}
      {loading ? <Skeleton className="h-64 w-full" /> : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "flex-start" }}>
          <section aria-label="Approval queue" style={{ flex: "0 1 320px", display: "flex", flexDirection: "column", gap: 8 }}>
            <p className="cf-mono cf-meta">OLDEST FIRST</p>
            {awaitingApproval.length === 0 ? <p className="cf-meta">Nothing waiting on approval.</p> : awaitingApproval.map((row) => {
              const rowPrice = row.submitted_price ?? row.expected_submitted_price ?? 0;
              const on = row.id === item?.id;
              return (
                <button key={row.id} type="button" className={`cf-q${on ? " cf-q-on" : ""}`} onClick={() => openItem(row)} aria-current={on ? "true" : undefined}>
                  <span style={{ font: "500 15px var(--cf-display)" }}>{row.title || row.bid_id}</span>
                  <span className="cf-mono cf-meta">{row.solicitation_number || row.bid_id} · {row.agent_name || "—"}</span>
                  <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {rowPrice >= 500000 ? <span className="cf-tag">$500K+</span> : null}
                    {(row.days_remaining ?? 1) < 0 ? <span className="cf-tag">Expired</span> : <span className="cf-pill cf-pill-app">Waiting</span>}
                  </span>
                </button>
              );
            })}
          </section>

          {decision?.kind === "approved" ? (
            <section className="cf-card" style={{ flex: "1 1 520px", padding: 24 }}>
              <div className="cf-banner cf-banner-ok" role="status">
                <div style={{ flex: 1 }}><div style={{ fontWeight: 500, color: "#047857" }}>Approved · {decision.name} can submit it</div><div>The status is now Approved for Submission.</div></div>
                <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" onClick={() => setDecision(null)}>Next in queue</button>
              </div>
            </section>
          ) : decision?.kind === "sent" ? (
            <section className="cf-card" style={{ flex: "1 1 520px", padding: 24 }}>
              <div className="cf-banner cf-banner-warn" role="status">
                <div style={{ flex: 1 }}><div style={{ fontWeight: 500 }}>Sent back · status is Bid not approved</div><div>The agent can read your instructions in the bid history.</div></div>
                <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" onClick={() => setDecision(null)}>Next in queue</button>
              </div>
            </section>
          ) : item ? (
            <section className="cf-card" style={{ flex: "1 1 520px", minWidth: 0, padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
              <div>
                <div className="cf-id">{item.solicitation_number || item.bid_id} · {(item.portal || "—").toUpperCase()}</div>
                <h2 className="cf-h2" style={{ marginTop: 6 }}>{item.title || item.bid_id}</h2>
                <p className="cf-sub">{item.agent_name || "—"} · response due {item.due_date || "—"}{item.days_remaining != null ? ` · ${item.days_remaining} days left` : ""}</p>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 12 }}>
                <div className="cf-fin"><div className="cf-lbl">Supplier cost</div><div className="cf-fin-v">{money(item.supplier_cost)}</div></div>
                <div className="cf-fin"><div className="cf-lbl">Bid price</div><div className="cf-fin-v">{money(price)}</div></div>
                <div className="cf-fin"><div className="cf-lbl">Gross profit</div><div className="cf-fin-v">{money(item.gross_profit)}</div></div>
                <div className="cf-fin"><div className="cf-lbl">Markup</div><div className="cf-fin-v">{markup == null ? "—" : `${markup.toFixed(1)}%`}</div></div>
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
                <li className="cf-meta">{markup == null ? "Markup is not recorded on this bid." : markup >= 15 && markup <= 40 ? `Markup ${markup.toFixed(1)}% is inside 15–40%.` : `Markup ${markup.toFixed(1)}% is outside 15–40%.`}</li>
                <li className="cf-meta">{large ? "This price is $500K or more." : "This price is under $500K."}</li>
                <li className="cf-meta">{expired ? "The response deadline has passed." : "The response deadline has not passed."}</li>
              </ul>
              {expired ? (
                <div className="cf-banner cf-banner-bad" role="alert">
                  <div><div style={{ fontWeight: 500, color: "#BE123C" }}>Deadline passed while this was waiting</div><div>It can&apos;t be approved. Send it back, or open the bid and check SAM.gov for an extension.</div></div>
                </div>
              ) : null}
              {large && !expired ? (
                <label className="cf-choice" style={{ alignSelf: "stretch" }}>
                  <input type="checkbox" checked={largeOk} onChange={(event) => setLargeOk(event.target.checked)} />
                  <span>This is a $500K+ bid. I reviewed the recorded cost and price before approving.</span>
                </label>
              ) : null}
              {sendingBack ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 14, borderTop: "1px solid var(--cf-line)", paddingTop: 20 }}>
                  <label className="cf-flt" htmlFor="why">What should {item.agent_name || "the agent"} change?
                    <textarea id="why" className="cf-input" rows={3} value={note} onChange={(event) => { setNote(event.target.value); setNoteError(false); }} placeholder="Say what needs to change before this can be approved" />
                  </label>
                  {noteError ? <span className="cf-banner cf-banner-bad" role="alert">Add a note so {item.agent_name || "the agent"} knows what to fix.</span> : null}
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <button type="button" className="cf-btn cf-btn-warn" disabled={busy} onClick={() => decide("Bid No Approved")}>Send back{item.agent_name ? ` to ${item.agent_name.split(" ")[0]}` : ""}</button>
                    <button type="button" className="cf-btn cf-btn-ghost" onClick={() => { setSendingBack(false); setNoteError(false); }}>Cancel</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button type="button" className="cf-btn cf-btn-primary" disabled={busy || expired || (large && !largeOk)} onClick={() => decide("Approved for Submission")}>Approve</button>
                  <button type="button" className="cf-btn cf-btn-warn" onClick={() => setSendingBack(true)}>Send back</button>
                  <Link className="cf-btn cf-btn-ghost" href={`/bids/${item.id}`}>Open bid</Link>
                </div>
              )}
            </section>
          ) : <p className="cf-meta">Nothing waiting on approval.</p>}
        </div>
      )}

      <section className="cf-card" aria-labelledby="supplier-h" style={{ overflow: "hidden" }}>
        <div style={{ padding: "18px 24px 8px" }}>
          <h2 id="supplier-h" className="cf-h2">Needs supplier quote</h2>
          <p className="cf-sub">{loading ? "Loading…" : `${needsSupplier.length} row(s) — finding supplier / no quote / couldn’t get quote`}</p>
        </div>
        {loading ? null : needsSupplier.length === 0 ? <p className="cf-meta" style={{ padding: "0 24px 18px" }}>No supplier-quote blockers.</p> : (
          <ul style={{ listStyle: "none", margin: 0, padding: "0 24px 12px" }}>
            {needsSupplier.map((row) => (
              <li key={row.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderTop: "1px solid var(--cf-line)" }}>
                <div><div style={{ fontWeight: 500 }}>{row.title || row.bid_id}</div><div className="cf-mono cf-meta">{row.solicitation_number || row.bid_id} · {row.agent_name || "—"}</div></div>
                <Link className="cf-link" href={`/bids/${row.id}`}>Open bid</Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <details className="cf-card p-4">
        <summary className="cursor-pointer">Compare approval and supplier queues</summary>
        <h3>Awaiting approval</h3><PipelineTable items={awaitingApproval} />
        <h3>Needs supplier quote</h3><PipelineTable items={needsSupplier} />
      </details>
      </PageMain>
    </>
  );
}
