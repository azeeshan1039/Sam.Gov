export const PORTALS = ["SAM.GOV", "SEPTA", "Unison", "Nassau"] as const;
export type PortalName = (typeof PORTALS)[number];

export const PORTAL_COLORS: Record<PortalName, string> = {
  "SAM.GOV": "#2563eb",
  SEPTA: "#16a34a",
  Unison: "#f59e0b",
  Nassau: "#7c3aed",
};

export const PORTAL_SHORT: Record<PortalName, string> = {
  "SAM.GOV": "SAM",
  SEPTA: "SEPTA",
  Unison: "Unison",
  Nassau: "Nassau",
};

export type ColumnGroup = "all" | "weekly" | "historical" | "portals" | "values";

export interface LeaderboardRow {
  user_id: number;
  name: string;
  amount: number;
  bid_count: number;
  rank: number;
}

export interface MonthlyGoal {
  achieved: number;
  monthly: number;
  left: number;
  pct: number;
}

export interface PortalCount {
  name: string;
  count: number;
}

export interface WeekCell {
  submitted: number;
  potential: number;
}

export interface EmployeeStatsRow {
  user_id: number;
  name: string;
  weeks: WeekCell[];
  month_total: number;
  monthly_goal: number;
  prev_month: number;
  prev2_month: number;
  portals: Record<string, number>;
  lte_50k: number;
  gte_50k: number;
  gte_100k: number;
  avg_weekly: number | null;
  smallest: number | null;
  biggest: number | null;
}

export interface StatsPayload {
  year: number;
  month: number;
  month_label: string;
  prev_month_label: string;
  prev2_month_label: string;
  week_labels: string[];
  monthly_goal: MonthlyGoal;
  total_submission_value: number;
  thresholds: {
    gte_100k: number;
    gte_50k: number;
    lte_50k: number;
  };
  leaderboard: LeaderboardRow[];
  bid_by_portal: { total: number; portals: PortalCount[] };
  employees: EmployeeStatsRow[];
}

export function formatMoney(value: number | null | undefined) {
  if (value == null) return "—";
  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export function displayName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  const one = parts[0] || "?";
  return one.slice(0, 2).toUpperCase();
}

export function portalCount(row: EmployeeStatsRow, portal: PortalName) {
  return Number(row.portals?.[portal] ?? 0);
}
