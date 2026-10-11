"use client";

import dynamic from "next/dynamic";
import Highcharts from "highcharts";
import HighchartsAccessibility from "highcharts/modules/accessibility";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMoney } from "@/lib/pipeline";

// Gives each chart SVG an accessible name and a screen-reader data table.
if (typeof window !== "undefined" && typeof HighchartsAccessibility === "function") {
  HighchartsAccessibility(Highcharts);
}

const HighchartsReact = dynamic(
  () => import("highcharts-react-official").then((mod) => mod.default),
  { ssr: false }
);

export const BUCKET_NAMES = ["Small", "Medium", "Large", "Very Large"] as const;
export type BucketName = (typeof BUCKET_NAMES)[number];
// Sequential blues: bucket order reads small -> very large.
const BUCKET_COLORS: Record<BucketName, string> = {
  Small: "#93c5fd",
  Medium: "#3b82f6",
  Large: "#1d4ed8",
  "Very Large": "#1e3a8a",
};

type BucketTotals = Record<string, { count: number; total: number }>;

export interface SizeReport {
  interval: "week" | "month";
  count: number;
  total: number;
  buckets: Array<{
    name: BucketName;
    min: number;
    max: number | null;
    count: number;
    total: number;
    count_share: number;
    value_share: number;
  }>;
  series: Array<{ period_start: string; buckets: BucketTotals }>;
  by_agent: Array<{ user_id: number | null; name: string; is_active: boolean; count: number; total: number; buckets: BucketTotals }>;
  thresholds: Array<{ name: string; min: number; max: number | null }>;
}

function rangeLabel(min: number, max: number | null) {
  const short = (value: number) => `$${value >= 1000 ? `${value / 1000}k` : value}`;
  if (max == null) return `${short(min)}+`;
  if (min === 0) return `< ${short(max)}`;
  return `${short(min)} – < ${short(max)}`;
}

function periodLabel(start: string, interval: "week" | "month") {
  const date = new Date(`${start}T00:00:00`);
  return interval === "month"
    ? date.toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : `Wk of ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

const baseChart: Highcharts.Options = {
  chart: { backgroundColor: "transparent", height: 280, style: { fontFamily: "inherit" } },
  title: { text: undefined },
  credits: { enabled: false },
  legend: { enabled: false },
  yAxis: { min: 0, title: { text: undefined }, gridLineColor: "#e2e8f0" },
  tooltip: { backgroundColor: "rgba(255,255,255,0.96)", borderColor: "#e2e8f0" },
};

export function bucketChartOptions(report: SizeReport, metric: "count" | "total"): Highcharts.Options {
  return {
    ...baseChart,
    chart: { ...baseChart.chart, type: "column" },
    accessibility: {
      description: metric === "count" ? "Number of submitted bids in each size bucket." : "Total submitted dollars in each size bucket.",
    },
    xAxis: { categories: report.buckets.map((b) => b.name) },
    yAxis: { ...baseChart.yAxis, allowDecimals: metric === "total" },
    tooltip: {
      ...baseChart.tooltip,
      pointFormat: metric === "count" ? "<b>{point.y}</b> bids" : "<b>${point.y:,.0f}</b> submitted",
    },
    plotOptions: { column: { borderRadius: 4, maxPointWidth: 48, colorByPoint: true } },
    colors: report.buckets.map((b) => BUCKET_COLORS[b.name]),
    series: [{
      type: "column",
      name: metric === "count" ? "Bids" : "Submitted $",
      data: report.buckets.map((b) => (metric === "count" ? b.count : b.total)),
    }],
  };
}

export function trendChartOptions(report: SizeReport): Highcharts.Options {
  return {
    ...baseChart,
    chart: { ...baseChart.chart, type: "column" },
    legend: { enabled: true },
    accessibility: { description: "Submitted bids per size bucket for each period, stacked." },
    xAxis: { categories: report.series.map((p) => periodLabel(p.period_start, report.interval)) },
    yAxis: { ...baseChart.yAxis, allowDecimals: false },
    tooltip: { ...baseChart.tooltip, shared: true },
    plotOptions: { column: { stacking: "normal", borderRadius: 2, maxPointWidth: 48 } },
    series: BUCKET_NAMES.map((name) => ({
      type: "column" as const,
      name,
      color: BUCKET_COLORS[name],
      data: report.series.map((p) => p.buckets[name]?.count ?? 0),
    })),
  };
}

export function agentChartOptions(report: SizeReport): Highcharts.Options {
  return {
    ...baseChart,
    chart: { ...baseChart.chart, type: "bar", height: Math.max(220, report.by_agent.length * 44 + 80) },
    legend: { enabled: true },
    accessibility: { description: "Submitted bids per size bucket for each agent, stacked." },
    xAxis: { categories: report.by_agent.map((a) => a.name) },
    yAxis: { ...baseChart.yAxis, allowDecimals: false },
    tooltip: { ...baseChart.tooltip, shared: true },
    plotOptions: { bar: { stacking: "normal", borderRadius: 2 } },
    series: BUCKET_NAMES.map((name) => ({
      type: "bar" as const,
      name,
      color: BUCKET_COLORS[name],
      data: report.by_agent.map((a) => a.buckets[name]?.count ?? 0),
    })),
  };
}

/** Bid Value vs. Size (KAN-60/61): distribution, trend and per-agent split of submitted bids. */
export function BidSizeSection({
  report,
  companyMode,
  interval,
  onIntervalChange,
}: {
  report: SizeReport | null | undefined;
  companyMode: boolean;
  interval: "week" | "month";
  onIntervalChange: (interval: "week" | "month") => void;
}) {
  if (!report) {
    return (
      <Card>
        <CardHeader><CardTitle>Bid Value vs. Size</CardTitle></CardHeader>
        <CardContent className="text-sm text-slate-600">No size data for this period.</CardContent>
      </Card>
    );
  }
  return (
    <Card aria-labelledby="bid-size-heading">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle id="bid-size-heading">Bid Value vs. Size</CardTitle>
          <CardDescription className="text-slate-600">
            {companyMode ? "Company-wide" : "This agent's"} submitted bids by size bucket · {report.count} bids · {formatMoney(report.total)}
          </CardDescription>
        </div>
        <div className="flex gap-1" role="group" aria-label="Trend interval">
          {(["week", "month"] as const).map((value) => (
            <button key={value} type="button" onClick={() => onIntervalChange(value)}
              aria-pressed={interval === value}
              className={`rounded-md border px-3 py-1 text-sm ${interval === value ? "bg-primary text-primary-foreground" : "bg-background"}`}>
              {value === "week" ? "Weekly" : "Monthly"}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {report.buckets.map((bucket) => (
            <div key={bucket.name} className="rounded-lg border p-3" data-testid={`bucket-${bucket.name}`}>
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm" style={{ backgroundColor: BUCKET_COLORS[bucket.name] }} aria-hidden />
                <p className="font-semibold">{bucket.name}</p>
                <span className="text-xs text-slate-600">{rangeLabel(bucket.min, bucket.max)}</span>
              </div>
              <p className="mt-2 text-2xl font-bold tabular-nums">{bucket.count}</p>
              <p className="text-sm tabular-nums">{formatMoney(bucket.total)}</p>
              <p className="mt-1 text-xs text-slate-600">{bucket.count_share}% of bids · {bucket.value_share}% of $</p>
            </div>
          ))}
        </div>

        {report.count > 0 ? (
          <>
            <div className="grid gap-6 lg:grid-cols-2">
              <figure>
                <figcaption className="mb-2 text-sm font-medium">Bid count by size</figcaption>
                <HighchartsReact highcharts={Highcharts} options={bucketChartOptions(report, "count")} />
              </figure>
              <figure>
                <figcaption className="mb-2 text-sm font-medium">Submitted $ by size</figcaption>
                <HighchartsReact highcharts={Highcharts} options={bucketChartOptions(report, "total")} />
              </figure>
            </div>
            <figure>
              <figcaption className="mb-2 text-sm font-medium">Bids by size over time ({interval === "week" ? "weekly" : "monthly"})</figcaption>
              <HighchartsReact highcharts={Highcharts} options={trendChartOptions(report)} />
            </figure>
            {companyMode && report.by_agent.length > 0 && (
              <figure>
                <figcaption className="mb-2 text-sm font-medium">Bids by size per agent</figcaption>
                <HighchartsReact highcharts={Highcharts} options={agentChartOptions(report)} />
              </figure>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-600">No submitted bids in this period.</p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Bid size breakdown">
            <thead>
              <tr className="border-b text-left">
                <th className="py-2 pr-3 font-medium">{companyMode ? "Agent" : "Bucket"}</th>
                {companyMode
                  ? BUCKET_NAMES.map((name) => <th key={name} className="py-2 pr-3 font-medium">{name}</th>)
                  : <><th className="py-2 pr-3 font-medium">Bids</th><th className="py-2 pr-3 font-medium">Submitted $</th></>}
                {companyMode && <th className="py-2 pr-3 font-medium">Total</th>}
              </tr>
            </thead>
            <tbody>
              {companyMode
                ? report.by_agent.map((agent) => (
                  <tr key={agent.user_id ?? "other"} className="border-b last:border-0">
                    <td className="py-2 pr-3">{agent.name}{!agent.is_active && <span className="ml-1 text-xs text-slate-600">(inactive)</span>}</td>
                    {BUCKET_NAMES.map((name) => (
                      <td key={name} className="py-2 pr-3 tabular-nums">{agent.buckets[name]?.count ?? 0} · {formatMoney(agent.buckets[name]?.total ?? 0)}</td>
                    ))}
                    <td className="py-2 pr-3 tabular-nums">{agent.count} · {formatMoney(agent.total)}</td>
                  </tr>
                ))
                : report.buckets.map((bucket) => (
                  <tr key={bucket.name} className="border-b last:border-0">
                    <td className="py-2 pr-3">{bucket.name}</td>
                    <td className="py-2 pr-3 tabular-nums">{bucket.count}</td>
                    <td className="py-2 pr-3 tabular-nums">{formatMoney(bucket.total)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
