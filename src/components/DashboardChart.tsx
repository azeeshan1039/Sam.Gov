"use client";

import dynamic from "next/dynamic";
import Highcharts from "highcharts";

const HighchartsReact = dynamic(
  () => import("highcharts-react-official").then((mod) => mod.default),
  { ssr: false }
);

export default function DashboardChart({ categories, counts }: { categories: string[]; counts: number[] }) {
  const options: Highcharts.Options = {
    chart: {
      type: "column",
      backgroundColor: "transparent",
      height: 320,
      style: { fontFamily: "inherit" },
    },
    title: { text: "Opportunities by Agency", style: { fontSize: "1rem" } },
    xAxis: {
      categories,
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
        data: counts,
        color: "#0c8ee6",
      },
    ],
  };
  return (
    <div className="h-[320px] w-full">
      <HighchartsReact highcharts={Highcharts} options={options} />
    </div>
  );
}
