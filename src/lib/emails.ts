/** Types and helpers for Gmail connection, bid email and spam-risk checks (KAN-74). */

export type GmailStatus = "not_connected" | "connected" | "expired" | "disconnected";

export interface GmailAccount {
  status: GmailStatus;
  connected: boolean;
  configured?: boolean;
  gmail_address?: string | null;
  connected_at?: string | null;
  last_synced_at?: string | null;
  last_sync_summary?: SyncSummary | null;
  last_error?: string | null;
  needs_reconnect?: boolean;
}

export interface SyncSummary {
  mode: "full" | "incremental" | null;
  checked: number;
  stored: number;
  skipped_duplicate: number;
  not_bid_related: number;
  unlinked: number;
  bounces: number;
  skipped_missing?: number;
  more_pending?: boolean;
}

export type RiskLevel = "low" | "medium" | "high";

export interface SpamFinding {
  rule: string;
  field: "subject" | "body" | "links" | "recipients";
  weight: number;
  severity: "info" | "warning" | "high";
  message: string;
  suggestion: string;
  matches: string[];
}

export interface SpamCheckResult {
  score: number;
  level: RiskLevel;
  findings: SpamFinding[];
  warn_threshold: number;
  hold_threshold: number;
  will_hold: boolean;
  fingerprint: string;
  disclaimer: string;
}

export type SendStatus = "sending" | "sent" | "held" | "failed" | "bounced" | "discarded";

export interface EmailMessageItem {
  id: number;
  thread_id: number | null;
  bid_id: number | null;
  reply_to_thread_id: number | null;
  direction: "inbound" | "outbound";
  from: string | null;
  to: string[];
  cc: string[];
  subject: string | null;
  snippet: string | null;
  body_text: string | null;
  body_html: string | null;
  sent_at: string | null;
  created_at: string | null;
  sent_by_user_id: number | null;
  sent_by_name?: string | null;
  send_status: SendStatus | null;
  send_error: string | null;
  spam_check: SpamCheckResult | null;
  reviewed_by_name?: string | null;
  reviewed_at?: string | null;
  is_bounce_notice: boolean;
  bid?: { id: number; solicitation_number: string | null; title: string | null } | null;
  mailbox?: string | null;
}

/** A KAN-80 vendor on the bid whose email takes part in a conversation. */
export interface EmailVendor {
  id: number;
  company_name: string | null;
  email: string;
  status: string;
  /** Ali's automated negotiation can still act on this vendor (not stopped, best offer not in). */
  negotiation_open: boolean;
  /** A conversation with this vendor is marked "handling manually", so automation skips it. */
  automation_paused: boolean;
}

export type LinkSource = "app_initiated" | "reply_header" | "solicitation_match" | "recipient_match" | "manual";

export interface EmailThreadItem {
  id: number;
  bid_id: number | null;
  candidate_bid_ids: number[];
  subject: string | null;
  counterpart_emails: string[];
  link_source: LinkSource;
  manual_override: boolean;
  manual_override_by_name?: string | null;
  manual_override_at?: string | null;
  last_message_at: string | null;
  mailbox: string | null;
  mailbox_owner_name: string | null;
  mailbox_owner_user_id: number | null;
  vendors?: EmailVendor[];
  messages: EmailMessageItem[];
}

export interface BidEmailsResponse {
  bid: { id: number; solicitation_number: string | null; title: string | null; contact_email: string | null; co_name: string | null };
  threads: EmailThreadItem[];
  outbox: EmailMessageItem[];
  vendors?: EmailVendor[];
  account: GmailAccount;
  current_user_id: number;
}

export interface EmailDraft {
  to: string[];
  cc: string[];
  subject: string;
  body_text: string;
}

export const RISK_DISCLAIMER =
  "This is a risk estimate based on common spam signals. It is not a guarantee of whether Gmail will deliver the message or place it in spam.";

export const LINK_SOURCE_LABELS: Record<LinkSource, string> = {
  app_initiated: "Sent from Contract Finder",
  reply_header: "Matched by reply",
  solicitation_match: "Matched by solicitation number",
  recipient_match: "Matched by contact",
  manual: "Linked manually",
};

export const SEND_STATUS_LABELS: Record<SendStatus, string> = {
  sending: "Sending status unknown",
  sent: "Sent (accepted by Gmail)",
  held: "Held for review",
  failed: "Not sent",
  bounced: "Bounced",
  discarded: "Discarded",
};

export function sendStatusClass(status: SendStatus | null) {
  switch (status) {
    case "sent": return "bg-emerald-100 text-emerald-800";
    case "held":
    case "sending": return "bg-amber-100 text-amber-900";
    case "failed":
    case "bounced": return "bg-red-100 text-red-800";
    default: return "bg-slate-100 text-slate-700";
  }
}

export function riskClass(level: RiskLevel) {
  if (level === "high") return "border-red-300 bg-red-50 text-red-900";
  if (level === "medium") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-emerald-300 bg-emerald-50 text-emerald-900";
}

export function parseAddressList(value: string): string[] {
  return value.split(/[,;\s]+/).map((part) => part.trim().toLowerCase()).filter(Boolean);
}

export function formatDateTime(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }) + " ET";
}

export async function requestJson<T = unknown>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T & { error?: string } }> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json", ...(init?.headers || {}) } : init?.headers,
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  return { ok: response.ok, status: response.status, data };
}
