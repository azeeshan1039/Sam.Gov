"use client";

import dynamic from "next/dynamic";
import Highcharts from "highcharts";
import HighchartsAccessibility from "highcharts/modules/accessibility";
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
  Small: "#A5F3FC",
  Medium: "#06B6D4",
  Large: "#0E7490",
  "Very Large": "#164E63",
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
      <section className="cf-card" style={{ padding: "22px 24px" }}>
        <h2 className="cf-h2" style={{ fontSize: 20 }}>Bid value vs. size</h2>
        <p className="cf-sub">No size data for this period.</p>
      </section>
    );
  }
  const emptyBucket = (count: number) => count === 0;
  return (
    <section className="cf-card" aria-labelledby="bid-size-heading" style={{ padding: "22px 24px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h2 id="bid-size-heading" className="cf-h2" style={{ fontSize: 20 }}>Bid value vs. size</h2>
          <p className="cf-sub">
            {companyMode ? "Company-wide" : "Your"} submitted bids by size bucket · {report.count} bids · {formatMoney(report.total)}
          </p>
        </div>
        <div className="cf-seg-wrap" role="group" aria-label="Time grouping">
          {(["week", "month"] as const).map((value) => (
            <button key={value} type="button" onClick={() => onIntervalChange(value)}
              aria-pressed={interval === value}
              className={`cf-seg${interval === value ? " cf-seg-on" : ""}`}>
              {value === "week" ? "Weekly" : "Monthly"}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(220px, 100%), 1fr))", gap: 12 }}>
        {report.buckets.map((bucket) => (
          <div key={bucket.name} className="cf-bucket" data-testid={`bucket-${bucket.name}`}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="cf-sw" style={{ background: BUCKET_COLORS[bucket.name] }} aria-hidden />
              <span style={{ fontWeight: 500 }}>{bucket.name}</span>
              <span className="cf-meta cf-mono">{rangeLabel(bucket.min, bucket.max)}</span>
            </div>
            <div className="cf-bucket-v" style={emptyBucket(bucket.count) ? { color: "var(--cf-text-3)" } : undefined}>{bucket.count}</div>
            <div className="cf-mono" style={{ fontSize: 13, color: emptyBucket(bucket.count) ? "var(--cf-text-3)" : undefined }}>{formatMoney(bucket.total)}</div>
            <div className="cf-meta">{bucket.count_share}% of bids · {bucket.value_share}% of $</div>
          </div>
        ))}
      </div>

      {report.count > 0 ? (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 24 }}>
            <figure style={{ flex: "1 1 420px", minWidth: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <figcaption className="cf-lbl">Bid count by size</figcaption>
              <HighchartsReact highcharts={Highcharts} options={bucketChartOptions(report, "count")} />
            </figure>
            <figure style={{ flex: "1 1 420px", minWidth: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <figcaption className="cf-lbl">Submitted $ by size</figcaption>
              <HighchartsReact highcharts={Highcharts} options={bucketChartOptions(report, "total")} />
            </figure>
          </div>
          <figure style={{ margin: 0, display: "flex", flexDirection: "column", gap: 10, borderTop: "1px solid var(--cf-line)", paddingTop: 20 }}>
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12 }}>
              <figcaption className="cf-lbl">Bids by size, {interval === "week" ? "week by week" : "month by month"}</figcaption>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 16, fontSize: 13, color: "var(--cf-text-2)" }}>
                {BUCKET_NAMES.map((name) => (
                  <span key={name} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span className="cf-sw" style={{ background: BUCKET_COLORS[name] }} />{name}
                  </span>
                ))}
              </div>
            </div>
            <HighchartsReact highcharts={Highcharts} options={{ ...trendChartOptions(report), legend: { enabled: false } }} />
          </figure>
          {companyMode && report.by_agent.length > 0 && (
            <figure style={{ margin: 0 }}>
              <figcaption className="cf-lbl" style={{ marginBottom: 8 }}>Bids by size per agent</figcaption>
              <HighchartsReact highcharts={Highcharts} options={agentChartOptions(report)} />
            </figure>
          )}
        </>
      ) : (
        <p className="cf-sub">No submitted bids in this period.</p>
      )}

      <div style={{ overflowX: "auto" }}>
        <table className="cf-table" aria-label="Bid size breakdown">
          <thead>
            <tr>
              <th>{companyMode ? "Agent" : "Bucket"}</th>
              {companyMode
                ? BUCKET_NAMES.map((name) => <th key={name}>{name}</th>)
                : <><th className="cf-num">Bids</th><th className="cf-num">Submitted $</th></>}
              {companyMode && <th>Total</th>}
            </tr>
          </thead>
          <tbody>
            {companyMode
              ? report.by_agent.map((agent) => (
                <tr key={agent.user_id ?? "other"}>
                  <td>{agent.name}{!agent.is_active && <span className="cf-meta"> (inactive)</span>}</td>
                  {BUCKET_NAMES.map((name) => (
                    <td key={name} className="cf-num">{agent.buckets[name]?.count ?? 0} · {formatMoney(agent.buckets[name]?.total ?? 0)}</td>
                  ))}
                  <td className="cf-num">{agent.count} · {formatMoney(agent.total)}</td>
                </tr>
              ))
              : report.buckets.map((bucket) => (
                <tr key={bucket.name}>
                  <td>{bucket.name}</td>
                  <td className="cf-num">{bucket.count}</td>
                  <td className="cf-num">{formatMoney(bucket.total)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
