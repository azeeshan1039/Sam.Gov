"use client";

import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";
import { dateOnly } from "@/lib/eastern-date";
import type { dashboardReportingRange } from "@/lib/dashboard-reporting";

export default function GoalPaceChart({
  range,
  dailyCounts,
  goal,
}: {
  range: ReturnType<typeof dashboardReportingRange>;
  dailyCounts: ReadonlyMap<string, number>;
  goal: number | null;
}) {
  const { start, days, elapsed: day, label } = range;
  const submitted = Array.from(dailyCounts.values()).reduce((sum, count) => sum + count, 0);
  const paceToday = goal == null ? null : Math.round(goal * day / days);
  const forecast = Math.round(submitted * days / day);
  const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const monthFormat = new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" });
  const categories: string[] = [];
  const tickPositions: number[] = [];
  const tickLabels: string[] = [];
  const actual: Array<number | Highcharts.PointOptionsObject | null> = [];
  const projected: Array<number | Highcharts.PointOptionsObject | null> = [];
  const pace: number[] = [];
  const todayMarker: Highcharts.PointMarkerOptionsObject = {
    enabled: true,
    radius: 5,
    fillColor: "#0891B2",
    lineColor: "#FFFFFF",
    lineWidth: 2,
    symbol: "circle",
  };
  const endMarker = (stroke: string): Highcharts.PointMarkerOptionsObject => ({
    enabled: true,
    radius: 4,
    fillColor: "#FFFFFF",
    lineColor: stroke,
    lineWidth: 2,
    symbol: "circle",
  });
  let cumulative = 0;
  const date = new Date(start);
  for (let index = 1; index <= days; index += 1, date.setUTCDate(date.getUTCDate() + 1)) {
    categories.push(dateFormat.format(date));
    if (days <= 31 ? (index - 1) % 7 === 0 : date.getUTCDate() === 1) {
      tickPositions.push(index - 1);
      tickLabels[index - 1] = days > 100 ? monthFormat.format(date) : dateFormat.format(date);
    }
    if (goal != null) pace.push(Number(((goal * index) / days).toFixed(2)));
    if (index <= day) {
      cumulative += dailyCounts.get(dateOnly(date)) ?? 0;
      actual.push(index === day ? { y: cumulative, marker: todayMarker } : cumulative);
      projected.push(index === day ? { y: submitted, marker: { enabled: false } } : null);
    } else {
      actual.push(null);
      const span = Math.max(days - day, 1);
      const value = Number((submitted + ((forecast - submitted) * (index - day)) / span).toFixed(2));
      projected.push(index === days ? { y: value, marker: endMarker("#7C3AED") } : value);
    }
  }
  const chartDescription = `${label}: ${submitted} ${submitted === 1 ? "bid" : "bids"} submitted${goal == null ? "" : ` against a goal of ${goal}`}${day < days ? `, with ${forecast} forecast by ${dateFormat.format(range.last)}` : ""}.`;

  const options: Highcharts.Options = {
    chart: {
      backgroundColor: "transparent",
      height: 280,
      spacing: [12, 18, 8, 12],
      style: { fontFamily: '"Geist Mono", ui-monospace, monospace' },
    },
    title: { text: chartDescription, floating: true, style: { display: "none" } },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: {
      categories,
      lineColor: "#CDD5E1",
      tickColor: "transparent",
      tickPositions,
      labels: {
        autoRotation: [],
        formatter() { return tickLabels[this.pos] ?? ""; },
        style: { color: "#64748B", fontSize: "11px", fontFamily: '"Geist Mono", ui-monospace, monospace' },
      },
      plotBands: day < days ? [{ from: day - 1, to: days - 1, color: "rgba(15,23,42,0.03)" }] : [],
      plotLines: day < days ? [{
        value: day - 1,
        color: "#64748B",
        width: 1,
        dashStyle: "Dot",
        zIndex: 4,
      }] : [],
    },
    yAxis: {
      title: { text: undefined },
      gridLineColor: "#EEF2F7",
      min: 0,
      max: Math.max(goal ?? 0, forecast, submitted, 1),
      labels: { style: { color: "#64748B", fontSize: "11px", fontFamily: '"Geist Mono", ui-monospace, monospace' } },
    },
    tooltip: {
      shared: true,
      backgroundColor: "#FFFFFF",
      borderColor: "#E4E8EF",
      style: { color: "#0B1220", fontFamily: "Geist, system-ui, sans-serif" },
    },
    plotOptions: {
      series: {
        animation: false,
        marker: { enabled: false, states: { hover: { enabled: false } } },
        states: { hover: { lineWidthPlus: 0 } },
      },
      area: { fillOpacity: 0.28 },
    },
    series: [
      {
        type: "area",
        name: "Actual",
        data: actual,
        color: "#0891B2",
        lineWidth: 2.5,
        fillColor: {
          linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
          stops: [
            [0, "rgba(8,145,178,0.28)"],
            [1, "rgba(8,145,178,0)"],
          ],
        },
      },
      ...(day < days ? [{
        type: "line",
        name: "Forecast",
        data: projected,
        color: "#7C3AED",
        dashStyle: "Dash",
        lineWidth: 2,
      } satisfies Highcharts.SeriesLineOptions] : []),
      ...(goal != null ? [{
        type: "line",
        name: "Goal pace",
        data: pace.map((value, index) => (
          index === days - 1
            ? { y: value, marker: endMarker("#94A3B8") }
            : value
        )),
        color: "#94A3B8",
        dashStyle: "Dash",
        lineWidth: 2,
      } satisfies Highcharts.SeriesLineOptions] : []),
    ],
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 32 }}>
        <div>
          <div className="cf-lbl">Submitted</div>
          <div style={{ marginTop: 6, font: "500 24px var(--cf-display)", color: "var(--cf-text)" }}>{submitted}</div>
        </div>
        {paceToday != null && <div>
          <div className="cf-lbl">{day < days ? "Goal pace today" : "Period goal"}</div>
          <div style={{ marginTop: 6, font: "500 24px var(--cf-display)", color: "var(--cf-text)" }}>{paceToday}</div>
        </div>}
        {day < days && <div>
          <div className="cf-lbl">Forecast by {dateFormat.format(range.last)}</div>
          <div style={{ marginTop: 6, font: "500 24px var(--cf-display)", color: goal != null && forecast < goal ? "#BE123C" : "var(--cf-text)" }}>~{forecast}</div>
        </div>}
      </div>
      <div role="img" aria-label={chartDescription}>
        <div aria-hidden="true">
          <HighchartsReact highcharts={Highcharts} options={options} />
        </div>
      </div>
    </div>
  );
}
