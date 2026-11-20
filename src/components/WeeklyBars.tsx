"use client";

import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

export default function WeeklyBars({
  weeks,
  goal = 5,
}: {
  weeks: Array<{ label: string; count: number; current?: boolean }>;
  goal?: number;
}) {
  const options: Highcharts.Options = {
    chart: {
      backgroundColor: "transparent",
      height: 240,
      spacing: [12, 8, 8, 8],
      style: { fontFamily: '"Geist Mono", ui-monospace, monospace' },
    },
    title: { text: `Bids per week: ${weeks.map((week) => `${week.label} ${week.count}`).join(", ")}; weekly goal ${goal}.`, floating: true, style: { display: "none" } },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: {
      categories: weeks.map((week) => week.label),
      lineColor: "#CDD5E1",
      tickColor: "transparent",
      labels: {
        style: { color: "#64748B", fontSize: "11px", fontFamily: '"Geist Mono", ui-monospace, monospace' },
      },
    },
    yAxis: {
      title: { text: undefined },
      gridLineColor: "#EEF2F7",
      min: 0,
      max: Math.max(goal + 1, ...weeks.map((week) => week.count), 1),
      tickInterval: 2,
      labels: { style: { color: "#64748B", fontSize: "11px", fontFamily: '"Geist Mono", ui-monospace, monospace' } },
      plotLines: [{
        value: goal,
        color: "#94A3B8",
        width: 2,
        dashStyle: "Dash",
        zIndex: 4,
        label: {
          text: `GOAL ${goal}`,
          align: "right",
          x: -4,
          y: -6,
          style: { color: "#475569", fontSize: "11px", fontFamily: '"Geist Mono", monospace' },
        },
      }],
    },
    tooltip: { backgroundColor: "#FFFFFF", borderColor: "#E4E8EF", style: { color: "#0B1220" } },
    plotOptions: {
      column: {
        borderWidth: 0,
        borderRadius: 4,
        pointPadding: 0.18,
        groupPadding: 0.22,
        dataLabels: {
          enabled: true,
          style: { fontFamily: '"Space Grotesk", sans-serif', fontWeight: "500", fontSize: "14px", color: "#0B1220", textOutline: "none" },
        },
      },
      series: { animation: false },
    },
    series: [{
      type: "column",
      name: "Submitted",
      data: weeks.map((week) => ({
        y: week.count,
        color: week.current ? "rgba(8,145,178,0.18)" : "#0891B2",
        borderColor: "#0891B2",
        borderWidth: week.current ? 1.5 : 0,
        dashStyle: week.current ? "Dash" : "Solid",
      })),
    }],
  };

  return (
    <HighchartsReact
      highcharts={Highcharts}
      options={options}
      containerProps={{
        role: "img",
        "aria-label": `Bids per week: ${weeks.map((week) => `${week.label} ${week.count}`).join(", ")}; weekly goal ${goal}.`,
      }}
    />
  );
}
