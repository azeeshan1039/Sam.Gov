"use client";

import { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Handshake, ArrowRight, TrendingUp, TrendingDown, Loader2 } from "lucide-react";
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
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.replace("/register");
      return;
    }
    setUserId(user.id);
    setCompanyId(user.company_id);
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
      } catch (err) {
        console.error("Failed to fetch dashboard stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [authChecked, companyId, userId]);

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
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-600 mt-1">
          Overview of government contract opportunities
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

