"use client";

import dynamic from "next/dynamic";
import Highcharts from "highcharts";

const HighchartsReact = dynamic(
  () => import("highcharts-react-official").then((mod) => mod.default),
  { ssr: false }
);

export default function DashboardChartTrend({ categories, counts }: { categories: string[]; counts: number[] }) {
  const options: Highcharts.Options = {
    chart: {
      type: "areaspline",
      backgroundColor: "transparent",
      height: 320,
      style: { fontFamily: "inherit" },
    },
    title: { text: "Weekly Trend", style: { fontSize: "1rem" } },
    xAxis: {
      categories,
      crosshair: true,
    },
    yAxis: {
      min: 0,
      title: { text: "New Postings" },
      gridLineColor: "#e2e8f0",
    },
    tooltip: {
      shared: true,
      backgroundColor: "rgba(255,255,255,0.96)",
      borderColor: "#e2e8f0",
    },
    plotOptions: {
      areaspline: {
        fillOpacity: 0.2,
        marker: { radius: 3 },
        lineWidth: 2,
      },
    },
    legend: { enabled: false },
    credits: { enabled: false },
    series: [
      {
        type: "areaspline",
        name: "Postings",
        data: counts,
        color: "#059669",
      },
    ],
  };
  return (
    <div className="h-[320px] w-full">
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  );
}
