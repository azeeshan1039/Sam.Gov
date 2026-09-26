import { requesterQuery } from "@/lib/pipeline";

export interface AgentAlert {
  id: number;
  title: string;
  message: string;
  notification_type: string;
  is_read: boolean;
  created_at: string | null;
  bid_id: number | null;
  solicitation_number: string | null;
  reason: string;
  href: string;
}

export interface AgentAlertListResponse {
  notifications: AgentAlert[];
  unread_count: number;
}

const LABELS: Record<string, string> = {
  stale_bid: "Stale bid",
  duplicate_detected: "Duplicate detected",
  blocked_pickup: "Blocked pickup",
  award_checkpoint_due: "Award checkpoint due",
};

export function agentAlertLabel(type: string) {
  return LABELS[type] || "Alert";
}

export function formatAlertTime(value: string | null) {
  if (!value) return "";
  const normalized = /[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function fetchAgentAlerts(user: { id: number; company_id: number }) {
  const query = requesterQuery(user);
  const res = await fetch(`/api/backend/notifications/agent?${query}`, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Failed to load alerts (${res.status})`);
  }
  return {
    notifications: (data.notifications || []) as AgentAlert[],
    unread_count: Number(data.unread_count || 0),
  } satisfies AgentAlertListResponse;
}

export async function markAgentAlertsRead(
  user: { id: number; company_id: number },
  ids: number[] | "all"
) {
  const query = requesterQuery(user);
  const body =
    ids === "all"
      ? { mark_all: true, requester_user_id: user.id, company_id: user.company_id }
      : { notification_ids: ids, requester_user_id: user.id, company_id: user.company_id };
  const res = await fetch(`/api/backend/notifications/agent/mark-read?${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Failed to update alerts (${res.status})`);
  }
  return data as { success: boolean; marked_count: number; unread_count: number };
}
