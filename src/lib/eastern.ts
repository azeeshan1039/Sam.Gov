const EASTERN_TZ = "America/New_York";

export function etDateParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: EASTERN_TZ,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const num = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: num("year"), month: num("month"), day: num("day") };
}

export function etMonthKey(now = new Date()) {
  const { year, month } = etDateParts(now);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function etMonthOptions(count = 18, now = new Date()) {
  const { year, month } = etDateParts(now);
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < count; i += 1) {
    let y = year;
    let m = month - i;
    while (m <= 0) {
      m += 12;
      y -= 1;
    }
    const label = new Date(y, m - 1, 1).toLocaleString("en-US", {
      month: "long",
      year: "numeric",
    });
    options.push({
      value: `${y}-${String(m).padStart(2, "0")}`,
      label,
    });
  }
  return options;
}
