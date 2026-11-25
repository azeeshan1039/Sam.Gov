export type ReportingPreset = "today" | "week" | "month";

const easternDateFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function easternTodayUtc(now = new Date()) {
  const parts = easternDateFormat.formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return new Date(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)));
}

export function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function opportunityDeadlinePassed(value?: string | null, now = new Date()) {
  if (!value) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value < dateOnly(easternTodayUtc(now));
  const deadline = Date.parse(value.includes("T") && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value + "Z" : value);
  return Number.isFinite(deadline) && deadline <= +now;
}

export function formatUtcDateRange(start: Date, end: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
  return `${formatter.format(start)} – ${formatter.format(end)}`;
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
