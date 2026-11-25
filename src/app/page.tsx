"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Award, Calendar, Check, Clock, Search, TriangleAlert } from "lucide-react";
import { getStoredUser, getUserDisplayName } from "@/lib/auth";
import { formatMoney, initials, type StatsPayload } from "@/lib/stats";
import { HUNDRED_K_THRESHOLD, type PipelineItem } from "@/lib/pipeline";
import type { AwardTrackingItem, AwardTrackingSummary } from "@/lib/awards";
import { easternReportingRange, easternTodayUtc, formatUtcDateRange } from "@/lib/eastern-date";
import { DASHBOARD_PERIOD_LABELS, dashboardQuarters, dashboardReportingRange, easternSubmissionDay, type DashboardPeriod } from "@/lib/dashboard-reporting";
import { isProductRfq } from "@/lib/ai-suggestion-prefilter";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const GoalPaceChart = dynamic(() => import("@/components/GoalPaceChart"), {
  ssr: false,
});

const WeeklyBars = dynamic(() => import("@/components/WeeklyBars"), { ssr: false });

const DashboardTable = dynamic(() => import("@/components/DashboardTable"), {
  ssr: false,
});

interface DashboardStats {
  active_negotiations: number;
  bids_submitted: number;
  completed_negotiations: number;
  total_sessions: number;
  total_target_value: number;
  total_suppliers_engaged: number;
  suppliers_responded: number;
  total_savings: number;
  recent_activity: number;
}

function compactMoney(value: number) {
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1000000) return `${sign}$${(abs / 1000000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (abs >= 1000) return `${sign}$${(abs / 1000).toFixed(abs >= 100000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return formatMoney(value);
}

function priceMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function submittedStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(date).toUpperCase();
  const time = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" }).format(date);
  return `${day} · ${time}`;
}

function dueLabel(value?: string | null) {
  if (!value) return { text: "—", urgent: false, short: "—" };
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return { text: value, urgent: false, short: value };
  const days = Math.ceil((due.getTime() - Date.now()) / 86400000);
  const date = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(due);
  return { text: `${date} · ${days} day${days === 1 ? "" : "s"}`, urgent: days <= 11, short: `${date} · ${Math.max(days, 0)}D`.toUpperCase() };
}

function weekBuckets(items: PipelineItem[]) {
  const today = easternTodayUtc();
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  return [3, 2, 1, 0].map((ago) => {
    const start = new Date(monday);
    start.setUTCDate(start.getUTCDate() - ago * 7);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const count = items.filter((item) => {
      if (!item.submitted_at) return false;
      const stamp = easternTodayUtc(new Date(item.submitted_at));
      return stamp >= start && stamp <= end;
    }).length;
    const label = ago === 0
      ? "THIS WEEK"
      : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(start).toUpperCase();
    return { label, count, current: ago === 0 };
  });
}

function sumNumbers(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => value != null && !Number.isNaN(Number(value)));
  if (!present.length) return null;
  return present.reduce((total, value) => total + Number(value), 0);
}

function PortalMix({
  wide,
  periodLabel,
  rows,
  sizes,
}: {
  wide?: boolean;
  periodLabel: string;
  rows: Array<{ name: string; count: number; value: number }>;
  sizes: { Small: number; Medium: number; Large: number; "Very Large": number };
}) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  const swatches = [
    ["#A5F3FC", "Small <$50K", sizes.Small],
    ["#06B6D4", "Medium", sizes.Medium],
    ["#0E7490", "Large $100K+", sizes.Large],
    ["#164E63", "Very large $500K+", sizes["Very Large"]],
  ] as const;
  return (
    <div className={wide ? "cf-card" : "cf-card cf-split-side"} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h2 className="cf-h2">Submissions by portal</h2>
        <p className="cf-sub">{periodLabel} · count and submitted value</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {rows.length ? rows.map((row) => (
          <div key={row.name} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
              <span style={{ fontWeight: 500 }}>{row.name}</span>
              <span className="cf-mono" style={{ fontSize: 13, color: "var(--cf-text-2)" }}>{row.count} · {compactMoney(row.value)}</span>
            </div>
            <div className="cf-bar" style={{ height: 8 }}><span style={{ width: `${(row.count / max) * 100}%` }} /></div>
          </div>
        )) : <p className="cf-meta">No submissions for this period.</p>}
      </div>
      <div style={{ borderTop: "1px solid var(--cf-line)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="cf-lbl">Bid size mix</div>
        {rows.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 2, height: 14, borderRadius: 4, overflow: "hidden" }} role="img" aria-label={`Small ${sizes.Small}, Medium ${sizes.Medium}, Large ${sizes.Large}, Very large ${sizes["Very Large"]}`}>
              {swatches.map(([color, , count]) => count > 0 ? <div key={color} style={{ flex: count, background: color }} /> : null)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px 16px", fontSize: 13, color: "var(--cf-text-2)" }}>
              {swatches.map(([color, label, count]) => (
                <span key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flex: "none" }} />
                  {label} · {count}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

interface PulsePeriod {
  key: "today" | "week" | "month";
  label: string;
  date_from: string;
  date_to: string;
  picked_up: number;
  submitted: number;
  submitted_value?: number;
  gross_profit?: number;
}

export default function DashboardPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [role, setRole] = useState<"admin" | "agent" | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [reportingPeriod, setReportingPeriod] = useState<DashboardPeriod>("mtd");
  const [quarterOffset, setQuarterOffset] = useState(0);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<"today" | "week" | "report">("report");
  const [duplicateFlags, setDuplicateFlags] = useState<Array<{ id: number; solicitation_number: string; attempted_by?: { full_name: string }; existing_agent?: { full_name: string }; detected_at: string }>>([]);
  const [staleFlags, setStaleFlags] = useState<Array<{ claim_id: number; solicitation_number: string | null; title: string; assignee?: { full_name: string }; last_status_at: string | null; href?: string }>>([]);
  const [awardFlags, setAwardFlags] = useState<Array<{ bid_id: number; display_bid_id: string; solicitation_number: string | null; title: string | null; agent_name: string | null; submitted_on: string | null; days_since_submission: number | null; href: string }>>([]);
  const [rosterRules, setRosterRules] = useState<Array<{ id: number; full_name: string; active_bid_limit: number; dollar_ceiling: number; is_active: boolean; role: string }>>([]);
  const [statusActivity, setStatusActivity] = useState<Array<{ id: number; bid_id: number; solicitation_number: string; changed_by_name: string; old_status: string; new_status: string; changed_at_eastern: string }>>([]);
  const [periods, setPeriods] = useState<PulsePeriod[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [companyStats, setCompanyStats] = useState<StatsPayload | null>(null);
  const [dashView, setDashView] = useState<"overview" | "agent" | "portal">("overview");
  const [myGoal, setMyGoal] = useState<{ achieved: number; monthly: number; left: number } | null>(null);
  const [myClaims, setMyClaims] = useState<Array<{ id: number; external_notice_id: string; solicitation_number?: string | null; title: string; expected_bid_value?: number | null; response_deadline?: string | null; state: string }>>([]);
  const [myBidItems, setMyBidItems] = useState<PipelineItem[]>([]);
  const [awardDue, setAwardDue] = useState<AwardTrackingItem[]>([]);
  const [awardSummary, setAwardSummary] = useState<AwardTrackingSummary | null>(null);
  const [suggestions, setSuggestions] = useState<Array<{ id: string; solicitationNumber?: string; title: string; department?: string; closingDate?: string; fitReason?: string }>>([]);
  const [pipelineItems, setPipelineItems] = useState<PipelineItem[]>([]);
  const [pipelineAvailable, setPipelineAvailable] = useState(false);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.replace("/register");
      return;
    }
    setUserId(user.id);
    setCompanyId(user.company_id);
    setRole(user.role);
    setAuthChecked(true);
  }, [router]);

  useEffect(() => {
    if (!authChecked || userId === null || companyId === null) return;

    const fetchStats = async () => {
      try {
        const res = await fetch(
          `/api/sam-gov/dashboard-stats?company_id=${companyId}&requester_user_id=${userId}`,
          {
          cache: 'no-store',
          }
        );
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
        }
        if (role === 'admin') {
          const now = easternTodayUtc();
          const statsQuery = new URLSearchParams({
            company_id: String(companyId),
            requester_user_id: String(userId),
            year: String(now.getUTCFullYear()),
            month: String(now.getUTCMonth() + 1),
          });
          const [flagsResponse, staleResponse, teamResponse, activityResponse, pulseResponse, statsResponse] = await Promise.all([
            fetch('/api/backend/opportunities/duplicates', { cache: 'no-store' }),
            fetch('/api/backend/opportunities/stale', { cache: 'no-store' }),
            fetch('/api/backend/auth/team', { cache: 'no-store' }),
            fetch('/api/backend/pipeline/activity?limit=20&offset=0', { cache: 'no-store' }),
            fetch('/api/backend/pipeline/dashboard-pulse', { cache: 'no-store' }),
            Promise.resolve().then(() => fetch(`/api/backend/stats?${statsQuery.toString()}`, { cache: 'no-store' })).catch(() => null),
          ]);
          if (flagsResponse.ok) {
            const flagsData = await flagsResponse.json();
            setDuplicateFlags(flagsData.incidents || []);
          }
          if (staleResponse.ok) {
            const staleData = await staleResponse.json();
            setStaleFlags(staleData.bids || []);
          }
          if (teamResponse.ok) {
            const teamData = await teamResponse.json();
            setRosterRules((teamData.members || []).filter((member: { role: string }) => member.role === 'agent'));
          }
          if (activityResponse.ok) {
            const activityData = await activityResponse.json();
            setStatusActivity(activityData.items || []);
          }
          if (pulseResponse.ok) {
            const pulseData = await pulseResponse.json();
            setPeriods(pulseData.periods || []);
          }
          if (statsResponse?.ok) {
            const statsData = await statsResponse.json();
            setCompanyStats(statsData);
          }
          // 90-day award flags (KAN-68) load on their own so a failure never hides the other flags.
          try {
            const awardFlagsResponse = await fetch('/api/backend/pipeline/award-flags', { cache: 'no-store' });
            if (awardFlagsResponse.ok) {
              const awardFlagsData = await awardFlagsResponse.json();
              setAwardFlags(awardFlagsData.flags || []);
            }
          } catch (err) {
            console.error("Failed to fetch award flags:", err);
          }
          try {
            const pipelineResponse = await fetch(`/api/backend/pipeline?company_id=${companyId}&requester_user_id=${userId}`, { cache: "no-store" });
            if (pipelineResponse.ok) {
              const pipelineData = await pipelineResponse.json();
              setPipelineItems(pipelineData.items || []);
              setPipelineAvailable(true);
            }
          } catch (err) {
            console.error("Failed to fetch pipeline:", err);
          }
        }
      } catch (err) {
        console.error("Failed to fetch dashboard stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [authChecked, companyId, role, userId]);

  useEffect(() => {
    if (!authChecked || role !== "agent" || userId === null || companyId === null) return;
    let cancelled = false;
    const query = new URLSearchParams({
      company_id: String(companyId),
      requester_user_id: String(userId),
    });
    const loadAgent = async () => {
      try {
        const [goalRes, claimsRes, bidsRes, awardsRes] = await Promise.all([
          fetch(`/api/backend/stats/my-goal?${query}`, { cache: "no-store" }),
          fetch("/api/backend/opportunities/mine", { cache: "no-store" }),
          fetch(`/api/backend/pipeline/my-bids?${query}`, { cache: "no-store" }),
          fetch(`/api/backend/pipeline/award-tracking?${query}`, { cache: "no-store" }),
        ]);
        if (cancelled) return;
        if (goalRes.ok) {
          const goalData = await goalRes.json();
          setMyGoal({
            achieved: Number(goalData.achieved || 0),
            monthly: Number(goalData.monthly || 0),
            left: Number(goalData.left || 0),
          });
        }
        if (claimsRes.ok) {
          const claimsData = await claimsRes.json();
          setMyClaims((claimsData.opportunities || []).filter((claim: { state: string }) => claim.state === "assigned"));
        }
        if (bidsRes.ok) {
          const bidsData = await bidsRes.json();
          setMyBidItems(bidsData.items || []);
        }
        if (awardsRes.ok) {
          const awardsData = await awardsRes.json();
          const items = (awardsData.items || []) as AwardTrackingItem[];
          setAwardDue(items.filter((item) => item.checkpoint_state === "due" || item.checkpoint_state === "flagged" || item.current_checkpoint?.state === "due"));
          setAwardSummary(awardsData.summary || null);
        }
        try {
          const catalogRes = await fetch("/api/sam-gov", { cache: "no-store" });
          if (catalogRes.ok && !cancelled) {
            const catalog = await catalogRes.json();
            const opportunities = (Array.isArray(catalog) ? catalog : []).filter(isProductRfq).slice(0, 40);
            if (opportunities.length) {
              const suggestRes = await fetch("/api/sam-gov/ai-suggestions", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ opportunities }),
              });
              if (suggestRes.ok && !cancelled) {
                const suggestData = await suggestRes.json();
                setSuggestions((suggestData.suggestions || []).slice(0, 3));
              }
            }
          }
        } catch (suggestErr) {
          console.error("Failed to fetch suggestions:", suggestErr);
        }
      } catch (err) {
        console.error("Failed to fetch agent dashboard:", err);
      }
    };
    loadAgent();
    return () => {
      cancelled = true;
    };
  }, [authChecked, companyId, role, userId]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(2)}`;
  };

  const drillDownId = selectedEmployee || (rosterRules[0] ? String(rosterRules[0].id) : "");

  if (!authChecked) {
    return <div className="cf-wrap cf-main">Loading...</div>;
  }

  const monthLabel = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" }).format(new Date());
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }).format(new Date()));
  const dayPart = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const firstName = getUserDisplayName(getStoredUser()).split(" ")[0] || "there";
  const agentGoal = myGoal?.monthly || 0;
  const agentDone = myGoal?.achieved || 0;
  const agentPct = agentGoal > 0 ? Math.min(100, Math.round((agentDone / agentGoal) * 100)) : 0;
  const agentMonth = easternReportingRange("month").to.slice(0, 7);
  const agentSubmitted = myBidItems.filter((item) => easternSubmissionDay(item.submitted_at).startsWith(agentMonth));
  const agentValue = sumNumbers(agentSubmitted.map((item) => item.submitted_price));
  const agentProfit = sumNumbers(agentSubmitted.map((item) => item.gross_profit));
  const agentMarkups = agentSubmitted.map((item) => item.markup_percent).filter((value): value is number => value != null);
  const agentMarkup = agentMarkups.length ? agentMarkups.reduce((total, value) => total + value, 0) / agentMarkups.length : null;
  const activeBids = myBidItems.filter((item) => ["Finding Supplier", "Waiting Approval", "Approved for Submission", "Bid No Approved"].includes(item.internal_status));
  const weeks = weekBuckets(myBidItems);

  const negotiationSummary = <section className="cf-card p-5">
    <h2 className="cf-h2">Negotiations</h2>
    {stats && <dl className="cf-facts">
      {[["Active negotiations", stats.active_negotiations], ["Total sessions", stats.total_sessions],
        ["Suppliers engaged", stats.total_suppliers_engaged], ["Suppliers responded", stats.suppliers_responded],
        ["Negotiation savings", stats.total_savings == null ? "—" : formatMoney(stats.total_savings)]].map(([label, value]) =>
        <div className="cf-fact" key={label}><dt className="cf-lbl">{label}</dt><dd>{value ?? "—"}</dd></div>)}
    </dl>}
    <Link className="cf-link" href="/negotiations">Open negotiations</Link>
  </section>;
  if (role === "agent") {
    return (
      <>
        <section className="cf-band">
          <div className="cf-wrap cf-band-in">
            <div>
              <div className="cf-eyebrow">{new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }).format(new Date())}</div>
              <h1 className="cf-h1">Good {dayPart}, {firstName}</h1>
              <p className="cf-lead">
                {myGoal
                  ? myGoal.left <= 0
                    ? `You've hit your goal of ${myGoal.monthly} — nice work.`
                    : `You need ${myGoal.left} more bids this month to hit your goal of ${myGoal.monthly}.`
                  : "Your government contract opportunities and progress"}
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
              <Link className="cf-btn cf-btn-secondary" href="/my-bids">My bids</Link>
              <Link className="cf-btn cf-btn-primary" href="/opportunities"><Search size={16} strokeWidth={2} />Find opportunities</Link>
            </div>
          </div>
        </section>
        <main className="cf-wrap cf-main">
          <section className="cf-grid-kpi" aria-label="My numbers">
            <div className="cf-card cf-kpi cf-kpi-hero">
              <div className="cf-lbl" style={{ color: "#0E7490" }}>My bids · {monthLabel}</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span className="cf-kpi-v" style={{ fontSize: 36 }}>{loading ? "—" : agentDone}</span>
                <span className="cf-mono" style={{ fontSize: 14, color: "var(--cf-text-2)" }}>/ {agentGoal || "—"} goal</span>
              </div>
              <div className="cf-bar"><span style={{ width: `${agentPct}%` }} /></div>
            </div>
            <div className="cf-card cf-kpi">
              <div className="cf-lbl">Submitted value</div>
              <div className="cf-kpi-v">{agentValue == null ? "—" : formatMoney(agentValue)}</div>
              <div className="cf-meta">Month-over-month change is not in this feed</div>
            </div>
            <div className="cf-card cf-kpi">
              <div className="cf-lbl">Gross profit</div>
              <div className="cf-kpi-v">{agentProfit == null ? "—" : formatMoney(agentProfit)}</div>
              <div className="cf-meta">{agentMarkup == null ? "Average markup is not in this feed" : `${agentMarkup.toFixed(1)}% avg. markup`}</div>
            </div>
            <div className="cf-card cf-kpi">
              <div className="cf-lbl">Win rate · 90 days</div>
              <div className="cf-kpi-v">{awardSummary?.win_rate == null ? "—" : `${Math.round(awardSummary.win_rate)}%`}</div>
              <div className="cf-meta">{awardSummary?.outcomes ? `${awardSummary.outcomes.won} won · ${awardSummary.outcomes.lost} lost` : "Won and lost counts are not in this feed"}</div>
            </div>
            {/* Active negotiations and raw bid-count tiles are not on the agent design. */}
            <Link className="cf-card cf-kpi cf-kpi-warn" href="/award-tracking">
              <div className="cf-lbl" style={{ color: "#B45309" }}>Award checks due</div>
              <div className="cf-kpi-v">{awardDue.length}</div>
              <span className="cf-link" style={{ fontSize: 12 }}>Record outcomes →</span>
            </Link>
          </section>

          <section className="cf-split">
            <div className="cf-card cf-split-main">
              <div className="cf-card-hd">
                <div>
                  <h2 className="cf-h2">My active bids</h2>
                  <p className="cf-sub">Picked up and not yet submitted</p>
                </div>
                <Link className="cf-link" href="/my-bids">All my bids</Link>
              </div>
              <div style={{ display: "flex", flexDirection: "column", padding: "0 24px 12px" }}>
                {activeBids.length === 0 && myClaims.length === 0 ? (
                  <p className="cf-meta" style={{ padding: "8px 0 12px" }}>No picked-up bids are waiting on you.</p>
                ) : activeBids.length ? activeBids.map((item) => {
                  const waiting = item.internal_status === "Waiting Approval";
                  const due = dueLabel(item.due_date);
                  const price = waiting ? item.submitted_price ?? item.expected_submitted_price : item.expected_submitted_price ?? item.submitted_price;
                  return (
                    <div key={item.id} className="cf-row">
                      <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                          <span className={`cf-pill ${waiting ? "cf-pill-app" : "cf-pill-sup"}`}>{item.internal_status}</span>
                          <span className="cf-id-dim">{item.solicitation_number || item.bid_id} · {(item.portal || "—").toUpperCase()}</span>
                        </div>
                        <Link href={`/bids/${item.id}`} style={{ font: "500 17px var(--cf-display)", color: "var(--cf-text)", textDecoration: "none" }}>{item.title || "Untitled bid"}</Link>
                        <div className="cf-meta" style={{ fontSize: 13 }}>{waiting ? `Sent for approval${item.approved_by_name ? ` to ${item.approved_by_name}` : ""}` : "Next step: add a supplier quote"}</div>
                      </div>
                      <div className="cf-kv"><span className="cf-lbl">Response due</span><b style={due.urgent ? { color: "#BE123C" } : undefined}>{due.text}</b></div>
                      <div className="cf-kv"><span className="cf-lbl">{waiting ? "Bid price" : "Est. value"}</span><b className="cf-mono">{price == null ? "—" : formatMoney(price)}</b></div>
                      <Link className={`cf-btn ${waiting ? "cf-btn-secondary" : "cf-btn-primary"}`} href={`/bids/${item.id}`}>{waiting ? "View" : "Continue"}</Link>
                    </div>
                  );
                }) : myClaims.map((claim) => {
                  const due = dueLabel(claim.response_deadline);
                  return (
                    <div key={claim.id} className="cf-row">
                      <div style={{ flex: "1 1 320px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                          <span className="cf-pill cf-pill-sup">Finding supplier</span>
                          <span className="cf-id-dim">{claim.solicitation_number || claim.external_notice_id} · SAM.GOV</span>
                        </div>
                        <Link href={`/sam-gov/${encodeURIComponent(claim.external_notice_id)}`} style={{ font: "500 17px var(--cf-display)", color: "var(--cf-text)", textDecoration: "none" }}>{claim.title}</Link>
                        <div className="cf-meta" style={{ fontSize: 13 }}>Next step: add a supplier quote</div>
                      </div>
                      <div className="cf-kv"><span className="cf-lbl">Response due</span><b style={due.urgent ? { color: "#BE123C" } : undefined}>{due.text}</b></div>
                      <div className="cf-kv"><span className="cf-lbl">Est. value</span><b className="cf-mono">{claim.expected_bid_value != null ? formatMoney(claim.expected_bid_value) : "—"}</b></div>
                      <Link className="cf-btn cf-btn-primary" href={`/sam-gov/${encodeURIComponent(claim.external_notice_id)}`}>Continue</Link>
                    </div>
                  );
                })}
              </div>
            </div>
            <aside className="cf-card cf-split-side" aria-labelledby="checks-h" style={{ display: "flex", flexDirection: "column" }}>
              <div className="cf-card-hd">
                <h2 id="checks-h" className="cf-h2">Award checks due</h2>
                <span className="cf-mono" style={{ fontSize: 11, fontWeight: 500, color: "#B45309", background: "rgba(251,191,36,.1)", border: "1px solid rgba(251,191,36,.3)", padding: "3px 10px", borderRadius: 999 }}>{awardDue.length} DUE</span>
              </div>
              {awardDue.length === 0 ? (
                <p className="cf-meta" style={{ padding: "0 24px 20px" }}>No checkpoint is due.</p>
              ) : (
                <ul style={{ listStyle: "none", margin: 0, padding: "0 24px 12px" }}>
                  {awardDue.slice(0, 5).map((item) => (
                    <li key={item.id} style={{ display: "flex", flexDirection: "column", gap: 4, padding: "14px 0", borderTop: "1px solid var(--cf-line)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                        <span className="cf-lbl" style={{ color: "#B45309" }}>{item.current_checkpoint ? `${item.current_checkpoint.checkpoint_days}-day check` : "Award check"}</span>
                        <span className="cf-meta">{item.submitted_on ? `Submitted ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(new Date(item.submitted_on))}` : "Submitted date unavailable"}</span>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 500 }}><span className="cf-mono" style={{ fontSize: 13 }}>{item.solicitation_number || item.bid_id}</span> · {item.title || "Untitled"}</span>
                      <Link className="cf-link" href={`/bids/${item.id}`} style={{ fontSize: 13 }}>Record outcome</Link>
                    </li>
                  ))}
                </ul>
              )}
            </aside>
          </section>

          <section className="cf-split">
            <div className="cf-card" style={{ flex: "1 1 420px", minWidth: 0, padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
                <div>
                  <h2 className="cf-h2">My weekly submissions</h2>
                  <p className="cf-sub">Monday–Sunday, Eastern Time · goal 5 a week</p>
                </div>
                <Link className="cf-link" href="/agent-bid-data">Reports</Link>
              </div>
              <WeeklyBars weeks={weeks} goal={5} />
            </div>
          </section>

          <section className="cf-card" aria-labelledby="sugg-h" style={{ display: "flex", flexDirection: "column" }}>
            <div className="cf-card-hd">
              <div>
                <h2 id="sugg-h" className="cf-h2">Suggested for you</h2>
                <p className="cf-sub">Unclaimed opportunities similar to bids you have won</p>
              </div>
              <Link className="cf-link" href="/opportunities">All opportunities</Link>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(300px, 100%), 1fr))", gap: 16, padding: "12px 24px 24px" }}>
              {suggestions.length === 0 ? (
                <p className="cf-meta">Suggestions appear when the AI suggestions feed returns matches.</p>
              ) : suggestions.map((item) => {
                const due = dueLabel(item.closingDate);
                return (
                  <div key={item.id} className="cf-sugg">
                    <div className="cf-id-dim">{(item.solicitationNumber || item.id).toUpperCase()} · {(item.department || "SAM.GOV").toUpperCase()}</div>
                    <div style={{ font: "500 17px var(--cf-display)" }}>{item.title}</div>
                    <div style={{ fontSize: 13, color: "var(--cf-text-2)" }}>{item.fitReason || "Similar to bids you have worked"}</div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 6 }}>
                      <span className="cf-mono" style={{ fontSize: 12, color: "var(--cf-text-2)" }}>{item.closingDate ? `DUE ${due.short}` : "DUE —"}</span>
                      <Link className="cf-btn cf-btn-primary" href={`/sam-gov/${encodeURIComponent(item.id)}`} style={{ minHeight: 36 }}>Pick up</Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          {negotiationSummary}
        <section className="cf-card" style={{ padding: "20px 24px" }}>
          <h2 className="cf-h2">Recent opportunities</h2>
          <DashboardTable />
        </section>
        </main>
      </>
    );
  }

  const pulseCards: PulsePeriod[] = periods.length ? periods : [
    { key: "today" as const, label: "Today", date_from: "", date_to: "", picked_up: 0, submitted: 0 },
    { key: "week" as const, label: "This week", date_from: "", date_to: "", picked_up: 0, submitted: 0 },
    { key: "month" as const, label: "This month", date_from: "", date_to: "", picked_up: 0, submitted: 0 },
  ];
  const today = easternTodayUtc();
  const report = dashboardReportingRange(reportingPeriod, today, quarterOffset);
  const reportDates = formatUtcDateRange(report.start, report.through);
  const periodLabel = DASHBOARD_PERIOD_LABELS[reportingPeriod];
  const employees = new Map((companyStats?.employees ?? []).map((employee) => [employee.user_id, employee]));
  const agentIds = new Set([...Array.from(employees.keys()), ...rosterRules.map((member) => member.id)]);
  const activeAgents = new Set([
    ...Array.from(employees.values()).filter((employee) => employee.is_active).map((employee) => employee.user_id),
    ...rosterRules.filter((member) => member.is_active).map((member) => member.id),
  ]);
  const allSubmissions = pipelineItems
    .filter((item) => item.internal_status === "Bid submitted" && item.submitted_price != null && agentIds.has(item.agent_user_id))
    .map((item) => ({ item, day: easternSubmissionDay(item.submitted_at), price: item.submitted_price! }));
  const submissions = allSubmissions.filter(({ day }) => day >= report.startKey && day <= report.endKey);
  const submittedCount = submissions.length;
  const monthlyGoal = companyStats?.monthly_goal?.monthly;
  const teamGoal = (monthlyGoal ?? 0) * report.months;
  const goalPct = teamGoal > 0 ? Math.round((submittedCount / teamGoal) * 100) : 0;
  const paceBehind = pipelineAvailable && report.elapsed < report.days ? Math.max(Math.round(teamGoal * report.elapsed / report.days) - submittedCount, 0) : 0;
  let paceWeekdays = 0;
  for (const day = new Date(report.through); day <= report.last; day.setUTCDate(day.getUTCDate() + 1)) {
    if (day.getUTCDay() > 0 && day.getUTCDay() < 6) paceWeekdays += 1;
  }
  const attentionCount = (paceBehind > 0 ? 1 : 0) + 2 + 1 + (duplicateFlags.length === 0 && staleFlags.length === 0 ? 1 : 0);
  const finding = pipelineItems.filter((item) => item.internal_status === "Finding Supplier");
  const waiting = pipelineItems.filter((item) => item.internal_status === "Waiting Approval");
  const submittedNow = pipelineItems.filter((item) => item.internal_status === "Bid submitted");
  const won = pipelineItems.filter((item) => item.award_outcome === "won");
  const resolvedOutcomes = pipelineItems
    .filter((item) => item.award_outcome === "won" || item.award_outcome === "lost")
    .map((item) => ({ item, day: easternSubmissionDay(item.outcome_updated_at) }));
  const reportOutcomes = resolvedOutcomes.filter(({ day }) => day >= report.startKey && day <= report.endKey);
  const selectedAwards = reportOutcomes.filter(({ item }) => item.award_outcome === "won");
  const winRate = reportOutcomes.length ? Math.round(100 * selectedAwards.length / reportOutcomes.length) : null;
  const lostCount = pipelineItems.filter((item) => item.award_outcome === "lost").length;
  const pendingCount = pipelineItems.filter((item) => item.award_outcome === "pending").length;
  const findingValue = sumNumbers(finding.map((item) => item.expected_submitted_price ?? item.submitted_price));
  const waitingValue = sumNumbers(waiting.map((item) => item.expected_submitted_price ?? item.submitted_price));
  const dueSoonKnown = finding.some((item) => item.days_remaining != null);
  const dueSoon = finding.filter((item) => item.days_remaining != null && item.days_remaining <= 2).length;
  const submittedValue = submissions.reduce((sum, { price }) => sum + price, 0);
  const grossProfit = sumNumbers(submissions.map(({ item }) => item.gross_profit));
  const supplierCost = sumNumbers(submissions.map(({ item }) => item.supplier_cost ?? item.cost));
  const awardedValue = sumNumbers(selectedAwards.map(({ item }) => item.awarded_amount));
  const pipelineSubmittedValue = sumNumbers(submittedNow.map((item) => item.submitted_price));
  const pipelineGrossProfit = sumNumbers(submittedNow.map((item) => item.gross_profit));
  const pipelineAwardedValue = sumNumbers(won.map((item) => item.awarded_amount));
  const markups = submissions.map(({ item }) => item.markup_percent).filter((value): value is number => value != null);
  const avgMarkup = markups.length ? markups.reduce((total, value) => total + value, 0) / markups.length : null;
  const sizes = { Small: 0, Medium: 0, Large: 0, "Very Large": 0 };
  const portalTotals = new Map<string, { name: string; count: number; value: number }>();
  const dailyCounts = new Map<string, number>();
  for (const { item, day, price } of submissions) {
    const size = price >= 500_000 ? "Very Large" : price >= HUNDRED_K_THRESHOLD ? "Large" : price >= 50_000 ? "Medium" : "Small";
    sizes[size] += 1;
    const rawPortal = item.portal?.trim() || "Unspecified";
    const name = /^sam\.?gov$/i.test(rawPortal) ? "SAM.GOV" : rawPortal;
    const key = name.toLowerCase();
    const portal = portalTotals.get(key) ?? { name, count: 0, value: 0 };
    portal.count += 1;
    portal.value += price;
    portalTotals.set(key, portal);
    dailyCounts.set(day, (dailyCounts.get(day) ?? 0) + 1);
  }
  const portalDisplay = Array.from(portalTotals.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const monthlyBreakdown = Array.from({ length: report.months }, (_, index) => {
    const date = new Date(Date.UTC(report.start.getUTCFullYear(), report.start.getUTCMonth() + index, 1));
    if (date > report.through) return null;
    const month = date.toISOString().slice(0, 7);
    const rows = submissions.filter(({ day }) => day.startsWith(month));
    return {
      month,
      label: date.toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }),
      count: rows.length,
      value: rows.reduce((sum, { price }) => sum + price, 0),
    };
  });
  const leaderboardRange = leaderboardPeriod === "report"
    ? { from: report.startKey, to: report.endKey }
    : easternReportingRange(leaderboardPeriod);
  const leaderboard = new Map<number, { user_id: number; name: string; bid_count: number; amount: number; grossProfit: number | null }>();
  for (const { item, day, price } of allSubmissions) {
    if (day < leaderboardRange.from || day > leaderboardRange.to || !activeAgents.has(item.agent_user_id)) continue;
    const id = item.agent_user_id;
    const entry = leaderboard.get(id) ?? { user_id: id, name: employees.get(id)?.name || item.agent_name || "Agent", bid_count: 0, amount: 0, grossProfit: null };
    entry.bid_count += 1;
    entry.amount += price;
    if (item.gross_profit != null) entry.grossProfit = (entry.grossProfit ?? 0) + item.gross_profit;
    leaderboard.set(id, entry);
  }
  const agentOutcomes = new Map<number, { won: number; total: number }>();
  for (const { item, day } of resolvedOutcomes) {
    if (day < leaderboardRange.from || day > leaderboardRange.to) continue;
    const entry = agentOutcomes.get(item.agent_user_id) ?? { won: 0, total: 0 };
    entry.total += 1;
    if (item.award_outcome === "won") entry.won += 1;
    agentOutcomes.set(item.agent_user_id, entry);
  }
  const byAmount = Array.from(leaderboard.values()).sort((a, b) => b.amount - a.amount || b.bid_count - a.bid_count || a.name.localeCompare(b.name) || a.user_id - b.user_id);
  const byCount = Array.from(leaderboard.values()).sort((a, b) => b.bid_count - a.bid_count || b.amount - a.amount || a.name.localeCompare(b.name) || a.user_id - b.user_id);
  const latestSubmissions = submissions.map(({ item }) => item).sort((a, b) => Date.parse(b.submitted_at!) - Date.parse(a.submitted_at!)).slice(0, 5);
  const portalMix = (
    <PortalMix wide={dashView === "portal"} periodLabel={report.label} rows={portalDisplay} sizes={sizes} />
  );

  return (
    <>
      <section className="cf-band">
        <div className="cf-wrap cf-band-in">
          <div>
            <div className="cf-eyebrow">Manager view</div>
            <h1 className="cf-h1">Bid performance</h1>
            <div className="cf-lead flex-wrap">
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#059669", boxShadow: "0 0 10px #059669" }} />
              Live sync · {loading ? "loading" : "updated just now"}
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <div className="cf-seg-wrap" role="group" aria-label="Dashboard view">
              {([
                ["overview", "Overview"],
                ["agent", "By agent"],
                ["portal", "By portal"],
              ] as const).map(([key, label]) => (
                <button key={key} type="button" className={`cf-seg${dashView === key ? " cf-seg-on" : ""}`} aria-pressed={dashView === key} onClick={() => setDashView(key)}>{label}</button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={reportingPeriod} onValueChange={(value: DashboardPeriod) => {
                setReportingPeriod(value);
                setLeaderboardPeriod("report");
              }}>
                <SelectTrigger aria-label="Reporting period" className="cf-select !w-[11.5rem]">
                  <span className="!flex items-center gap-2">
                    <Calendar size={16} strokeWidth={1.75} className="shrink-0" aria-hidden="true" />
                    <SelectValue />
                  </span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="mtd">Month to date (MTD)</SelectItem>
                  <SelectItem value="quarter">Quarterly</SelectItem>
                  <SelectItem value="ytd">Year to date (YTD)</SelectItem>
                </SelectContent>
              </Select>
              {reportingPeriod === "quarter" && (
                <Select value={String(quarterOffset)} onValueChange={(value) => {
                  setQuarterOffset(Number(value));
                  setLeaderboardPeriod("report");
                }}>
                  <SelectTrigger aria-label="Reporting quarter" className="cf-select !w-28"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {dashboardQuarters(today).map(({ label }, offset) => <SelectItem key={label} value={String(offset)}>{label}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            <Link className="cf-btn cf-btn-secondary" href="/stats">
              Stats
            </Link>
          </div>
        </div>
      </section>
      <main className="cf-wrap cf-main">
        <p className="cf-meta" role="status">{report.label} · {reportDates} ET{loading ? " · Loading bid data" : ""}</p>
        {!loading && !pipelineAvailable && <p role="alert">Could not load bid data. Refresh to try again.</p>}
        <section className="cf-grid-kpi" aria-label="Key figures">
          <div className="cf-card cf-kpi cf-kpi-hero">
            <div className="cf-lbl" style={{ color: "#0E7490" }}>Bids submitted · {periodLabel}</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="cf-kpi-v" style={{ fontSize: 36 }}>{pipelineAvailable ? submittedCount : "—"}</span>
              {monthlyGoal != null && <span className="cf-mono" style={{ fontSize: 14, color: "var(--cf-text-2)" }}>/ {teamGoal} goal</span>}
            </div>
            {teamGoal > 0 && pipelineAvailable && <>
              <div className="cf-bar"><span style={{ width: `${Math.min(100, goalPct)}%` }} /></div>
              <div className="cf-meta">{goalPct}% of goal · {Math.max(0, teamGoal - submittedCount)} left</div>
            </>}
          </div>
          <div className="cf-card cf-kpi">
            <div className="cf-lbl">Submitted value</div>
            <div className="cf-kpi-v">{pipelineAvailable ? formatMoney(submittedValue) : "—"}</div>
            <div className="cf-meta">{report.label}</div>
          </div>
          <div className="cf-card cf-kpi">
            <div className="cf-lbl">Gross profit</div>
            <div className="cf-kpi-v">{grossProfit == null ? "—" : formatMoney(grossProfit)}</div>
            <div className="cf-meta">{report.label}</div>
          </div>
          <div className="cf-card cf-kpi">
            <div className="cf-lbl">Avg. markup</div>
            <div className="cf-kpi-v">{avgMarkup == null ? "—" : avgMarkup.toFixed(1) + "%"}</div>
            <div className="cf-meta">{report.label}</div>
          </div>
          <div className="cf-card cf-kpi">
            <div className="cf-lbl">Win rate · {periodLabel}</div>
            <div className="cf-kpi-v">{winRate == null ? "—" : `${winRate}%`}</div>
            <div className="cf-meta">{reportOutcomes.length ? `${selectedAwards.length} won · ${reportOutcomes.length - selectedAwards.length} lost` : "No resolved outcomes in this period"}</div>
          </div>
          <div className="cf-card cf-kpi">
            <div className="cf-lbl">$100K+ bids · {periodLabel}</div>
            <div className="cf-kpi-v">{pipelineAvailable ? sizes.Large + sizes["Very Large"] : "—"}</div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span className="cf-meta">{pipelineAvailable ? `${submittedCount - sizes.Small} at $50K+` : "—"}</span>
              <Link className="cf-link" href="/hundred-k" style={{ fontSize: 12 }}>View</Link>
            </div>
          </div>
        </section>

        {(dashView === "overview" || dashView === "agent") && (
          <section className="cf-split">
            <div className="cf-card cf-split-main" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h2 className="cf-h2">Submissions vs. goal</h2>
                  <p className="cf-sub">{report.label} · all agents</p>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, color: "var(--cf-text-2)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><svg width="22" height="8" aria-hidden><line x1="1" y1="4" x2="21" y2="4" stroke="#0891B2" strokeWidth="2.5" strokeLinecap="round" /></svg>Actual</span>
                  {report.elapsed < report.days && <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><svg width="22" height="8" aria-hidden><line x1="1" y1="4" x2="21" y2="4" stroke="#7C3AED" strokeWidth="2" strokeDasharray="4 3" /></svg>Forecast</span>}
                  {monthlyGoal != null && <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><svg width="22" height="8" aria-hidden><line x1="1" y1="4" x2="21" y2="4" stroke="#94A3B8" strokeWidth="2" strokeDasharray="6 4" /></svg>Goal pace</span>}
                </div>
              </div>
              {pipelineAvailable && <GoalPaceChart range={report} dailyCounts={dailyCounts} goal={monthlyGoal == null ? null : teamGoal} />}
            </div>
            <aside className="cf-card cf-split-side" aria-labelledby="attn-h" style={{ display: "flex", flexDirection: "column" }}>
              <div className="cf-card-hd" style={{ paddingBottom: 8 }}>
                <h2 id="attn-h" className="cf-h2">Needs attention</h2>
                <span className="cf-mono" style={{ fontSize: 11, fontWeight: 500, color: "var(--cf-cyan-text)", background: "rgba(34,211,238,.1)", border: "1px solid rgba(34,211,238,.3)", padding: "3px 10px", borderRadius: 999 }}>{attentionCount} ITEMS</span>
              </div>
              <ul style={{ listStyle: "none", margin: 0, padding: "0 24px 12px" }}>
                {paceBehind > 0 ? (
                  <li className="cf-attn">
                    <span className="cf-ico cf-ico-bad"><TriangleAlert size={18} strokeWidth={1.75} /></span>
                    <div>
                      <b>Team is {paceBehind} bids behind goal pace</b>
                      <p>{Math.max(teamGoal - submittedCount, 0)} more needed in {paceWeekdays} working days.</p>
                      <Link className="cf-link" href="/agent-bid-data">See by agent</Link>
                    </div>
                  </li>
                ) : null}
                <li className="cf-attn">
                  <span className="cf-ico cf-ico-bad"><TriangleAlert size={18} strokeWidth={1.75} /></span>
                  <div>
                    <b>{duplicateFlags.length ? `${duplicateFlags.length} unresolved duplicate flag${duplicateFlags.length === 1 ? "" : "s"}` : "No unresolved duplicate flags"}</b>
                    <p>
                      {duplicateFlags.slice(0, 4).map((flag) => (
                        <Link key={flag.id} href={`/work-management#duplicate-${flag.id}`} className="cf-link" style={{ marginRight: 8 }}><span>{flag.solicitation_number}</span> · {flag.attempted_by?.full_name} → {flag.existing_agent?.full_name}</Link>
                      ))}

                    </p>
                    <Link className="cf-link" href="/work-management#duplicates">Review all</Link>
                  </div>
                </li>
                <li className="cf-attn">
                  <span className="cf-ico cf-ico-warn"><Clock size={18} strokeWidth={1.75} /></span>
                  <div>
                    <b>{staleFlags.length ? `${staleFlags.length} stale bid${staleFlags.length === 1 ? "" : "s"}` : "No stale bids"}</b>
                    <p>
                      {staleFlags.slice(0, 4).map((flag) => (
                        <Link key={flag.claim_id} href={flag.href || `/work-management#stale-${flag.claim_id}`} className="cf-link" style={{ marginRight: 8 }}><span>{flag.solicitation_number || flag.title}</span> · {flag.assignee?.full_name} · {flag.last_status_at}</Link>
                      ))}
                      {staleFlags.length ? "No status change for 3 days" : "Clears when a bid status changes"}
                    </p>
                    <Link className="cf-link" href="/work-management#stale-bids">Review all</Link>
                  </div>
                </li>
                <li id="award-flags" className="cf-attn">
                  <span className="cf-ico cf-ico-info"><Award size={18} strokeWidth={1.75} /></span>
                  <div>
                    <b>{awardFlags.length ? `${awardFlags.length} award checks overdue` : "Award checks"}</b>
                    <p>{awardFlags.length ? "90-day checks with no outcome logged" : "No submitted bids are past 90 days without an outcome."}</p>
                    {awardFlags.slice(0, 4).map((flag) => (
                      <div key={flag.bid_id}><Link className="cf-link" href={flag.href}>{flag.solicitation_number || flag.display_bid_id}</Link><p>{flag.agent_name} · submitted {flag.submitted_on} · {flag.days_since_submission} days, no award outcome logged</p></div>
                    ))}
                    <Link className="cf-link" href="/award-tracking?checkpoint_state=flagged">Open Award Tracking</Link>
                  </div>
                </li>
                {duplicateFlags.length === 0 && staleFlags.length === 0 ? (
                  <li className="cf-attn">
                    <span className="cf-ico cf-ico-ok"><Check size={18} strokeWidth={1.75} /></span>
                    <div>
                      <b>No stale bids or duplicate flags</b>
                      <p>Checked with the latest sync</p>
                    </div>
                  </li>
                ) : null}
              </ul>
            </aside>
          </section>
        )}

        <section className="cf-card" aria-labelledby="pipe-h" style={{ padding: "20px 24px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <h2 id="pipe-h" className="cf-h2">Pipeline by stage</h2>
              <p className="cf-sub">Where every company-tracked opportunity sits right now</p>
            </div>
            <Link className="cf-link" href="/bid-history">Open pipeline <ArrowRight size={16} strokeWidth={1.75} /></Link>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: 12 }}>
            <div className="cf-stage">
              <span className="cf-pill cf-pill-pool">Unclaimed</span>
              <div className="cf-stage-v">—</div>
              <div className="cf-meta" style={{ fontSize: 13, color: "var(--cf-text-2)" }}>Pool count is on Opportunities</div>
              <div className="cf-stage-f">Close-in-7-days is not in this feed</div>
            </div>
            <div className="cf-stage">
              <span className="cf-pill cf-pill-sup">Finding supplier</span>
              <div className="cf-stage-v">{finding.length}</div>
              <div className="cf-meta" style={{ fontSize: 13, color: "var(--cf-text-2)" }}>{findingValue == null ? "Estimated value is not on these rows" : `Est. ${compactMoney(findingValue)} in bids`}</div>
              <div className="cf-stage-f">{dueSoonKnown ? `${dueSoon} due in 48 hours` : "Due-soon count is not on these rows"}</div>
            </div>
            <div className="cf-stage">
              <span className="cf-pill cf-pill-app">Waiting approval</span>
              <div className="cf-stage-v">{waiting.length}</div>
              <div className="cf-meta" style={{ fontSize: 13, color: "var(--cf-text-2)" }}>{waitingValue == null ? "Bid value is not on these rows" : `${compactMoney(waitingValue)} in bids`}</div>
              <div className="cf-stage-f">Oldest wait is not on these rows</div>
            </div>
            <div className="cf-stage">
              <span className="cf-pill cf-pill-sub">Bid submitted</span>
              <div className="cf-stage-v">{submittedNow.length}</div>
              {pipelineSubmittedValue != null && <div className="cf-meta">{compactMoney(pipelineSubmittedValue)} submitted</div>}
              {pipelineGrossProfit != null && <div className="cf-stage-f">{compactMoney(pipelineGrossProfit)} gross profit</div>}
            </div>
            <div className="cf-stage">
              <span className="cf-pill cf-pill-won">Awarded</span>
              <div className="cf-stage-v">{won.length}</div>
              {pipelineAwardedValue != null && <div className="cf-meta">{compactMoney(pipelineAwardedValue)} awarded</div>}
              <div className="cf-stage-f">{lostCount} lost · {pendingCount} pending</div>
            </div>
          </div>
        </section>

        {dashView === "overview" && (
          <section>
            <h2 className="cf-h2">Company pulse</h2>
            <p className="cf-sub mb-3">Activity through today</p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: 16 }}>
              {pulseCards.map((period) => (
                <div key={period.key} className="cf-stage">
                  <div className="cf-lbl">{period.label}</div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div><div className="cf-meta">Picked up</div><div className="cf-kpi-v" style={{ fontSize: 28 }}>{loading ? "—" : period.picked_up}</div></div>
                    <div><div className="cf-meta">Submitted</div><div className="cf-kpi-v" style={{ fontSize: 28 }}>{loading ? "—" : period.submitted}</div></div>
                  </div>
                  <div className="cf-meta mt-2">Submitted value {period.submitted_value == null ? "—" : formatMoney(period.submitted_value)} · Gross profit {period.gross_profit == null ? "—" : formatMoney(period.gross_profit)}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {(dashView === "overview" || dashView === "agent") && (
          <section className="cf-split">
          <div className="cf-card cf-split-main" style={{ overflow: "hidden" }}>
            <div className="cf-card-hd">
              <div>
                <h2 className="cf-h2">Agent leaderboard</h2>
                <p className="cf-sub">Ranked by submitted value · {leaderboardPeriod === "report" ? report.label : leaderboardPeriod === "today" ? "Today" : "This week"}</p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                <div className="cf-seg-wrap" role="group" aria-label="Leaderboard period">
                  {(["today", "week", "report"] as const).map((period) => (
                    <button key={period} type="button" aria-pressed={leaderboardPeriod === period} onClick={() => setLeaderboardPeriod(period)} className={`cf-seg${leaderboardPeriod === period ? " cf-seg-on" : ""}`}>
                      {period === "today" ? "Today" : period === "week" ? "This week" : reportingPeriod === "mtd" ? "This month" : "Reporting period"}
                    </button>
                  ))}
                </div>
                <Link className="cf-link" href="/agent-bid-data">Agent bid data</Link>
              </div>
            </div>
            <div tabIndex={0} style={{ overflowX: "auto" }}>
                <table className="cf-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th>Agent</th>
                      <th>{leaderboardPeriod === "report" ? "Bids vs. goal" : "Bids"}</th>
                      <th className="cf-num">Submitted</th>
                      <th className="cf-num">Gross profit</th>
                      <th className="cf-num">Win rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byAmount.length === 0 ? (
                      <tr><td colSpan={6}>No submitted agent bids for this period.</td></tr>
                    ) : byAmount.map((entry, index) => {
                      const employee = employees.get(entry.user_id);
                      const personalGoal = leaderboardPeriod === "report" && employee ? employee.monthly_goal * report.months : 0;
                      const pct = personalGoal > 0 ? Math.min(100, Math.round((entry.bid_count / personalGoal) * 100)) : 0;
                      const outcomes = agentOutcomes.get(entry.user_id);
                      return (
                        <tr key={entry.user_id}>
                          <td className="cf-mono" style={{ fontWeight: 600, color: index === 0 ? "#0E7490" : "var(--cf-text-3)" }}>{String(index + 1).padStart(2, "0")}</td>
                          <td>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                              <span className={`cf-av ${index === 0 ? "cf-av-me" : ""}`} style={{ width: 30, height: 30, fontSize: 11 }}>{initials(entry.name)}</span>
                              <Link className="cf-link" href={"/agent-bid-data?agent_user_id=" + entry.user_id}>{entry.name}</Link>
                            </span>
                          </td>
                          <td>
                            <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 160 }}>
                              {personalGoal > 0 && <span className="cf-bar" style={{ flex: 1 }}><span style={{ width: `${pct}%` }} /></span>}
                              <span className="cf-mono" style={{ fontSize: 12, color: "var(--cf-text-2)" }}>{entry.bid_count}{personalGoal > 0 ? `/${personalGoal}` : ""}</span>
                            </span>
                          </td>
                          <td className="cf-num">{formatMoney(entry.amount)}</td>
                          <td className="cf-num">{entry.grossProfit == null ? "—" : formatMoney(entry.grossProfit)}</td>
                          <td className="cf-num">{outcomes ? `${Math.round(100 * outcomes.won / outcomes.total)}%` : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
          </div>
          {dashView === "overview" ? portalMix : null}
          </section>
        )}

        {dashView !== "portal" && <section className="cf-card p-5">
          <h2 className="cf-h2">Agent leaderboard by bid count</h2>
          {byCount.length ? <ol className="mt-3 space-y-2">{byCount.map((entry, index) => <li key={entry.user_id}>
            {index + 1}. <Link className="cf-link" href={"/agent-bid-data?agent_user_id=" + entry.user_id}>{entry.name}</Link> · {entry.bid_count} bids
          </li>)}</ol> : <p className="cf-meta">No submissions for this period.</p>}
        </section>}
        {dashView === "portal" && portalMix}

        {reportingPeriod !== "mtd" && pipelineAvailable && <section className="cf-card" aria-labelledby="monthly-breakdown">
          <div className="cf-card-hd">
            <div><h2 className="cf-h2" id="monthly-breakdown">Monthly breakdown</h2><p className="cf-sub">{report.label}</p></div>
          </div>
          <div className="overflow-x-auto">
            <table className="cf-table">
              <thead><tr><th scope="col">Month</th><th scope="col" className="cf-num">Bids submitted</th><th scope="col" className="cf-num">Submitted value</th></tr></thead>
              <tbody>{monthlyBreakdown.map((row) => row && (
                <tr key={row.month}><td>{row.label}</td><td className="cf-num">{row.count}</td><td className="cf-num">{formatMoney(row.value)}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </section>}

        <section className="cf-split">
          <div className="cf-card cf-split-main" style={{ overflow: "hidden" }}>
            <div className="cf-card-hd">
              <h2 className="cf-h2">Latest submissions</h2>
              <Link className="cf-link" href="/bid-history">All bid history</Link>
            </div>
            <div tabIndex={0} style={{ overflowX: "auto" }}>
              <table className="cf-table">
                <thead>
                  <tr>
                    <th>Submitted</th>
                    <th>Agent</th>
                    <th>Solicitation</th>
                    <th>Portal</th>
                    <th className="cf-num">Price</th>
                    <th className="cf-num">Markup</th>
                  </tr>
                </thead>
                <tbody>
                  {latestSubmissions.length === 0 ? (
                    <tr><td colSpan={6}>{loading ? "Loading submissions…" : "No submissions for this period."}</td></tr>
                  ) : latestSubmissions.map((item) => (
                    <tr key={item.id}>
                      <td className="cf-mono cf-dim" style={{ whiteSpace: "nowrap", fontSize: 12 }}>{submittedStamp(item.submitted_at || "")}</td>
                      <td>{item.agent_name || "—"}</td>
                      <td>
                        <Link href={`/bids/${item.id}`} style={{ textDecoration: "none" }}>
                          <span className="cf-id">{item.solicitation_number || item.bid_id}</span>
                          <span className="cf-meta" style={{ display: "block" }}>{item.title || "—"}</span>
                        </Link>
                      </td>
                      <td>{item.portal || "—"}</td>
                      <td className="cf-num">{priceMoney(item.submitted_price)}</td>
                      <td className="cf-num">{item.markup_percent == null ? "—" : `${item.markup_percent.toFixed(1)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="cf-card cf-split-side" style={{ overflow: "hidden" }}>
            <div className="cf-card-hd" style={{ display: "block" }}>
              <h2 className="cf-h2">Financial summary</h2>
              <p className="cf-sub">{report.label}</p>
            </div>
            <table className="cf-table">
              <tbody>
                <tr><td className="cf-dim2">Submitted value</td><td className="cf-num" style={{ fontWeight: 500 }}>{pipelineAvailable ? formatMoney(submittedValue) : "—"}</td><td className="cf-num cf-dim">—</td></tr>
                <tr><td className="cf-dim2">Supplier cost</td><td className="cf-num" style={{ fontWeight: 500 }}>{supplierCost == null ? "—" : formatMoney(supplierCost)}</td><td className="cf-num cf-dim">—</td></tr>
                <tr><td className="cf-dim2">Gross profit</td><td className="cf-num" style={{ fontWeight: 500 }}>{grossProfit == null ? "—" : formatMoney(grossProfit)}</td><td className="cf-num cf-dim">—</td></tr>
                <tr><td className="cf-dim2">Awarded value</td><td className="cf-num" style={{ fontWeight: 500 }}>{awardedValue == null ? "—" : formatMoney(awardedValue)}</td><td className="cf-num cf-dim">—</td></tr>
                <tr><td className="cf-dim2">Average markup</td><td className="cf-num" style={{ fontWeight: 500 }}>{avgMarkup == null ? "—" : `${avgMarkup.toFixed(1)}%`}</td><td className="cf-num cf-dim">—</td></tr>
              </tbody>
            </table>
          </div>
        </section>

        <section className="cf-split">
          <div className="cf-card cf-split-main">
            <div className="cf-card-hd">
              <h2 className="cf-h2">Latest status activity</h2>
              <Link className="cf-link" href="/activity-log">View all activity</Link>
            </div>
            {statusActivity.length ? (
              <div tabIndex={0} style={{ overflowX: "auto" }}>
                <table className="cf-table">
                  <thead><tr><th>Solicitation</th><th>Change</th><th>By</th><th>When</th></tr></thead>
                  <tbody>
                    {statusActivity.slice(0, 8).map((event) => (
                      <tr key={event.id}>
                        <td><Link className="cf-link" href={`/bids/${event.bid_id}`}>{event.solicitation_number}</Link></td>
                        <td>{event.old_status} → {event.new_status}</td>
                        <td>{event.changed_by_name}</td>
                        <td className="cf-mono">{new Date(event.changed_at_eastern).toLocaleString("en-US", { timeZone: "America/New_York" })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="cf-meta" style={{ padding: "0 24px 20px" }}>No status changes yet.</p>}
          </div>
          <div className="cf-card cf-split-side" style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <h2 className="cf-h2">Pickup rules</h2>
              <Link className="cf-link" href="/team">Edit roster</Link>
            </div>
            {rosterRules.length ? rosterRules.map((member) => (
              <div key={member.id} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "12px 0", borderTop: "1px solid var(--cf-line)", fontSize: 14 }}>
                <span style={{ fontWeight: 500 }}>{member.full_name}</span>
                <span className="cf-meta">{member.active_bid_limit} active bids · {formatCurrency(member.dollar_ceiling)}</span>
              </div>
            )) : <p className="cf-meta">No agents configured.</p>}
          </div>
        </section>

        <section className="cf-card" style={{ padding: "20px 24px" }}>
          <h2 className="cf-h2">Employee bid data</h2>
          <p className="cf-sub">Open one employee&apos;s Agent Bid Data, including their history and totals.</p>
          {rosterRules.length ? (
            <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
              <label style={{ display: "grid", gap: 6, fontSize: 14 }}>Employee
                <select className="cf-select" value={drillDownId} onChange={(event) => setSelectedEmployee(event.target.value)}>
                  {rosterRules.map((member) => <option key={member.id} value={member.id}>{member.full_name}{member.is_active ? "" : " (inactive)"}</option>)}
                </select>
              </label>
              <Link className="cf-btn cf-btn-primary" href={`/agent-bid-data?agent_user_id=${drillDownId}`}>Open Agent Bid Data</Link>
            </div>
          ) : <p className="cf-meta">No agents configured.</p>}
        </section>


        {negotiationSummary}
        <section className="cf-card" style={{ padding: "20px 24px" }}>
          <h2 className="cf-h2">Recent opportunities</h2>
          <DashboardTable />
        </section>
      </main>
    </>
  );
}

