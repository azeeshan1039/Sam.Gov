export type ReportingPreset = "today" | "week" | "month";

export function easternTodayUtc(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

export function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function easternReportingRange(kind: ReportingPreset, now = new Date()) {
  const end = easternTodayUtc(now);
  const start = new Date(end);
  if (kind === "week") {
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
  } else if (kind === "month") {
    start.setUTCDate(1);
  }
  return { from: dateOnly(start), to: dateOnly(end) };
}
