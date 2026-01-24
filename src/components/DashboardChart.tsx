"use client";

import dynamic from "next/dynamic";
import Highcharts from "highcharts";

const HighchartsReact = dynamic(
  () => import("highcharts-react-official").then((mod) => mod.default),
  { ssr: false }
);

const options: Highcharts.Options = {
  chart: {
    type: "column",
    backgroundColor: "transparent",
    style: { fontFamily: "inherit" },
  },
  title: { text: "Opportunities by Agency", style: { fontSize: "1rem" } },
  xAxis: {
    categories: ["GSA", "DOD", "VA", "DHS", "DOJ", "NASA"],
    crosshair: true,
  },
  yAxis: {
    min: 0,
    title: { text: "Count" },
    gridLineColor: "#e2e8f0",
  },
  tooltip: {
    shared: true,
    backgroundColor: "rgba(255,255,255,0.96)",
    borderColor: "#e2e8f0",
  },
  plotOptions: {
    column: {
      borderRadius: 4,
      dataLabels: { enabled: false },
    },
  },
  legend: { enabled: false },
  credits: { enabled: false },
  series: [
    {
      type: "column",
      name: "Opportunities",
      data: [42, 38, 31, 28, 24, 19],
      color: "#0c8ee6",
    },
  ],
};

export default function DashboardChart() {
  return (
    <div className="h-[320px] w-full">
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  );
}
