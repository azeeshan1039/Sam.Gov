"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Award, Calendar, Check, ChevronDown, Clock, Download, TriangleAlert } from "lucide-react";
import { getStoredUser, getUserDisplayName } from "@/lib/auth";
import { formatMoney, type StatsPayload } from "@/lib/stats";
import type { PipelineItem } from "@/lib/pipeline";

const DashboardChart = dynamic(() => import("@/components/DashboardChart"), {
  ssr: false,
});

const GoalPaceChart = dynamic(() => import("@/components/GoalPaceChart"), {
  ssr: false,
});

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

function inEasternMonth(value: string | null | undefined, year: number, month: number) {
  if (!value) return false;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric" }).formatToParts(date);
  const y = Number(parts.find((part) => part.type === "year")?.value);
  const m = Number(parts.find((part) => part.type === "month")?.value);
  return y === year && m === month;
}

function submittedStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(date).toUpperCase();
  const time = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/New_York" }).format(date);
  return `${day} · ${time}`;
}

function sumNumbers(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => value != null && !Number.isNaN(Number(value)));
  if (!present.length) return null;
  return present.reduce((total, value) => total + Number(value), 0);
}

function PortalMix({
  wide,
  monthLabel,
  rows,
  max,
  sizeKnown,
  veryLargeKnown,
  sizes,
}: {
  wide?: boolean;
  monthLabel: string;
  rows: Array<{ name: string; count: number; value: number | null }>;
  max: number;
  sizeKnown: boolean;
  veryLargeKnown: boolean;
  sizes: { Small: number; Medium: number; Large: number; "Very Large": number };
}) {
  const swatches = [
    ["#A5F3FC", "Small <$50K", sizes.Small, true],
    ["#06B6D4", "Medium", sizes.Medium, true],
    ["#0E7490", "Large $100K+", sizes.Large, true],
    ["#164E63", "Very large $500K+", veryLargeKnown ? sizes["Very Large"] : null, veryLargeKnown],
  ] as const;
  return (
    <div className={wide ? "cf-card" : "cf-card cf-split-side"} style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h2 className="cf-h2">Submissions by portal</h2>
        <p className="cf-sub">{monthLabel} · count and submitted value</p>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {rows.length ? rows.map((row) => (
          <div key={row.name} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 14 }}>
              <span style={{ fontWeight: 500 }}>{row.name}</span>
              <span className="cf-mono" style={{ fontSize: 13, color: "var(--cf-text-2)" }}>{row.count} · {row.value == null ? "—" : compactMoney(row.value)}</span>
            </div>
            <div className="cf-bar" style={{ height: 8 }}><span style={{ width: `${(row.count / max) * 100}%` }} /></div>
          </div>
        )) : <p className="cf-meta">No portal totals for this month.</p>}
      </div>
      <div style={{ borderTop: "1px solid var(--cf-line)", paddingTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="cf-lbl">Bid size mix</div>
        {sizeKnown ? (
          <>
            <div style={{ display: "flex", gap: 2, height: 14, borderRadius: 4, overflow: "hidden" }} role="img" aria-label={`Small ${sizes.Small}, Medium ${sizes.Medium}, Large ${sizes.Large}, Very large ${veryLargeKnown ? sizes["Very Large"] : "not split"}`}>
              {swatches.map(([color, , count, known]) => known && Number(count) > 0 ? <div key={color} style={{ flex: Number(count), background: color }} /> : null)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: "6px 16px", fontSize: 13, color: "var(--cf-text-2)" }}>
              {swatches.map(([color, label, count]) => (
                <span key={label} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: color, flex: "none" }} />
                  {label} · {count == null ? "—" : count}
                </span>
              ))}
            </div>
          </>
        ) : <p className="cf-meta">Size mix is not in this feed.</p>}
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
}

export default function DashboardPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [role, setRole] = useState<"admin" | "agent" | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [leaderboardPeriod, setLeaderboardPeriod] = useState<"today" | "week" | "month">("month");
  const [byAmount, setByAmount] = useState<Array<{ rank: number; user_id: number; name: string; amount: number; bid_count: number }>>([]);
  const [byCount, setByCount] = useState<Array<{ rank: number; user_id: number; name: string; amount: number; bid_count: number }>>([]);
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
  const [pipelineItems, setPipelineItems] = useState<PipelineItem[]>([]);

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
          const now = new Date();
          const statsQuery = new URLSearchParams({
            company_id: String(companyId),
            requester_user_id: String(userId),
            year: String(now.getFullYear()),
            month: String(now.getMonth() + 1),
          });
          const [flagsResponse, staleResponse, teamResponse, activityResponse, pulseResponse, statsResponse] = await Promise.all([
            fetch('/api/backend/opportunities/duplicates', { cache: 'no-store' }),
            fetch('/api/backend/opportunities/stale', { cache: 'no-store' }),
            fetch('/api/backend/auth/team', { cache: 'no-store' }),
            fetch('/api/backend/pipeline/activity?limit=20&offset=0', { cache: 'no-store' }),
            fetch('/api/backend/pipeline/dashboard-pulse', { cache: 'no-store' }),
            fetch(`/api/backend/stats?${statsQuery.toString()}`, { cache: 'no-store' }),
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
          if (statsResponse.ok) {
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
    if (!authChecked || role !== "admin") return;
    let cancelled = false;
    const loadLeaderboard = async () => {
      try {
        const response = await fetch(`/api/backend/stats/leaderboard?period=${leaderboardPeriod}`, { cache: "no-store" });
        if (!response.ok || cancelled) return;
        const data = await response.json();
        if (cancelled) return;
        setByAmount(data.by_amount || []);
        setByCount(data.by_count || []);
      } catch (err) {
        console.error("Failed to fetch leaderboard:", err);
      }
    };
    loadLeaderboard();
    return () => {
      cancelled = true;
    };
  }, [authChecked, leaderboardPeriod, role]);

  useEffect(() => {
    if (!authChecked || role !== "agent" || userId === null || companyId === null) return;
    let cancelled = false;
    const query = new URLSearchParams({
      company_id: String(companyId),
      requester_user_id: String(userId),
    });
    const loadAgent = async () => {
      try {
        const [goalRes, claimsRes] = await Promise.all([
          fetch(`/api/backend/stats/my-goal?${query}`, { cache: "no-store" }),
          fetch("/api/backend/opportunities/mine", { cache: "no-store" }),
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

  const monthPeriod = periods.find((period) => period.key === "month");
  const submittedMtd = companyStats?.monthly_goal?.achieved ?? monthPeriod?.submitted ?? stats?.bids_submitted ?? 0;
  const teamGoal = companyStats?.monthly_goal?.monthly || 100;
  const goalPct = teamGoal > 0 ? Math.min(100, Math.round((submittedMtd / teamGoal) * 100)) : 0;
  const monthLabel = companyStats?.month_label || new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "America/New_York" }).format(new Date());
  const pace = (() => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(new Date());
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const day = Number(parts.find((part) => part.type === "day")?.value);
    const days = new Date(year, month, 0).getDate();
    const paceToday = Math.round(teamGoal * (day / days));
    let weekdays = 0;
    for (let cursor = day; cursor <= days; cursor += 1) {
      const dow = new Date(year, month - 1, cursor).getDay();
      if (dow !== 0 && dow !== 6) weekdays += 1;
    }
    return { behind: Math.max(paceToday - submittedMtd, 0), weekdays };
  })();
  const paceBehind = pace.behind;
  const paceWeekdays = pace.weekdays;
  const attentionCount = (paceBehind > 0 ? 1 : 0) + 2 + 1 + (duplicateFlags.length === 0 && staleFlags.length === 0 ? 1 : 0);
  const hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: "America/New_York" }).format(new Date()));
  const dayPart = hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
  const firstName = getUserDisplayName(getStoredUser()).split(" ")[0] || "there";
  const agentGoal = myGoal?.monthly || 0;
  const agentDone = myGoal?.achieved || 0;
  const agentPct = agentGoal > 0 ? Math.min(100, Math.round((agentDone / agentGoal) * 100)) : 0;

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
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              <Link className="cf-btn cf-btn-secondary" href="/my-bids">My bids</Link>
              <Link className="cf-btn cf-btn-primary" href="/opportunities">Find opportunities</Link>
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
              <div className="cf-meta">{myGoal ? `${agentPct}% of goal` : "Goal loads from your account"}</div>
            </div>
            <div className="cf-card cf-kpi">
              <div className="cf-lbl">Submitted value</div>
              <div className="cf-kpi-v">{loading ? "—" : formatCurrency(stats?.total_target_value ?? 0)}</div>
              <div className="cf-meta">From your negotiation sessions</div>
            </div>
            <div className="cf-card cf-kpi">
              <div className="cf-lbl">Active negotiations</div>
              <div className="cf-kpi-v">{loading ? "—" : stats?.active_negotiations ?? 0}</div>
              <div className="cf-meta">{stats?.suppliers_responded ?? 0} suppliers responded</div>
            </div>
            <div className="cf-card cf-kpi">
              <div className="cf-lbl">Bids submitted</div>
              <div className="cf-kpi-v">{loading ? "—" : stats?.bids_submitted ?? 0}</div>
              <div className="cf-meta">Gross profit and win rate are not in this feed</div>
            </div>
            <Link className="cf-card cf-kpi" href="/award-tracking" style={{ textDecoration: "none", borderColor: "rgba(251,191,36,.45)" }}>
              <div className="cf-lbl" style={{ color: "#B45309" }}>Award checks due</div>
              <div className="cf-kpi-v">—</div>
              <span className="cf-link" style={{ fontSize: 12 }}>Record outcomes</span>
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
              <div style={{ display: "flex", flexDirection: "column", padding: "0 24px 16px" }}>
                {myClaims.length === 0 ? (
                  <p className="cf-meta" style={{ padding: "8px 0 12px" }}>No picked-up bids are waiting on you.</p>
                ) : myClaims.map((claim) => (
                  <div key={claim.id} style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center", padding: "14px 0", borderTop: "1px solid var(--cf-line)" }}>
                    <div style={{ flex: "1 1 320px", minWidth: 0 }}>
                      <div className="cf-mono" style={{ fontSize: 13, fontWeight: 500 }}>{claim.solicitation_number || claim.external_notice_id} · SAM.GOV</div>
                      <Link href={`/sam-gov/${encodeURIComponent(claim.external_notice_id)}`} style={{ font: "500 17px var(--cf-display)", color: "var(--cf-text)", textDecoration: "none" }}>{claim.title}</Link>
                    </div>
                    <div>
                      <div className="cf-lbl">Response due</div>
                      <b>{claim.response_deadline ? new Date(claim.response_deadline).toLocaleDateString("en-US", { timeZone: "America/New_York" }) : "—"}</b>
                    </div>
                    <div>
                      <div className="cf-lbl">Est. value</div>
                      <b className="cf-mono">{claim.expected_bid_value != null ? formatMoney(claim.expected_bid_value) : "—"}</b>
                    </div>
                    <Link className="cf-btn cf-btn-primary" href={`/sam-gov/${encodeURIComponent(claim.external_notice_id)}`}>Continue</Link>
                  </div>
                ))}
              </div>
            </div>
            <aside className="cf-card cf-split-side">
              <div className="cf-card-hd">
                <h2 className="cf-h2">Award checks due</h2>
              </div>
              <p className="cf-meta" style={{ padding: "0 24px 20px" }}>Personal checkpoint counts are not in the current agent feed. Open award tracking to record outcomes.</p>
            </aside>
          </section>

          <section className="cf-card" style={{ padding: "20px 24px" }}>
            <h2 className="cf-h2">My weekly submissions</h2>
            <p className="cf-sub">Loaded from your existing session chart</p>
            <div style={{ marginTop: 16 }}><DashboardChart /></div>
          </section>
        </main>
      </>
    );
  }

  const pulseCards = periods.length ? periods : [
    { key: "today" as const, label: "Today", date_from: "", date_to: "", picked_up: 0, submitted: 0 },
    { key: "week" as const, label: "This week", date_from: "", date_to: "", picked_up: 0, submitted: 0 },
    { key: "month" as const, label: "This month", date_from: "", date_to: "", picked_up: 0, submitted: 0 },
  ];
  const reportParts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric" }).formatToParts(new Date());
  const reportYear = companyStats?.year || Number(reportParts.find((part) => part.type === "year")?.value);
  const reportMonth = companyStats?.month || Number(reportParts.find((part) => part.type === "month")?.value);
  const monthSubmitted = pipelineItems.filter((item) => inEasternMonth(item.submitted_at, reportYear, reportMonth));
  const finding = pipelineItems.filter((item) => item.internal_status === "Finding Supplier");
  const waiting = pipelineItems.filter((item) => item.internal_status === "Waiting Approval");
  const submittedNow = pipelineItems.filter((item) => item.internal_status === "Bid submitted");
  const won = pipelineItems.filter((item) => item.award_outcome === "won");
  const wonThisMonth = won.filter((item) => inEasternMonth(item.outcome_updated_at, reportYear, reportMonth));
  const awardedRows = won.some((item) => item.outcome_updated_at) ? wonThisMonth : won;
  const lostCount = pipelineItems.filter((item) => item.award_outcome === "lost").length;
  const pendingCount = pipelineItems.filter((item) => item.award_outcome === "pending").length;
  const findingValue = sumNumbers(finding.map((item) => item.expected_submitted_price ?? item.submitted_price));
  const waitingValue = sumNumbers(waiting.map((item) => item.expected_submitted_price ?? item.submitted_price));
  const dueSoonKnown = finding.some((item) => item.days_remaining != null);
  const dueSoon = finding.filter((item) => item.days_remaining != null && item.days_remaining <= 2).length;
  const monthSubmittedValue = sumNumbers(monthSubmitted.map((item) => item.submitted_price)) ?? (typeof companyStats?.total_submission_value === "number" ? companyStats.total_submission_value : null);
  const monthProfit = sumNumbers(monthSubmitted.map((item) => item.gross_profit));
  const monthCost = sumNumbers(monthSubmitted.map((item) => item.supplier_cost ?? item.cost));
  const monthAwarded = sumNumbers(awardedRows.map((item) => item.awarded_amount));
  const markups = monthSubmitted.map((item) => item.markup_percent).filter((value): value is number => value != null);
  const avgMarkup = markups.length ? markups.reduce((total, value) => total + value, 0) / markups.length : null;
  const sizes = { Small: 0, Medium: 0, Large: 0, "Very Large": 0 };
  const veryLargeKnown = monthSubmitted.some((item) => item.size_bucket);
  let sizeKnown = veryLargeKnown;
  if (veryLargeKnown) {
    for (const item of monthSubmitted) {
      if (item.size_bucket && item.size_bucket in sizes) sizes[item.size_bucket] += 1;
    }
  } else if (companyStats?.thresholds) {
    sizeKnown = true;
    sizes.Small = companyStats.thresholds.lte_50k;
    sizes.Large = companyStats.thresholds.gte_100k;
    sizes.Medium = Math.max(0, companyStats.thresholds.gte_50k - companyStats.thresholds.gte_100k);
  }
  const valueByPortal = new Map<string, number>();
  for (const item of monthSubmitted) {
    const key = (item.portal || "Unknown").toLowerCase();
    valueByPortal.set(key, (valueByPortal.get(key) || 0) + (item.submitted_price || 0));
  }
  const statPortals = companyStats?.bid_by_portal?.portals || [];
  const portalDisplay = statPortals.length
    ? statPortals.map((row) => ({ name: row.name, count: row.count, value: valueByPortal.has(row.name.toLowerCase()) ? valueByPortal.get(row.name.toLowerCase())! : null }))
    : Array.from(monthSubmitted.reduce((map, item) => {
        const name = item.portal || "Unknown";
        const current = map.get(name) || { name, count: 0, value: 0 };
        current.count += 1;
        current.value += item.submitted_price || 0;
        map.set(name, current);
        return map;
      }, new Map<string, { name: string; count: number; value: number }>()).values());
  const portalMax = Math.max(1, ...portalDisplay.map((row) => row.count));
  const latestSubmissions = [...pipelineItems].filter((item) => item.submitted_at).sort((left, right) => +new Date(right.submitted_at || 0) - +new Date(left.submitted_at || 0)).slice(0, 5);
  const portalMix = (
    <PortalMix wide={dashView === "portal"} monthLabel={monthLabel} rows={portalDisplay} max={portalMax} sizeKnown={sizeKnown} veryLargeKnown={veryLargeKnown} sizes={sizes} />
  );

  return (
    <>
      <section className="cf-band">
        <div className="cf-wrap cf-band-in">
          <div>
            <div className="cf-eyebrow">Manager view</div>
            <h1 className="cf-h1">Bid performance</h1>
            <div className="cf-lead">
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
            <button className="cf-btn cf-btn-secondary" type="button">
              <Calendar size={16} strokeWidth={1.75} />
              {monthLabel}
              <ChevronDown size={16} strokeWidth={1.75} />
            </button>
            <Link className="cf-btn cf-btn-secondary" href="/stats">
              <Download size={16} strokeWidth={1.75} />
              Export
            </Link>
          </div>
        </div>
      </section>
      <main className="cf-wrap cf-main">
        <section className="cf-grid-kpi" aria-label="Key figures">
          <div className="cf-card cf-kpi cf-kpi-hero">
            <div className="cf-lbl" style={{ color: "#0E7490" }}>Bids submitted · MTD</div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
              <span className="cf-kpi-v" style={{ fontSize: 36 }}>{loading ? "—" : submittedMtd}</span>
              <span className="cf-mono" style={{ fontSize: 14, color: "var(--cf-text-2)" }}>/ {teamGoal} goal</span>
            </div>
            <div className="cf-bar"><span style={{ width: `${goalPct}%` }} /></div>
            <div className="cf-meta">{goalPct}% of goal{companyStats?.monthly_goal ? ` · ${companyStats.monthly_goal.left} left` : ""}</div>
          </div>
          <div className="cf-card cf-kpi">
            <div className="cf-lbl">Submitted value</div>
            <div className="cf-kpi-v">{companyStats ? formatMoney(companyStats.total_submission_value) : formatCurrency(stats?.total_target_value ?? 0)}</div>
            <div className="cf-meta">Month-over-month change is not in this feed</div>
          </div>
          <div className="cf-card cf-kpi">
            <div className="cf-lbl">Gross profit</div>
            <div className="cf-kpi-v">—</div>
            <div className="cf-meta">Not returned by the current stats API</div>
          </div>
          <div className="cf-card cf-kpi">
            <div className="cf-lbl">Avg. markup</div>
            <div className="cf-kpi-v">—</div>
            <div className="cf-meta">Not returned by the current stats API</div>
          </div>
          <div className="cf-card cf-kpi">
            <div className="cf-lbl">Win rate · 90 days</div>
            <div className="cf-kpi-v">—</div>
            <div className="cf-meta">Won and lost counts are not in this feed</div>
          </div>
          <div className="cf-card cf-kpi">
            <div className="cf-lbl">$100K+ bids · MTD</div>
            <div className="cf-kpi-v">{companyStats?.thresholds ? companyStats.thresholds.gte_100k : "—"}</div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span className="cf-meta">{companyStats?.thresholds ? `${companyStats.thresholds.gte_50k} at $50K+` : "Opens the existing $100K view"}</span>
              <Link className="cf-link" href="/hundred-k" style={{ fontSize: 12 }}>View</Link>
            </div>
          </div>
        </section>

        {(dashView === "overview" || dashView === "agent") && (
          <section className="cf-split">
            <div className="cf-card cf-split-main" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, overflow: "hidden" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <h2 className="cf-h2">Submissions vs. monthly goal</h2>
                  <p className="cf-sub">Cumulative bids submitted in {monthLabel}, all agents</p>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, color: "var(--cf-text-2)" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><svg width="22" height="8" aria-hidden><line x1="1" y1="4" x2="21" y2="4" stroke="#0891B2" strokeWidth="2.5" strokeLinecap="round" /></svg>Actual</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><svg width="22" height="8" aria-hidden><line x1="1" y1="4" x2="21" y2="4" stroke="#7C3AED" strokeWidth="2" strokeDasharray="4 3" /></svg>Forecast</span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><svg width="22" height="8" aria-hidden><line x1="1" y1="4" x2="21" y2="4" stroke="#94A3B8" strokeWidth="2" strokeDasharray="6 4" /></svg>Goal pace</span>
                </div>
              </div>
              <GoalPaceChart submitted={submittedMtd} goal={teamGoal} monthLabel={monthLabel} />
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
                      <p>{Math.max(teamGoal - submittedMtd, 0)} more needed in {paceWeekdays} working days.</p>
                      <Link className="cf-link" href="/agent-bid-data">See by agent</Link>
                    </div>
                  </li>
                ) : null}
                <li className="cf-attn">
                  <span className="cf-ico cf-ico-bad"><TriangleAlert size={18} strokeWidth={1.75} /></span>
                  <div>
                    <b>{duplicateFlags.length ? `${duplicateFlags.length} unresolved duplicate flag${duplicateFlags.length === 1 ? "" : "s"}` : "No unresolved duplicate flags"}</b>
                    <p>
                      {duplicateFlags.slice(0, 3).map((flag) => (
                        <Link key={flag.id} href={`/work-management#duplicate-${flag.id}`} className="cf-link" style={{ marginRight: 8 }}>{flag.solicitation_number}</Link>
                      ))}
                      {duplicateFlags.length ? `${duplicateFlags[0].attempted_by?.full_name || "Someone"} attempted work owned by ${duplicateFlags[0].existing_agent?.full_name || "another agent"}` : "Checked with the latest sync"}
                    </p>
                    <Link className="cf-link" href="/work-management#duplicates">Review all</Link>
                  </div>
                </li>
                <li className="cf-attn">
                  <span className="cf-ico cf-ico-warn"><Clock size={18} strokeWidth={1.75} /></span>
                  <div>
                    <b>{staleFlags.length ? `${staleFlags.length} stale bid${staleFlags.length === 1 ? "" : "s"}` : "No stale bids"}</b>
                    <p>
                      {staleFlags.slice(0, 3).map((flag) => (
                        <Link key={flag.claim_id} href={flag.href || `/work-management#stale-${flag.claim_id}`} className="cf-link" style={{ marginRight: 8 }}>{flag.solicitation_number || flag.title}</Link>
                      ))}
                      {staleFlags.length ? "No status change for 3 days" : "Clears when a bid status changes"}
                    </p>
                    <Link className="cf-link" href="/work-management#stale-bids">Review all</Link>
                  </div>
                </li>
                <li className="cf-attn">
                  <span className="cf-ico cf-ico-info"><Award size={18} strokeWidth={1.75} /></span>
                  <div>
                    <b>{awardFlags.length ? `${awardFlags.length} award checks overdue` : "Award checks"}</b>
                    <p>{awardFlags.length ? "90-day checks with no outcome logged" : "No submitted bids are past 90 days without an outcome."}</p>
                    <Link className="cf-link" href="/award-tracking">Open award tracking</Link>
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
            <Link className="cf-link" href="/pipeline">Open pipeline <ArrowRight size={16} strokeWidth={1.75} /></Link>
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
              <div className="cf-meta" style={{ fontSize: 13, color: "var(--cf-text-2)" }}>{monthSubmittedValue == null ? "Submitted value is not in this feed" : `${compactMoney(monthSubmittedValue)} submitted this month`}</div>
              <div className="cf-stage-f">{monthProfit == null ? "Gross profit is not in this feed" : `${compactMoney(monthProfit)} gross profit`}</div>
            </div>
            <div className="cf-stage">
              <span className="cf-pill cf-pill-won">Awarded</span>
              <div className="cf-stage-v">{awardedRows.length}</div>
              <div className="cf-meta" style={{ fontSize: 13, color: "var(--cf-text-2)" }}>{monthAwarded == null ? "Awarded value is not on these rows" : `${compactMoney(monthAwarded)} ${wonThisMonth.length ? "won this month" : "awarded on file"}`}</div>
              <div className="cf-stage-f">{lostCount} lost · {pendingCount} pending</div>
            </div>
          </div>
        </section>

        {dashView === "overview" && (
          <section>
            <h2 className="cf-h2" style={{ marginBottom: 12 }}>Company pulse</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(200px, 100%), 1fr))", gap: 16 }}>
              {pulseCards.map((period) => (
                <div key={period.key} className="cf-stage">
                  <div className="cf-lbl">{period.label}</div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div><div className="cf-meta">Picked up</div><div className="cf-kpi-v" style={{ fontSize: 28 }}>{loading ? "—" : period.picked_up}</div></div>
                    <div><div className="cf-meta">Submitted</div><div className="cf-kpi-v" style={{ fontSize: 28 }}>{loading ? "—" : period.submitted}</div></div>
                  </div>
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
                <p className="cf-sub">Ranked by submitted value · personal goal 20 bids / month</p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                <div className="cf-seg-wrap" role="group" aria-label="Leaderboard period">
                  {(["today", "week", "month"] as const).map((period) => (
                    <button key={period} type="button" aria-pressed={leaderboardPeriod === period} onClick={() => setLeaderboardPeriod(period)} className={`cf-seg${leaderboardPeriod === period ? " cf-seg-on" : ""}`}>
                      {period === "today" ? "Today" : period === "week" ? "This week" : "This month"}
                    </button>
                  ))}
                </div>
                <Link className="cf-link" href="/agent-bid-data">Agent bid data</Link>
              </div>
            </div>
            <div style={{ overflowX: "auto" }}>
                <table className="cf-table">
                  <thead>
                    <tr>
                      <th style={{ width: 40 }}>#</th>
                      <th>Agent</th>
                      <th>Bids vs. goal</th>
                      <th className="cf-num">Submitted</th>
                      <th className="cf-num">Gross profit</th>
                      <th className="cf-num">Win rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byAmount.length === 0 ? (
                      <tr><td colSpan={6}>No submitted agent bids for this period.</td></tr>
                    ) : byAmount.map((entry) => {
                      const employee = companyStats?.employees?.find((row) => row.name === entry.name);
                      const personalGoal = employee?.monthly_goal || 20;
                      const bids = employee?.month_total ?? entry.bid_count;
                      const pct = personalGoal > 0 ? Math.min(100, Math.round((bids / personalGoal) * 100)) : 0;
                      const letters = entry.name.trim().split(/\s+/).filter(Boolean);
                      const mark = letters.length >= 2 ? `${letters[0][0]}${letters[1][0]}`.toUpperCase() : (letters[0] || "?").slice(0, 2).toUpperCase();
                      return (
                        <tr key={entry.user_id}>
                          <td className="cf-mono" style={{ fontWeight: 600, color: entry.rank === 1 ? "#0E7490" : "var(--cf-text-3)" }}>{String(entry.rank).padStart(2, "0")}</td>
                          <td>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>
                              <span className={`cf-av ${entry.rank === 1 ? "cf-av-me" : ""}`} style={entry.rank === 1 ? { width: 30, height: 30, fontSize: 11 } : { width: 30, height: 30, fontSize: 11, background: "var(--cf-surface-3)", color: "var(--cf-text-2)", border: "1px solid var(--cf-line-2)" }}>{mark}</span>
                              <span style={{ fontWeight: 500 }}>{entry.name}</span>
                            </span>
                          </td>
                          <td>
                            <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 160 }}>
                              <span className="cf-bar" style={{ flex: 1 }}><span style={{ width: `${pct}%` }} /></span>
                              <span className="cf-mono" style={{ fontSize: 12, color: "var(--cf-text-2)", width: 48 }}>{bids}/{personalGoal}</span>
                            </span>
                          </td>
                          <td className="cf-num">{formatMoney(entry.amount)}</td>
                          <td className="cf-num">—</td>
                          <td className="cf-num">—</td>
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

        {dashView === "portal" && portalMix}

        <section className="cf-split">
          <div className="cf-card cf-split-main" style={{ overflow: "hidden" }}>
            <div className="cf-card-hd">
              <h2 className="cf-h2">Latest submissions</h2>
              <Link className="cf-link" href="/bid-history">All bid history</Link>
            </div>
            <div style={{ overflowX: "auto" }}>
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
                    <tr><td colSpan={6}>No submissions are in the pipeline yet.</td></tr>
                  ) : latestSubmissions.map((item) => (
                    <tr key={item.id}>
                      <td className="cf-mono cf-dim" style={{ whiteSpace: "nowrap", fontSize: 12 }}>{submittedStamp(item.submitted_at || "")}</td>
                      <td>{item.agent_name || "—"}</td>
                      <td>
                        <Link className="cf-id" href={`/bids/${item.id}`}>{item.solicitation_number || item.bid_id}</Link>
                        <div className="cf-meta">{item.title || "—"}</div>
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
              <p className="cf-sub">{monthLabel} to date · change vs. last month is not in this feed</p>
            </div>
            <table className="cf-table">
              <tbody>
                <tr><td className="cf-dim2">Submitted value</td><td className="cf-num" style={{ fontWeight: 500 }}>{monthSubmittedValue == null ? "—" : formatMoney(monthSubmittedValue)}</td><td className="cf-num cf-dim">—</td></tr>
                <tr><td className="cf-dim2">Supplier cost</td><td className="cf-num" style={{ fontWeight: 500 }}>{monthCost == null ? "—" : formatMoney(monthCost)}</td><td className="cf-num cf-dim">—</td></tr>
                <tr><td className="cf-dim2">Gross profit</td><td className="cf-num" style={{ fontWeight: 500 }}>{monthProfit == null ? "—" : formatMoney(monthProfit)}</td><td className="cf-num cf-dim">—</td></tr>
                <tr><td className="cf-dim2">Awarded value</td><td className="cf-num" style={{ fontWeight: 500 }}>{monthAwarded == null ? "—" : formatMoney(monthAwarded)}</td><td className="cf-num cf-dim">—</td></tr>
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
              <div style={{ overflowX: "auto" }}>
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

        <section className="cf-card" style={{ padding: "20px 24px" }}>
          <h2 className="cf-h2">Recent opportunities</h2>
          <DashboardTable />
        </section>
      </main>
    </>
  );
}

