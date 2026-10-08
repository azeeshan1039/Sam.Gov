export const HUNDRED_K_THRESHOLD = 100000;

export const BID_STATUSES = {
  "Finding Supplier": { color: "#8B0000", classification: "active" },
  "Bid submitted": { color: "#16A34A", classification: "completed" },
  "Waiting Approval": { color: "#EAB308", classification: "active" },
  "Bid No Approved": { color: "#F43F5E", classification: "active" },
  "Approved for Submission": { color: "#86EFAC", classification: "active" },
  "Bid got removed": { color: "#6B7280", classification: "completed" },
  "Couldnt get quote": { color: "#78716C", classification: "completed" },
} as const;

export type BidStatus = keyof typeof BID_STATUSES;

export interface StatusHistoryEvent {
  id: number;
  old_status: string;
  new_status: string;
  changed_by_user_id: number;
  changed_by_name: string | null;
  changed_at: string;
  changed_at_eastern: string;
}

export interface OwnershipHistoryEvent {
  id: number;
  agent_user_id: number | null;
  agent_name: string | null;
  changed_by_user_id: number;
  changed_by_name: string | null;
  action: string;
  reason: string | null;
  limit_override: boolean;
  started_at: string;
  ended_at: string | null;
}

export interface PipelineItem {
  id: number;
  bid_id: string;
  company_id: number;
  agent_user_id: number;
  current_owner_user_id?: number | null;
  agent_name: string | null;
  solicitation_number: string | null;
  title: string | null;
  manufacturer: string | null;
  portal: string | null;
  bid_url: string | null;
  assign_date: string | null;
  due_date: string | null;
  due_time: string | null;
  days_remaining: number | null;
  tracked_opportunity_id: number | null;
  expected_submitted_price: number | null;
  supplier_cost: number | null;
  submitted_price: number | null;
  gross_profit: number | null;
  markup_percent: number | null;
  size_bucket: "Small" | "Medium" | "Large" | "Very Large" | null;
  negative_profit_warning: boolean;
  cost: number | null;
  gross_sales: number | null;
  markup_amount: number | null;
  awarded_amount: number | null;
  award_outcome: "won" | "lost" | "pending" | "unknown";
  awarded_to: string | null;
  outcome_notes: string | null;
  outcome_updated_by_user_id: number | null;
  outcome_updated_by_name: string | null;
  outcome_updated_at: string | null;
  internal_status: string;
  approval_status: string;
  approved_by_user_id: number | null;
  approved_by_name: string | null;
  final_quote_url: string | null;
  final_quote_basis: string | null;
  co_name: string | null;
  contact_email: string | null;
  delivery_address: string | null;
  shipping_notes: string | null;
  session_id: number | null;
  submitted_at: string | null;
  outcome: string | null;
  status_history?: StatusHistoryEvent[];
  ownership_history?: OwnershipHistoryEvent[];
}

export interface PipelineEmployeeGroup {
  user_id: number;
  name: string;
  role: string;
  items: PipelineItem[];
}

export function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

export function formatOutcome(outcome: string | null | undefined) {
  if (outcome === "won") return "Won";
  if (outcome === "lost") return "Lost";
  if (outcome === "pending") return "Pending";
  if (outcome === "unknown") return "Unknown";
  return "—";
}

export function formatStatus(status: string | null | undefined) {
  if (!status) return "—";
  if (status in BID_STATUSES) return status;
  return status.split("_").map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");
}

export function statusStyle(status: string | null | undefined) {
  const definition = status ? BID_STATUSES[status as BidStatus] : undefined;
  return definition ? { backgroundColor: definition.color, color: "white" } : undefined;
}

export function hundredKRowClass(status: string | null | undefined) {
  switch (formatStatus(status)) {
    case "Bid submitted": return "bg-emerald-100/80";
    case "Bid No Approved":
    case "Couldnt get quote": return "bg-rose-100/80";
    case "Finding Supplier":
    case "Waiting Approval": return "bg-amber-50";
    default: return "";
  }
}

export function requesterQuery(user: { id: number; company_id: number }) {
  return new URLSearchParams({ company_id: String(user.company_id), requester_user_id: String(user.id) });
}
