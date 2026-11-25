import { dateOnly, easternTodayUtc } from "@/lib/eastern-date";

export type DashboardPeriod = "mtd" | "quarter" | "ytd";

export const DASHBOARD_PERIOD_LABELS = {
  mtd: "MTD",
  quarter: "Quarterly",
  ytd: "YTD",
} satisfies Record<DashboardPeriod, string>;

const dayMs = 86_400_000;
const monthFormat = new Intl.DateTimeFormat("en-US", {
  month: "short", year: "numeric", timeZone: "UTC",
});

export function dashboardQuarters(today: Date) {
  const month = today.getUTCMonth();
  return Array.from({ length: 4 }, (_, offset) => {
    const date = new Date(Date.UTC(today.getUTCFullYear(), month - month % 3 - offset * 3, 1));
    return {
      date,
      label: `Q${Math.floor(date.getUTCMonth() / 3) + 1} ${date.getUTCFullYear()}`,
    };
  });
}

export function dashboardReportingRange(period: DashboardPeriod, today: Date, quarterOffset: number) {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const quarter = dashboardQuarters(today)[quarterOffset];
  const start = period === "quarter" ? quarter.date : new Date(Date.UTC(year, period === "ytd" ? 0 : month, 1));
  const months = period === "quarter" ? 3 : period === "ytd" ? month + 1 : 1;
  const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 0));
  const through = today < last ? today : last;
  const startKey = dateOnly(start);
  const endKey = dateOnly(through);
  return {
    start,
    last,
    through,
    months,
    elapsed: Math.round((+through - +start) / dayMs) + 1,
    days: Math.round((+last - +start) / dayMs) + 1,
    startKey,
    endKey,
    label: period === "quarter" ? quarter.label : period === "ytd" ? `${year} YTD` : monthFormat.format(start),
  };
}

export function easternSubmissionDay(value: string | null | undefined) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(+date) ? "" : dateOnly(easternTodayUtc(date));
}
