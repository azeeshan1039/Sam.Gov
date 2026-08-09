export const HUNDRED_K_THRESHOLD = 100000;

export interface PipelineItem {
  id: number;
  bid_id: string;
  company_id: number;
  agent_user_id: number;
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
  cost: number | null;
  gross_sales: number | null;
  gross_profit: number | null;
  markup_amount: number | null;
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
}

export interface PipelineEmployeeGroup {
  user_id: number;
  name: string;
  role: string;
  items: PipelineItem[];
}

export function formatMoney(value: number | null | undefined) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
}

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(`${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "numeric" });
}

export function formatStatus(status: string | null | undefined) {
  if (!status) return "—";
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Row colors for 100k tracker (spreadsheet-style). */
export function hundredKRowClass(status: string | null | undefined) {
  switch ((status || "").toLowerCase()) {
    case "bid_submitted":
      return "bg-emerald-100/80";
    case "ready_for_approval":
    case "couldnt_get_quote":
    case "no_quote":
      return "bg-rose-100/80";
    case "in_progress":
    case "finding_supplier":
      return "bg-amber-50";
    default:
      return "";
  }
}

export function requesterQuery(user: { id: number; company_id: number }) {
  return new URLSearchParams({
    company_id: String(user.company_id),
    requester_user_id: String(user.id),
  });
}
