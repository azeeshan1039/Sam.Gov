"use client";

import dynamic from "next/dynamic";
import Highcharts from "highcharts";
import { Trophy } from "lucide-react";
import {
  PORTALS,
  PORTAL_COLORS,
  PORTAL_SHORT,
  displayName,
  formatMoney,
  type StatsPayload,
} from "@/lib/stats";
import { Skeleton } from "@/components/ui/skeleton";

const HighchartsReact = dynamic(
  () => import("highcharts-react-official").then((mod) => mod.default),
  { ssr: false }
);

const PLACE_STYLES = [
  {
    label: "1st Place",
    ring: "border-amber-300 bg-amber-50",
    badge: "bg-amber-400 text-amber-950",
    icon: "🥇",
  },
  {
    label: "2nd Place",
    ring: "border-slate-300 bg-slate-50",
    badge: "bg-slate-400 text-white",
    icon: "🥈",
  },
  {
    label: "3rd Place",
    ring: "border-orange-300 bg-orange-50",
    badge: "bg-orange-400 text-orange-950",
    icon: "🥉",
  },
];

function portalLine(stats: StatsPayload) {
  return PORTALS.map((portal) => {
    const found = stats.bid_by_portal.portals.find((p) => p.name === portal);
    return `${PORTAL_SHORT[portal]}: ${found?.count ?? 0}`;
  }).join(" · ");
}

function EmployeeBarChart({ stats }: { stats: StatsPayload }) {
  const categories = stats.employees.map((e) => displayName(e.name));
  const data = stats.employees.map((e) => e.month_total);
  const options: Highcharts.Options = {
    chart: {
      type: "column",
      backgroundColor: "transparent",
      height: 320,
      style: { fontFamily: "inherit" },
    },
    title: { text: undefined },
    xAxis: {
      categories,
      crosshair: true,
      labels: { style: { fontSize: "11px" } },
    },
    yAxis: {
      min: 0,
      title: { text: undefined },
      gridLineColor: "#e2e8f0",
      allowDecimals: false,
    },
    tooltip: {
      backgroundColor: "rgba(255,255,255,0.96)",
      borderColor: "#e2e8f0",
      pointFormat: "<b>{point.y}</b> bids",
    },
    plotOptions: {
      column: {
        borderRadius: 4,
        color: "#1e3a8a",
        maxPointWidth: 36,
      },
    },
    legend: { enabled: false },
    credits: { enabled: false },
    series: [{ type: "column", name: "Bids", data }],
  };
  return (
    <div className="h-[320px] w-full">
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  );
}

function PortalDonut({ stats }: { stats: StatsPayload }) {
  const total = stats.bid_by_portal.total;
  const data = PORTALS.map((portal) => {
    const found = stats.bid_by_portal.portals.find((p) => p.name === portal);
    return {
      name: portal,
      y: found?.count ?? 0,
      color: PORTAL_COLORS[portal],
    };
  });
  const options: Highcharts.Options = {
    chart: {
      type: "pie",
      backgroundColor: "transparent",
      height: 280,
      style: { fontFamily: "inherit" },
    },
    title: {
      text: `<div style="text-align:center"><span style="font-size:22px;font-weight:700;color:#0f172a">${total}</span><br/><span style="font-size:11px;color:#64748b">Total Bids</span></div>`,
      useHTML: true,
      align: "center",
      verticalAlign: "middle",
      y: 8,
    },
    tooltip: {
      pointFormat: "<b>{point.y}</b> ({point.percentage:.0f}%)",
    },
    plotOptions: {
      pie: {
        innerSize: "68%",
        dataLabels: { enabled: false },
        borderWidth: 0,
      },
    },
    legend: { enabled: false },
    credits: { enabled: false },
    series: [{ type: "pie", name: "Bids", data }],
  };
  return (
    <div>
      <div className="h-[280px] w-full">
        <HighchartsReact highcharts={Highcharts} options={options} />
      </div>
      <ul className="mt-2 space-y-1.5 text-sm">
        {data.map((item) => {
          const pct = total > 0 ? Math.round((item.y / total) * 100) : 0;
          return (
            <li key={item.name} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-slate-600">
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.name}
              </span>
              <span className="font-medium text-slate-900">
                {item.y} ({pct}%)
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function OverviewTab({
  stats,
  loading,
}: {
  stats: StatsPayload | null;
  loading: boolean;
}) {
  if (loading || !stats) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
        <Skeleton className="h-36 w-full" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      </div>
    );
  }

  const goal = stats.monthly_goal;
  const places = [0, 1, 2].map((i) => stats.leaderboard[i] || null);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Monthly Goal</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {goal.achieved.toLocaleString()}{" "}
            <span className="text-base font-medium text-slate-400">
              / {goal.monthly.toLocaleString()} Target
            </span>
          </p>
          <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-2 rounded-full bg-blue-600"
              style={{ width: `${Math.min(100, goal.pct)}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-medium text-blue-700">{goal.pct}% Achieved</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Total Submission Value</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {formatMoney(stats.total_submission_value)}
          </p>
          <p className="mt-2 text-xs text-slate-400">Total Dollar Amount of Submissions MTD</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">Total Portal Submissions</p>
          <p className="mt-2 text-2xl font-bold text-slate-900">
            {stats.bid_by_portal.total.toLocaleString()} Bids
          </p>
          <p className="mt-2 text-xs text-slate-500">{portalLine(stats)}</p>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-slate-500">100K+ High Value Bids</p>
          <p className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-900">
              {stats.thresholds.gte_100k.toLocaleString()}
            </span>
            <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">
              &gt;= 100K Bids
            </span>
          </p>
          <p className="mt-2 text-xs text-slate-500">
            &gt;= 50K Bids: {stats.thresholds.gte_50k} | &lt;= 50K Bids:{" "}
            {stats.thresholds.lte_50k}
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <div>
            <h2 className="text-base font-semibold text-slate-900">Leaderboard</h2>
            <p className="text-xs text-slate-500">Top 3 by total bid value this month</p>
          </div>
        </div>
        {places.every((p) => !p) ? (
          <p className="text-sm text-slate-500">No submitted bid values this month.</p>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {places.map((row, i) => {
              const style = PLACE_STYLES[i];
              return (
                <div
                  key={style.label}
                  className={`rounded-xl border p-4 ${style.ring}`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${style.badge}`}>
                      {style.icon} {style.label}
                    </span>
                  </div>
                  {row ? (
                    <>
                      <p className="mt-3 text-lg font-bold text-slate-900">
                        {displayName(row.name)}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        Total Bid Value:{" "}
                        <span className="font-semibold text-slate-800">
                          {formatMoney(row.amount)}
                        </span>
                      </p>
                    </>
                  ) : (
                    <p className="mt-3 text-sm text-slate-400">—</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">
              Bids Submitted by Employee (MTD)
            </h2>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">
              {stats.employees.length} Team Members
            </span>
          </div>
          <EmployeeBarChart stats={stats} />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm lg:col-span-2">
          <h2 className="mb-2 text-base font-semibold text-slate-900">
            Bid Distribution by Portal
          </h2>
          <PortalDonut stats={stats} />
        </div>
      </section>
    </div>
  );
}