"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Handshake, ArrowRight, TrendingUp, TrendingDown, Loader2, Trophy, AlertTriangle, ShieldCheck } from "lucide-react";
import { getStoredUser } from "@/lib/auth";

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

export default function DashboardPage() {
  const router = useRouter();
  const [authChecked, setAuthChecked] = useState(false);
  const [userId, setUserId] = useState<number | null>(null);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [role, setRole] = useState<"admin" | "agent" | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<Array<{ rank: number; user_id: number; name: string; amount: number; bid_count: number }>>([]);
  const [duplicateFlags, setDuplicateFlags] = useState<Array<{ id: number; solicitation_number: string; attempted_by?: { full_name: string }; existing_agent?: { full_name: string }; detected_at: string }>>([]);
  const [staleFlags, setStaleFlags] = useState<Array<{ claim_id: number; solicitation_number: string | null; title: string; assignee?: { full_name: string }; last_status_at: string | null }>>([]);
  const [rosterRules, setRosterRules] = useState<Array<{ id: number; full_name: string; active_bid_limit: number; dollar_ceiling: number; is_active: boolean; role: string }>>([]);
  const [statusActivity, setStatusActivity] = useState<Array<{ id: number; bid_id: number; solicitation_number: string; changed_by_name: string; old_status: string; new_status: string; changed_at_eastern: string }>>([]);

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
        const leaderboardResponse = await fetch('/api/backend/stats/leaderboard', { cache: 'no-store' });
        if (leaderboardResponse.ok) {
          const leaderboardData = await leaderboardResponse.json();
          setLeaderboard(leaderboardData.leaderboard || []);
        }
        if (role === 'admin') {
          const [flagsResponse, staleResponse, teamResponse, activityResponse] = await Promise.all([
            fetch('/api/backend/opportunities/duplicates', { cache: 'no-store' }),
            fetch('/api/backend/opportunities/stale', { cache: 'no-store' }),
            fetch('/api/backend/auth/team', { cache: 'no-store' }),
            fetch('/api/backend/pipeline/activity?limit=20&offset=0', { cache: 'no-store' }),
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
        }
      } catch (err) {
        console.error("Failed to fetch dashboard stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [authChecked, companyId, role, userId]);

  const formatCurrency = (value: number) => {
    if (value >= 1000000) {
      return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `$${(value / 1000).toFixed(1)}K`;
    }
    return `$${value.toFixed(2)}`;
  };

  const dashboardCards = [
    {
      title: "Active Negotiations",
      value: stats?.active_negotiations ?? 0,
      desc: "in progress",
      icon: "🤝",
      isLink: true,
      href: "/negotiations",
    },
    {
      title: "Bids Submitted",
      value: stats?.bids_submitted ?? 0,
      desc: "ready for review",
      icon: "📨",
    },
    {
      title: "Total Sessions",
      value: stats?.total_sessions ?? 0,
      desc: "all time",
      icon: "📋",
    },
    {
      title: "Suppliers Engaged",
      value: stats?.total_suppliers_engaged ?? 0,
      desc: `${stats?.suppliers_responded ?? 0} responded`,
      icon: "🏭",
    },
    {
      title: "Est. Savings",
      value: formatCurrency(stats?.total_savings ?? 0),
      desc: "from negotiations",
      icon: "💰",
      isPositive: (stats?.total_savings ?? 0) > 0,
    },
  ];


  if (!authChecked) {
    return <div className="p-6 lg:p-8">Loading...</div>;
  }

  return (
    <div className="p-6 lg:p-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">
          {role === "agent" ? "My dashboard" : "Company dashboard"}
        </h1>
        <p className="text-slate-600 mt-1">
          {role === "agent"
            ? "Your government contract opportunities and progress"
            : "Company-wide government contract opportunities and team performance"}
        </p>
      </header>

      {/* Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {loading ? (
          // Loading skeleton
          Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 animate-pulse"
            >
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-24"></div>
                  <div className="h-8 bg-slate-200 rounded w-16"></div>
                  <div className="h-3 bg-slate-200 rounded w-20"></div>
                </div>
                <div className="h-8 w-8 bg-slate-200 rounded"></div>
              </div>
            </div>
          ))
        ) : (
          dashboardCards.map((c) => {
            const cardContent = (
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-slate-500">{c.title}</p>
                  <p className="text-2xl font-bold text-slate-900 mt-1">{c.value}</p>
                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                    {c.desc}
                    {c.isLink && (
                      <ArrowRight className="h-3 w-3 group-hover:translate-x-1 transition-transform" />
                    )}
                  </p>
                </div>
                <span className="text-2xl opacity-80" aria-hidden>
                  {c.icon}
                </span>
              </div>
            );

            if (c.isLink && c.href) {
              return (
                <Link
                  key={c.title}
                  href={c.href}
                  className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 hover:shadow-md transition-shadow cursor-pointer group"
                >
                  {cardContent}
                </Link>
              );
            }

            return (
              <div
                key={c.title}
                className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5 hover:shadow-md transition-shadow"
              >
                {cardContent}
              </div>
            );
          })
        )}
      </section>

      {role === 'admin' && <section className="mb-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-semibold"><AlertTriangle className="h-5 w-5 text-amber-500" />Duplicate flags</h2><Link href="/work-management" className="text-sm font-medium text-blue-600 hover:underline">Review all</Link></div>
          {duplicateFlags.length ? <div className="space-y-2">{duplicateFlags.slice(0, 4).map((flag) => <div key={flag.id} className="rounded-md border bg-amber-50/60 p-3"><p className="font-medium">{flag.solicitation_number}</p><p className="text-xs text-slate-600">{flag.attempted_by?.full_name || 'Unknown'} attempted work owned by {flag.existing_agent?.full_name || 'Unknown'} · {new Date(flag.detected_at).toLocaleString()}</p></div>)}</div> : <p className="text-sm text-slate-500">No unresolved duplicate flags.</p>}
        </div>
        <div id="stale-flags" className="rounded-xl border border-amber-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-semibold"><AlertTriangle className="h-5 w-5 text-amber-500" />Stale bids</h2><Link href="/work-management#stale-bids" className="text-sm font-medium text-blue-600 hover:underline">Review all</Link></div>
          {staleFlags.length ? <div className="space-y-2">{staleFlags.slice(0, 4).map((flag) => <div key={flag.claim_id} className="rounded-md border bg-amber-50/60 p-3"><p className="font-medium">{flag.solicitation_number || flag.title}</p><p className="text-xs text-slate-600">{flag.assignee?.full_name || 'Unknown'} · no status change since {flag.last_status_at ? new Date(flag.last_status_at).toLocaleString() : 'pickup'}</p></div>)}</div> : <p className="text-sm text-slate-500">No stale bids.</p>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5 text-blue-600" />Pickup rules</h2><Link href="/team" className="text-sm font-medium text-blue-600 hover:underline">Edit roster</Link></div>
          {rosterRules.length ? <div className="space-y-2">{rosterRules.map((member) => <div key={member.id} className="flex items-center justify-between rounded-md border p-3 text-sm"><div><span className="font-medium">{member.full_name}</span>{!member.is_active && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">Inactive</span>}</div><div className="text-right text-xs text-slate-600">{member.active_bid_limit} active bids · {formatCurrency(member.dollar_ceiling)}</div></div>)}</div> : <p className="text-sm text-slate-500">No agents configured.</p>}
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <div className="mb-3 flex items-center justify-between gap-3"><h2 className="text-lg font-semibold">Latest status activity</h2><Link href="/activity-log" className="text-sm font-medium text-blue-600 hover:underline">View all activity</Link></div>
          {statusActivity.length ? <div className="divide-y">{statusActivity.map((event) => <Link key={event.id} href={`/bids/${event.bid_id}`} className="flex flex-wrap justify-between gap-2 py-3 text-sm hover:bg-slate-50"><span><strong>{event.solicitation_number}</strong> · {event.old_status} → {event.new_status}</span><span className="text-slate-500">{event.changed_by_name} · {new Date(event.changed_at_eastern).toLocaleString("en-US", { timeZone: "America/New_York" })}</span></Link>)}</div> : <p className="text-sm text-slate-500">No status changes yet.</p>}
        </div>
      </section>}

      <section className="mb-8 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900"><Trophy className="h-5 w-5 text-amber-500" />Agent leaderboard</h2>
        {leaderboard.length ? <div className="grid gap-3 sm:grid-cols-3">{leaderboard.slice(0, 3).map((entry) => <div key={entry.user_id} className="rounded-lg border bg-slate-50 p-3"><div className="text-xs font-semibold uppercase text-slate-500">#{entry.rank}</div><div className="font-semibold">{entry.name}</div><div className="text-sm text-slate-600">{entry.bid_count} bids · {formatCurrency(entry.amount)}</div></div>)}</div> : <p className="text-sm text-slate-500">No submitted agent bids for this month yet.</p>}
      </section>

      {/* Charts */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <DashboardChart />
        </div>
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <DashboardChartTrend />
        </div>
      </section>

      {/* Table */}
      <section>
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-5">
          <h2 className="text-lg font-semibold text-slate-900 mb-4">
            Recent Opportunities
          </h2>
          <DashboardTable />
        </div>
      </section>
    </div>
  );
}

