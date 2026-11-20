"use client";

import { useCallback, useEffect, useState } from "react";
import { PipelineTable } from "@/components/pipeline/PipelineTable";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { PageBand, PageMain } from "@/components/design/PageFrame";
import MyBidsAlerts from "@/components/notifications/MyBidsAlerts";
import { Skeleton } from "@/components/ui/skeleton";
import { formatStatus, statusStyle, requesterQuery, type PipelineItem } from "@/lib/pipeline";
import type { AwardTrackingItem } from "@/lib/awards";
import { easternTodayUtc } from "@/lib/eastern-date";

interface MyGoal {
  achieved: number;
  monthly: number;
  left: number;
}

interface ActiveClaim {
  id: number;
  external_notice_id: string;
  solicitation_number?: string | null;
  title: string;
  expected_bid_value?: number | null;
  response_deadline?: string | null;
  state: string;
  stale?: boolean;
}

const ACTIVE_STATUSES = new Set(["Finding Supplier", "Waiting Approval", "Approved for Submission", "Bid No Approved"]);
const PAGE_SIZE = 8;


function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(date);
}

function wholeMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function priceMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function dueParts(value: string | null | undefined, days: number | null | undefined) {
  if (!value && days == null) return { text: "—", urgent: false };
  const when = value ? shortDate(value) : "—";
  const remaining = days ?? null;
  const urgent = remaining != null && remaining <= 11;
  const text = remaining == null ? when : `${when} · ${remaining} day${remaining === 1 ? "" : "s"}`;
  return { text, urgent };
}

export default function MyBidsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bidParam = searchParams.get("bid");
  const highlightId = bidParam && /^\d+$/.test(bidParam) ? Number(bidParam) : null;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [activeClaims, setActiveClaims] = useState<ActiveClaim[]>([]);
  const [goal, setGoal] = useState<MyGoal | null>(null);
  const [awardDue, setAwardDue] = useState<AwardTrackingItem[]>([]);
  const [awardById, setAwardById] = useState<Record<number, AwardTrackingItem>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [portal, setPortal] = useState("all");
  const [tab, setTab] = useState<"all" | "active" | "submitted" | "won" | "lost">("all");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const current = getStoredUser();
    if (!current) {
      router.replace("/register");
      return;
    }
    setUser(current);
  }, [router]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const query = requesterQuery(user);
      const [bidsRes, goalRes, claimsRes] = await Promise.all([
        fetch(`/api/backend/pipeline/my-bids?${query}`, { cache: "no-store" }),
        fetch(`/api/backend/stats/my-goal?${query}`, { cache: "no-store" }),
        fetch("/api/backend/opportunities/mine", { cache: "no-store" }),
      ]);
      const bidsData = await bidsRes.json().catch(() => ({}));
      const goalData = await goalRes.json().catch(() => ({}));
      const claimsData = await claimsRes.json().catch(() => ({}));
      if (!bidsRes.ok) {
        console.error("[my-bids] load failed", { status: bidsRes.status, body: bidsData });
        throw new Error(bidsData.error || `Failed to load bids (${bidsRes.status})`);
      }
      setItems(bidsData.items || []);
      if (claimsRes.ok) {
        setActiveClaims(
          (claimsData.opportunities || []).filter(
            (claim: ActiveClaim) => claim.state === "assigned"
          )
        );
      } else {
        console.error("[my-bids] active claims load failed", {
          status: claimsRes.status,
          body: claimsData,
        });
        setActiveClaims([]);
      }
      if (goalRes.ok) {
        setGoal({
          achieved: Number(goalData.achieved || 0),
          monthly: Number(goalData.monthly || 0),
          left: Number(goalData.left || 0),
        });
      } else {
        console.error("[my-bids] goal load failed", { status: goalRes.status, body: goalData });
        setGoal(null);
      }
      try {
        const awardRes = await fetch(`/api/backend/pipeline/award-tracking?${query}`, { cache: "no-store" });
        const awardData = await awardRes.json().catch(() => ({}));
        const awardItems = (awardRes.ok ? awardData.items || [] : []) as AwardTrackingItem[];
        setAwardDue(awardItems.filter((item) => item.checkpoint_state === "due" || item.checkpoint_state === "flagged" || item.current_checkpoint?.state === "due"));
        setAwardById(Object.fromEntries(awardItems.map((item) => [item.id, item])));
      } catch (awardErr) {
        console.error("[my-bids] award checks load failed", awardErr);
        setAwardDue([]);
        setAwardById({});
      }
    } catch (err) {
      console.error("[my-bids] page error", err);
      setError(err instanceof Error ? err.message : "Failed to load bids");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  useEffect(() => {
    if (!highlightId || loading) return;
    const index = items.findIndex((item) => item.id === highlightId);
    if (index < 0) return;
    setTab("all");
    setPortal("all");
    setQuery("");
    setPage(Math.floor(index / PAGE_SIZE) + 1);
    const frame = requestAnimationFrame(() => document.getElementById(`summary-row-${highlightId}`)?.scrollIntoView?.({ block: "center" }));
    return () => cancelAnimationFrame(frame);
  }, [highlightId, loading, items]);

  if (!user) {
    return (
      <PageMain>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </PageMain>
    );
  }

  const goalPct = goal && goal.monthly > 0 ? Math.min(100, Math.round((goal.achieved / goal.monthly) * 100)) : 0;
  const today = easternTodayUtc();
  const daysInMonth = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
  const paceByToday = goal && goal.monthly > 0 ? Math.round(goal.monthly * (today.getUTCDate() / daysInMonth)) : null;
  const pacePct = goal && goal.monthly > 0 && paceByToday != null ? Math.min(100, Math.round((paceByToday / goal.monthly) * 100)) : 0;
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "America/New_York" }).format(new Date());
  const activeItems = items.filter((item) => ACTIVE_STATUSES.has(item.internal_status));
  const knownSolicitations = new Set(items.map((item) => (item.solicitation_number || "").toLowerCase()).filter(Boolean));
  const extraClaims = activeClaims.filter((claim) => !knownSolicitations.has((claim.solicitation_number || claim.external_notice_id || "").toLowerCase()));
  const activeCount = activeItems.length + extraClaims.length;
  const portals = Array.from(new Set(items.map((item) => item.portal).filter((value): value is string => Boolean(value)))).sort();
  const counts = {
    all: items.length,
    active: items.filter((item) => ACTIVE_STATUSES.has(item.internal_status)).length,
    submitted: items.filter((item) => item.internal_status === "Bid submitted").length,
    won: items.filter((item) => item.award_outcome === "won").length,
    lost: items.filter((item) => item.award_outcome === "lost").length,
  };
  const visible = items.filter((item) => {
    const needle = query.trim().toLowerCase();
    if (needle && !`${item.solicitation_number || ""} ${item.title || ""} ${item.bid_id || ""}`.toLowerCase().includes(needle)) return false;
    if (portal !== "all" && (item.portal || "") !== portal) return false;
    if (tab === "active") return ACTIVE_STATUSES.has(item.internal_status);
    if (tab === "submitted") return item.internal_status === "Bid submitted";
    if (tab === "won") return item.award_outcome === "won";
    if (tab === "lost") return item.award_outcome === "lost";
    return true;
  });
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <>
      <PageBand
        eyebrow={`${items.length} BIDS · ${activeCount} ACTIVE`}
        title="My bids"
        lead="Every solicitation assigned to you, from pickup to award"
        actions={<Link className="cf-btn cf-btn-primary" href="/opportunities"><Search size={16} strokeWidth={2} aria-hidden />Find opportunities</Link>}
      />
      <PageMain>
        <MyBidsAlerts />
        {error && (
          <div role="alert" style={{ border: "1px solid rgba(251,113,133,.45)", background: "rgba(251,113,133,.1)", color: "#BE123C", borderRadius: 12, padding: "12px 16px" }}>
            {error}
          </div>
        )}
        <section style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "stretch" }}>
          <div className="cf-card" style={{ flex: "1 1 420px", minWidth: 0, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
              <h2 className="cf-h2">{monthName} goal</h2>
              <span className="cf-lbl">Counted in ET</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
              <div><div className="cf-lbl">Submitted</div><div className="cf-kpi-v" style={{ fontSize: 34, marginTop: 6, color: "#0E7490" }}>{loading ? "—" : goal ? goal.achieved : "—"}</div></div>
              <div><div className="cf-lbl">Monthly goal</div><div className="cf-kpi-v" style={{ fontSize: 34, marginTop: 6 }}>{loading ? "—" : goal ? goal.monthly : "—"}</div></div>
              <div><div className="cf-lbl">Still to go</div><div className="cf-kpi-v" style={{ fontSize: 34, marginTop: 6 }}>{loading ? "—" : goal ? goal.left : "—"}</div></div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ position: "relative" }}>
                <div className="cf-bar" style={{ height: 8 }}>
                  <span style={{ width: `${goalPct}%` }} />
                </div>
                {pacePct > 0 ? <span style={{ position: "absolute", left: `${pacePct}%`, top: -5, width: 2, height: 18, background: "#0B1220", borderRadius: 1 }} title="Where you should be today" /> : null}
              </div>
              <div className="cf-meta" style={{ display: "flex", justifyContent: "space-between" }}>
                <span className="cf-mono">{goalPct}% DONE</span>
                <span className="cf-mono">{paceByToday == null ? "PACE MARKER UNAVAILABLE" : `PACE MARKER · ${paceByToday} BY TODAY`}</span>
              </div>
            </div>
          </div>
          <div className="cf-card" style={{ flex: "1 1 420px", minWidth: 0, display: "flex", flexDirection: "column", borderColor: "rgba(251,191,36,.4)", background: "linear-gradient(180deg, rgba(251,191,36,.06), transparent 60%), var(--cf-surface)" }}>
            <div style={{ padding: "18px 24px 6px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h2 className="cf-h2" style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Bell size={20} strokeWidth={1.75} color="#D97706" aria-hidden />
                {awardDue.length} award check{awardDue.length === 1 ? "" : "s"} need{awardDue.length === 1 ? "s" : ""} your update
              </h2>
              <button type="button" style={{ border: 0, background: "none", font: "500 13px var(--cf-body)", color: "#0E7490", cursor: "pointer", minHeight: 32 }}>Mark all read</button>
            </div>
            {awardDue.length === 0 ? (
              <p className="cf-meta" style={{ padding: "8px 24px 18px" }}>No checkpoint is due.</p>
            ) : (
              <ul style={{ listStyle: "none", margin: 0, padding: "0 24px 10px" }}>
                {awardDue.map((item) => (
                  <li key={item.id} style={{ display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "center", justifyContent: "space-between", padding: "11px 0", borderTop: "1px solid var(--cf-line)" }}>
                    <span style={{ fontSize: 14 }}>
                      <span className="cf-due">{item.current_checkpoint ? `${item.current_checkpoint.checkpoint_days}-DAY` : "CHECK"}</span>
                      {" · "}
                      <span className="cf-mono" style={{ fontWeight: 500, fontSize: 13 }}>{item.solicitation_number || item.bid_id}</span>
                      {" · "}
                      {item.title || "Untitled"}
                    </span>
                    <Link className="cf-link" href={`/bids/${item.id}`} style={{ fontSize: 13 }}>Record outcome</Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section aria-labelledby="active-h" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <h2 id="active-h" className="cf-h2">Active picked-up bids</h2>
            <p className="cf-sub">Reserved for you, including bids that haven&apos;t gone to a supplier yet</p>
          </div>
          {loading ? <Skeleton className="h-28 w-full" /> : activeCount === 0 ? (
            <p className="cf-meta">No active bids are assigned to you.</p>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(420px, 100%), 1fr))", gap: 16 }}>
              {activeItems.map((item) => {
                const waiting = item.internal_status === "Waiting Approval";
                const due = dueParts(item.due_date, item.days_remaining);
                const price = waiting ? item.submitted_price ?? item.expected_submitted_price : item.expected_submitted_price ?? item.submitted_price;
                return (
                  <Link key={item.id} className="cf-card cf-active-card" href={`/bids/${item.id}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <span className="cf-pill" style={{ ...statusStyle(item.internal_status), alignSelf: "center" }}>{formatStatus(item.internal_status)}</span>
                      <span className="cf-id-dim">{item.solicitation_number || item.bid_id} · {(item.portal || "—").toUpperCase()}</span>
                    </div>
                    <div style={{ font: "500 19px var(--cf-display)" }}>{item.title || "Untitled bid"}</div>
                    <div className="cf-kv3">
                      <div><span className="cf-lbl">Response due</span><b style={{ color: due.urgent ? "#BE123C" : undefined }}>{due.text}</b></div>
                      <div><span className="cf-lbl">{waiting ? "Bid price" : "Est. value"}</span><b className="cf-mono">{wholeMoney(price)}</b></div>
                      <div><span className="cf-lbl">{waiting ? "Approver" : "Next step"}</span><b>{waiting ? item.approved_by_name || "—" : item.internal_status === "Approved for Submission" ? "Submit on portal" : "Add supplier quote"}</b></div>
                    </div>
                  </Link>
                );
              })}
              {extraClaims.map((claim) => {
                const due = dueParts(claim.response_deadline, null);
                return (
                  <Link key={`claim-${claim.id}`} className="cf-card cf-active-card" href={`/sam-gov/${encodeURIComponent(claim.external_notice_id)}`}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                      <span className="cf-pill cf-pill-sup" style={{ alignSelf: "center" }}>Finding supplier</span>
                      <span className="cf-id-dim">{claim.solicitation_number || claim.external_notice_id} · SAM.GOV</span>
                    </div>
                    <div style={{ font: "500 19px var(--cf-display)" }}>{claim.title}</div>
                    <div className="cf-kv3">
                      <div><span className="cf-lbl">Response due</span><b style={{ color: due.urgent ? "#BE123C" : undefined }}>{claim.response_deadline ? shortDate(claim.response_deadline) : "—"}</b></div>
                      <div><span className="cf-lbl">Est. value</span><b className="cf-mono">{wholeMoney(claim.expected_bid_value)}</b></div>
                      <div><span className="cf-lbl">Next step</span><b>Add supplier quote</b></div>
                    </div>
                    {claim.stale ? <span className="cf-chip">Stale</span> : null}
                  </Link>
                );
              })}
            </div>
          )}
        </section>

        <section className="cf-card" aria-labelledby="all-h" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "18px 24px 0", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <h2 id="all-h" className="cf-h2">All my bids</h2>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                <label htmlFor="mb-q" className="sr-only">Search my bids</label>
                <input id="mb-q" className="cf-input" type="search" placeholder="Search solicitation or title" style={{ width: 260 }} value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} />
                <label htmlFor="mb-p" className="sr-only">Portal</label>
                <select id="mb-p" className="cf-select" style={{ width: "auto" }} value={portal} onChange={(event) => { setPortal(event.target.value); setPage(1); }}>
                  <option value="all">All portals</option>
                  {portals.map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
            </div>
            <nav aria-label="Filter by status" style={{ display: "flex", flexWrap: "wrap", gap: 24, borderBottom: "1px solid var(--cf-line)" }}>
              {([
                ["all", "All"],
                ["active", "Active"],
                ["submitted", "Submitted"],
                ["won", "Won"],
                ["lost", "Lost"],
              ] as const).map(([key, label]) => (
                <button key={key} type="button" className={`cf-tab${tab === key ? " cf-tab-on" : ""}`} aria-current={tab === key ? "true" : undefined} onClick={() => { setTab(key); setPage(1); }}>
                  {label} <span className="cf-count" style={key === "all" && tab === "all" ? { color: "#0E7490", background: "rgba(34,211,238,.1)" } : undefined}>{counts[key]}</span>
                </button>
              ))}
            </nav>
          </div>
          <div style={{ overflowX: "auto" }}>
            {loading ? <Skeleton className="h-40 w-full" /> : pageItems.length === 0 ? (
              <p className="cf-meta" style={{ padding: "16px 24px" }}>No bids assigned to you yet.</p>
            ) : (
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Status</th><th>Solicitation</th><th>Portal</th><th>Assigned</th><th>Due</th>
                    <th className="cf-num">Price</th><th className="cf-num">Gross profit</th><th>Outcome</th>
                  </tr>
                </thead>
                <tbody>
                  {pageItems.map((item) => {
                    const award = awardById[item.id];
                    const checkDue = award && (award.checkpoint_state === "due" || award.current_checkpoint?.state === "due");
                    const price = item.submitted_price ?? item.expected_submitted_price;
                    const dueUrgent = item.days_remaining != null && item.days_remaining <= 11;
                    const href = item.internal_status === "Bid submitted" ? `/bids/${item.id}` : `/bids/${item.id}`;
                    return (
                      <tr key={item.id} id={`summary-row-${item.id}`} style={highlightId === item.id ? { background: "rgba(251,191,36,.18)" } : undefined}>
                        <td><span className="cf-pill" style={{ ...statusStyle(item.internal_status), alignSelf: "center" }}>{formatStatus(item.internal_status)}</span></td>
                        <td>
                          <Link className="cf-id" href={href} style={{ textDecoration: "underline" }}>{item.solicitation_number || item.bid_id}</Link>
                          <div className="cf-meta">{item.title || "—"}</div>
                        </td>
                        <td>{item.portal || "—"}</td>
                        <td>{shortDate(item.assign_date)}</td>
                        <td style={{ color: dueUrgent ? "#BE123C" : undefined, fontWeight: dueUrgent ? 500 : undefined }}>{shortDate(item.due_date)}</td>
                        <td className="cf-num" style={{ color: price == null ? "var(--cf-text-3)" : undefined }}>{priceMoney(price)}</td>
                        <td className="cf-num" style={{ color: item.gross_profit == null ? "var(--cf-text-3)" : undefined }}>{priceMoney(item.gross_profit)}</td>
                        <td>
                          {item.award_outcome === "won" || item.award_outcome === "lost" || (item.internal_status === "Bid submitted" && item.award_outcome === "pending") ? (
                            <span style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                              <span className={`cf-pill ${item.award_outcome === "won" ? "cf-pill-won" : item.award_outcome === "lost" ? "cf-pill-lost" : "cf-pill-app"}`}>{item.award_outcome === "won" ? "Won" : item.award_outcome === "lost" ? "Lost" : "Pending"}</span>
                              {checkDue && item.award_outcome === "pending" ? <span className="cf-due">{award?.current_checkpoint ? `${award.current_checkpoint.checkpoint_days}-DAY CHECK DUE` : "CHECK DUE"}</span> : null}
                            </span>
                          ) : <span style={{ color: "var(--cf-text-3)" }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 24px", borderTop: "1px solid var(--cf-line)" }}>
            <span className="cf-mono cf-meta">{visible.length === 0 ? "SHOWING 0" : `SHOWING ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, visible.length)} OF ${visible.length}`}</span>
            <div style={{ display: "flex", gap: 6 }}>
              <button type="button" className="cf-btn cf-btn-secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
              <button type="button" className="cf-btn cf-btn-secondary" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
            </div>
          </div>
        </section>
        <details className="cf-card p-4">
          <summary className="cursor-pointer font-medium">Full bid worksheet</summary>
          <div className="cf-table-scroll" role="region" aria-label="Full bid worksheet" tabIndex={0}>
            <PipelineTable items={visible} variant="my-bids" empty="No matching bids." highlightId={highlightId} />
          </div>
        </details>
      </PageMain>
    </>
  );
}
