import type { PipelineItem } from "@/lib/pipeline";

export type AwardOutcome = "won" | "lost" | "pending" | "unknown";
export type CheckpointState = "due" | "upcoming" | "complete" | "flagged" | "untracked";

export const AWARD_OUTCOMES: AwardOutcome[] = ["won", "lost", "pending", "unknown"];
export const CHECKPOINT_DAYS = [30, 45, 60, 90] as const;

export const SIZE_BUCKET_OPTIONS = [
  { value: "small", label: "Small (< $50k)" },
  { value: "medium", label: "Medium ($50k – < $100k)" },
  { value: "large", label: "Large ($100k – < $500k)" },
  { value: "very_large", label: "Very Large ($500k+)" },
];

export const CHECKPOINT_STATE_OPTIONS: { value: CheckpointState; label: string }[] = [
  { value: "due", label: "Check due" },
  { value: "flagged", label: "90-day flag" },
  { value: "upcoming", label: "Upcoming" },
  { value: "complete", label: "Complete" },
  { value: "untracked", label: "Before checkpoint tracking" },
];

export interface CurrentCheckpoint {
  checkpoint_days: number;
  due_on: string;
  state: "due" | "upcoming" | "missed" | "completed" | "closed";
}

export interface SamAwardInfo {
  id: number;
  result: "found" | "not_found" | "error" | "deferred";
  api: string | null;
  requested_at: string;
  checkpoint_days: number | null;
  error_code: string | null;
  message: string | null;
  awardee_name: string | null;
  awardee_uei: string | null;
  amount: number | null;
  piid: string | null;
  date_signed: string | null;
  solicitation_id: string | null;
  candidates: Array<{
    api: string;
    awardee_name: string | null;
    awardee_uei: string | null;
    amount: number | null;
    piid: string | null;
    date_signed: string | null;
    modification_number: string | null;
  }>;
  applied: boolean;
}

export interface AwardSummaryFields {
  award_outcome: AwardOutcome;
  awarded_to: string | null;
  awarded_amount: number | null;
  outcome_notes: string | null;
  submitted_on: string | null;
  days_since_submission: number | null;
  tracked: boolean;
  checkpoint_state: CheckpointState;
  current_checkpoint: CurrentCheckpoint | null;
  checkpoints_completed: number;
  checkpoints_total: number;
  flagged: boolean;
  sam_info: SamAwardInfo | null;
}

export interface AwardTrackingItem extends AwardSummaryFields {
  id: number;
  bid_id: string;
  solicitation_number: string | null;
  title: string | null;
  portal: string | null;
  agent_user_id: number;
  agent_name: string | null;
  submitted_at: string | null;
  submitted_price: number | null;
  size_bucket: PipelineItem["size_bucket"];
  can_record: boolean;
}

export interface AwardTrackingSummary {
  count: number;
  outcomes: Record<AwardOutcome, number>;
  win_rate: number | null;
  won_submitted_total: number;
  lost_submitted_total: number;
  lost_to_competitors_total: number;
  flagged: number;
  due: number;
  top_competitors: Array<{ name: string; count: number; total: number }>;
}

export interface AwardTrackingResponse {
  items: AwardTrackingItem[];
  summary: AwardTrackingSummary;
  agents: Array<{ user_id: number; name: string }>;
  portals: string[];
  checkpoint_days: number[];
  tracking_start_date: string;
  today: string;
  sort: string;
  dir: "asc" | "desc";
}

export interface AwardCheckpoint {
  id: number;
  checkpoint_days: number;
  due_on: string;
  status: "open" | "completed" | "closed_resolved";
  state: "due" | "upcoming" | "missed" | "completed" | "closed";
  checked_on: string | null;
  checked_by_name: string | null;
  award_status: AwardOutcome | null;
  awarded_to: string | null;
  awarded_amount: number | null;
  notes: string | null;
}

export interface AwardHistoryEntry {
  id: number;
  changed_at: string;
  changed_by_name: string | null;
  checkpoint_days: number | null;
  checked_on: string | null;
  old_outcome: string | null;
  new_outcome: AwardOutcome;
  awarded_to: string | null;
  awarded_amount: number | null;
  notes: string | null;
  source: "manual" | "sam_values";
}

export interface AwardDetail extends AwardSummaryFields {
  checkpoints: AwardCheckpoint[];
  history: AwardHistoryEntry[];
  lookups: SamAwardInfo[];
  lookup: {
    enabled: boolean;
    eligible: boolean;
    reason: string | null;
    daily_budget: number;
    remaining_today: number;
  };
  tracking_start_date: string;
  can_record?: boolean;
}

export function formatOutcomeLabel(outcome: string | null | undefined) {
  switch (outcome) {
    case "won": return "Won";
    case "lost": return "Lost";
    case "pending": return "Pending";
    case "unknown": return "Unknown";
    default: return "—";
  }
}

export function outcomeBadgeClass(outcome: string | null | undefined) {
  switch (outcome) {
    case "won": return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "lost": return "bg-rose-100 text-rose-800 border-rose-200";
    case "pending": return "bg-amber-100 text-amber-800 border-amber-200";
    default: return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

/** "Day 45 · Due · 1/4" style label for the current checkpoint position. */
export function formatCheckpoint(item: Pick<AwardSummaryFields,
  "checkpoint_state" | "current_checkpoint" | "checkpoints_completed" | "checkpoints_total">) {
  const progress = `${item.checkpoints_completed}/${item.checkpoints_total || 4}`;
  if (item.checkpoint_state === "untracked") return "Before checkpoint tracking";
  if (item.checkpoint_state === "complete" || !item.current_checkpoint) return `Complete · ${progress}`;
  const day = `Day ${item.current_checkpoint.checkpoint_days}`;
  if (item.checkpoint_state === "flagged") return `${day} · 90-day flag · ${progress}`;
  if (item.checkpoint_state === "due") return `${day} · Due · ${progress}`;
  return `${day} on ${item.current_checkpoint.due_on} · ${progress}`;
}

export function checkpointChipClass(state: CheckpointState) {
  switch (state) {
    case "flagged": return "bg-rose-50 text-rose-700 border-rose-200";
    case "due": return "bg-amber-50 text-amber-800 border-amber-200";
    case "complete": return "bg-emerald-50 text-emerald-700 border-emerald-200";
    default: return "bg-slate-50 text-slate-600 border-slate-200";
  }
}
