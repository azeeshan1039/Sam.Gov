"use client";

import dynamic from "next/dynamic";
import Highcharts from "highcharts";

const HighchartsReact = dynamic(
  () => import("highcharts-react-official").then((mod) => mod.default),
  { ssr: false }
);

const options: Highcharts.Options = {
  chart: {
    type: "areaspline",
    backgroundColor: "transparent",
    style: { fontFamily: "inherit" },
  },
  title: { text: "Weekly Trend", style: { fontSize: "1rem" } },
  xAxis: {
    categories: ["Week 1", "Week 2", "Week 3", "Week 4"],
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
      data: [38, 45, 52, 51],
      color: "#059669",
    },
  ],
};

export default function DashboardChartTrend() {
  return (
    <div className="h-[320px] w-full">
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  );
}
