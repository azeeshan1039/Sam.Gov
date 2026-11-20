"use client";

import Highcharts from "highcharts";
import HighchartsReact from "highcharts-react-official";

function etParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const pick = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  const year = pick("year");
  const month = pick("month");
  const day = pick("day");
  return { year, month, day, days: new Date(year, month, 0).getDate() };
}

export function paceAndForecast(submitted: number, goal: number) {
  const { day, days } = etParts();
  const paceToday = Math.round(goal * (day / days));
  const forecast = day > 0 ? Math.round(submitted * (days / day)) : submitted;
  return { day, days, paceToday, forecast };
}

export default function GoalPaceChart({
  submitted,
  goal,
  monthLabel,
}: {
  submitted: number;
  goal: number;
  monthLabel: string;
}) {
  const { day, days, paceToday, forecast } = paceAndForecast(submitted, goal);
  const monthShort = monthLabel.replace(/\s+\d{4}$/, "").slice(0, 3).toUpperCase();
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
  for (let index = 1; index <= days; index += 1) {
    pace.push(Number(((goal * index) / days).toFixed(2)));
    if (index <= day) {
      const value = day === 0 ? 0 : Number(((submitted * index) / day).toFixed(2));
      actual.push(index === day ? { y: submitted, marker: todayMarker, dataLabels: { enabled: true, format: String(submitted) } } : value);
      projected.push(index === day ? { y: submitted, marker: { enabled: false } } : null);
    } else {
      actual.push(null);
      const span = Math.max(days - day, 1);
      const value = Number((submitted + ((forecast - submitted) * (index - day)) / span).toFixed(2));
      projected.push(index === days ? { y: value, marker: endMarker("#7C3AED"), dataLabels: { enabled: true, format: `~${forecast}` } } : value);
    }
  }

  const options: Highcharts.Options = {
    chart: {
      backgroundColor: "transparent",
      height: 280,
      spacing: [8, 8, 8, 8],
      style: { fontFamily: '"Geist Mono", ui-monospace, monospace' },
    },
    title: { text: `Cumulative bids submitted in ${monthLabel}: ${submitted} by day ${day} against a goal pace of ${paceToday}; forecast about ${forecast} by month end versus a goal of ${goal}.`, floating: true, style: { display: "none" } },
    credits: { enabled: false },
    legend: { enabled: false },
    xAxis: {
      categories: Array.from({ length: days }, (_, index) => String(index + 1)),
      lineColor: "#CDD5E1",
      tickColor: "transparent",
      tickInterval: 7,
      labels: {
        style: { color: "#64748B", fontSize: "11px", fontFamily: '"Geist Mono", ui-monospace, monospace' },
        formatter() {
          return `${monthShort} ${this.value}`;
        },
      },
      plotBands: [{ from: day - 1, to: days - 1, color: "rgba(15,23,42,0.03)" }],
      plotLines: [{
        value: day - 1,
        color: "#64748B",
        width: 1,
        dashStyle: "Dot",
        zIndex: 4,
        label: {
          text: "TODAY",
          align: "left",
          x: 6,
          y: 14,
          style: { color: "#475569", fontSize: "11px", fontWeight: "500", fontFamily: '"Geist Mono", monospace' },
        },
      }],
    },
    yAxis: {
      title: { text: undefined },
      gridLineColor: "#EEF2F7",
      min: 0,
      max: Math.max(goal, forecast, submitted, 1),
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
        dataLabels: {
          crop: false,
          overflow: "allow",
          y: -8,
          style: {
            fontFamily: '"Space Grotesk", sans-serif',
            fontWeight: "500",
            fontSize: "14px",
            color: "#0B1220",
            textOutline: "none",
          },
        },
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
      {
        type: "line",
        name: "Forecast",
        data: projected,
        color: "#7C3AED",
        dashStyle: "Dash",
        lineWidth: 2,
      },
      {
        type: "line",
        name: "Goal pace",
        data: pace.map((value, index) => (
          index === days - 1
            ? { y: value, marker: endMarker("#94A3B8"), dataLabels: { enabled: true, format: `Goal ${goal}`, style: { color: "#475569", fontSize: "13px", fontWeight: "500", textOutline: "none" } } }
            : value
        )),
        color: "#94A3B8",
        dashStyle: "Dash",
        lineWidth: 2,
      },
    ],
  };

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 32 }}>
        <div>
          <div className="cf-lbl">Submitted</div>
          <div style={{ marginTop: 6, font: "500 24px var(--cf-display)", color: "var(--cf-text)" }}>{submitted}</div>
        </div>
        <div>
          <div className="cf-lbl">Goal pace today</div>
          <div style={{ marginTop: 6, font: "500 24px var(--cf-display)", color: "var(--cf-text)" }}>{paceToday}</div>
        </div>
        <div>
          <div className="cf-lbl">Forecast month-end</div>
          <div style={{ marginTop: 6, font: "500 24px var(--cf-display)", color: forecast < goal ? "#BE123C" : "var(--cf-text)" }}>~{forecast}</div>
        </div>
      </div>
      <p className="cf-meta">Actual is a straight line to the month-to-date total. Daily counts are not in this feed, so the shape is pace, not a day-by-day history.</p>
      <HighchartsReact
        highcharts={Highcharts}
        options={options}
        containerProps={{
          role: "img",
          "aria-label": `Cumulative bids submitted in ${monthLabel}: ${submitted} by day ${day} against a goal pace of ${paceToday}; forecast about ${forecast} by month end versus a goal of ${goal}.`,
        }}
      />
    </div>
  );
}
