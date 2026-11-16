"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, ChevronDown, Download, TriangleAlert } from "lucide-react";
import { getStoredUser, getUserDisplayName } from "@/lib/auth";
import { formatMoney, type StatsPayload } from "@/lib/stats";

const DashboardChart = dynamic(() => import("@/components/DashboardChart"), {
  ssr: false,
});

const DashboardChartTrend = dynamic(
  () => import("@/components/DashboardChartTrend"),
  { ssr: false }
);

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
  const attentionCount = duplicateFlags.length + staleFlags.length + awardFlags.length;
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
  const portalRows = companyStats?.bid_by_portal?.portals || [];
  const portalMax = Math.max(1, ...portalRows.map((row) => row.count));

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
            <div className="cf-card cf-split-main" style={{ padding: "20px 24px" }}>
              <h2 className="cf-h2">Submissions vs. monthly goal</h2>
              <p className="cf-sub">Existing submission chart for {monthLabel}</p>
              <div style={{ marginTop: 16 }}><DashboardChart /></div>
            </div>
            <aside className="cf-card cf-split-side" aria-labelledby="attn-h">
              <div className="cf-card-hd">
                <h2 id="attn-h" className="cf-h2">Needs attention</h2>
                <span className="cf-mono" style={{ fontSize: 11, fontWeight: 500, color: "var(--cf-cyan-text)", background: "rgba(34,211,238,.1)", border: "1px solid rgba(34,211,238,.3)", padding: "3px 10px", borderRadius: 999 }}>{attentionCount} ITEMS</span>
              </div>
              <div style={{ padding: "0 24px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <p style={{ fontWeight: 500 }}>Duplicate flags</p>
                  {duplicateFlags.length ? duplicateFlags.slice(0, 4).map((flag) => (
                    <Link key={flag.id} href={`/work-management#duplicate-${flag.id}`} className="cf-link" style={{ display: "block", marginTop: 6 }}>
                      {flag.solicitation_number}
                    </Link>
                  )) : <p className="cf-meta">No unresolved duplicate flags.</p>}
                  <Link className="cf-link" href="/work-management#duplicates" style={{ marginTop: 6 }}>Review all</Link>
                </div>
                <div>
                  <p style={{ fontWeight: 500, display: "flex", gap: 8, alignItems: "center" }}><TriangleAlert size={16} strokeWidth={1.75} /> Stale bids</p>
                  {staleFlags.length ? staleFlags.slice(0, 4).map((flag) => (
                    <Link key={flag.claim_id} href={flag.href || `/work-management#stale-${flag.claim_id}`} className="cf-link" style={{ display: "block", marginTop: 6 }}>
                      {flag.solicitation_number || flag.title}
                    </Link>
                  )) : <p className="cf-meta">No stale bids.</p>}
                  <Link className="cf-link" href="/work-management#stale-bids" style={{ marginTop: 6 }}>Review all</Link>
                </div>
                {awardFlags.length ? (
                  <div>
                    <p style={{ fontWeight: 500 }}>Award check overdue (90 days)</p>
                    {awardFlags.slice(0, 4).map((flag) => (
                      <Link key={flag.bid_id} href={flag.href} className="cf-link" style={{ display: "block", marginTop: 6 }}>{flag.solicitation_number || flag.display_bid_id}</Link>
                    ))}
                  </div>
                ) : null}
                {attentionCount === 0 ? <p className="cf-meta">No stale bids or duplicate flags.</p> : null}
              </div>
            </aside>
          </section>
        )}

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
          <section className="cf-card">
            <div className="cf-card-hd">
              <h2 className="cf-h2">Agent leaderboard</h2>
              <div className="cf-seg-wrap" role="group" aria-label="Leaderboard period">
                {(["today", "week", "month"] as const).map((period) => (
                  <button key={period} type="button" aria-pressed={leaderboardPeriod === period} onClick={() => setLeaderboardPeriod(period)} className={`cf-seg${leaderboardPeriod === period ? " cf-seg-on" : ""}`}>
                    {period === "today" ? "Today" : period === "week" ? "This week" : "This month"}
                  </button>
                ))}
              </div>
            </div>
            <div className="cf-split" style={{ padding: "0 8px 16px" }}>
              {([
                ["By submitted dollars", byAmount, "amount"],
                ["By bid count", byCount, "count"],
              ] as const).map(([title, rows, kind]) => (
                <div key={title} style={{ flex: "1 1 280px" }}>
                  <h3 className="cf-h2" style={{ fontSize: 16, padding: "0 16px 8px" }}>{title}</h3>
                  {rows.length ? rows.map((entry) => (
                    <div key={entry.user_id} style={{ padding: "10px 16px", borderTop: "1px solid var(--cf-line)" }}>
                      <div className="cf-mono" style={{ color: entry.rank === 1 ? "#0E7490" : "var(--cf-text-3)" }}>{String(entry.rank).padStart(2, "0")}</div>
                      <div style={{ fontWeight: 500 }}>{entry.name}</div>
                      <div className="cf-meta">{kind === "amount" ? `${formatCurrency(entry.amount)} · ${entry.bid_count} bids` : `${entry.bid_count} bids · ${formatCurrency(entry.amount)}`}</div>
                    </div>
                  )) : <p className="cf-meta" style={{ padding: "0 16px" }}>No submitted agent bids for this period.</p>}
                </div>
              ))}
            </div>
          </section>
        )}

        {dashView === "portal" && (
          <section className="cf-card" style={{ padding: "20px 24px" }}>
            <h2 className="cf-h2">Submissions by portal</h2>
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {portalRows.length ? portalRows.map((row) => (
                <div key={row.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}><span>{row.name}</span><span className="cf-mono">{row.count}</span></div>
                  <div className="cf-bar" style={{ marginTop: 6 }}><span style={{ width: `${(row.count / portalMax) * 100}%` }} /></div>
                </div>
              )) : <p className="cf-meta">Portal mix is not in the current response. Open Stats for the full breakdown.</p>}
            </div>
            <div style={{ marginTop: 20 }}><DashboardChartTrend /></div>
          </section>
        )}

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

