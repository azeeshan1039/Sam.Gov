"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import DOMPurify from "dompurify";
import { ArrowDownLeft, ArrowUpRight, Link2, Mail, RefreshCw, Reply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ComposeEmailDialog, type ComposeTarget } from "./ComposeEmailDialog";
import {
  formatDateTime,
  LINK_SOURCE_LABELS,
  requestJson,
  SEND_STATUS_LABELS,
  sendStatusClass,
  type BidEmailsResponse,
  type EmailMessageItem,
  type EmailThreadItem,
  type EmailVendor,
} from "@/lib/emails";

function MessageBody({ message }: { message: EmailMessageItem }) {
  if (message.body_text && message.body_text.trim()) {
    return <pre className="whitespace-pre-wrap break-words font-sans text-sm text-slate-800">{message.body_text}</pre>;
  }
  if (message.body_html) {
    const clean = DOMPurify.sanitize(message.body_html, {
      FORBID_TAGS: ["style", "form", "input", "button", "iframe", "script"],
      FORBID_ATTR: ["style", "onerror", "onclick"],
    });
    return <div className="prose prose-sm max-w-none break-words" dangerouslySetInnerHTML={{ __html: clean }} />;
  }
  return <p className="text-sm text-slate-600">{message.snippet || "(no content)"}</p>;
}

function StatusBadge({ message }: { message: EmailMessageItem }) {
  if (message.direction !== "outbound" || !message.send_status) return null;
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${sendStatusClass(message.send_status)}`}>
      {SEND_STATUS_LABELS[message.send_status]}
    </span>
  );
}

function vendorName(vendor: EmailVendor) {
  return vendor.company_name || vendor.email;
}

/** Ask the panel to open a new email to one address, e.g. from a vendor row (KAN-77 vendor workflow). */
export interface ComposeRequest {
  to: string;
  name?: string | null;
  nonce: number;
}

function replySubject(subject: string | null) {
  const s = (subject || "").trim();
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

/**
 * Email conversations for one bid (KAN-76/77): synced threads, held/failed outbox,
 * possible matches to link, and compose/reply through the employee's Gmail.
 */
export function BidEmailsPanel({ bidId, composeRequest, readOnly = false }: { bidId: number; composeRequest?: ComposeRequest | null; readOnly?: boolean }) {
  const [data, setData] = useState<BidEmailsResponse | null>(null);
  const [suggested, setSuggested] = useState<EmailThreadItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [compose, setCompose] = useState<ComposeTarget | null>(null);
  const [openThread, setOpenThread] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [threads, unlinked] = await Promise.all([
      requestJson<BidEmailsResponse>(`/api/backend/emails/bids/${bidId}/threads`),
      requestJson<{ threads: EmailThreadItem[] }>("/api/backend/emails/unlinked"),
    ]);
    if (!threads.ok) { setError(threads.data.error || "Unable to load emails."); return; }
    // Keep any action error (e.g. a failed send) visible across the reload.
    setData(threads.data);
    setSuggested(unlinked.ok ? (unlinked.data.threads || []).filter((t) => t.candidate_bid_ids.includes(bidId)) : []);
  }, [bidId]);

  useEffect(() => { load(); }, [load]);

  // Open compose once per request, after the bid's emails (account, vendors) are loaded.
  const handledRequest = useRef<number | null>(null);
  useEffect(() => {
    if (!composeRequest || !data || readOnly || handledRequest.current === composeRequest.nonce) return;
    handledRequest.current = composeRequest.nonce;
    setError(null);
    setCompose({
      bidId,
      title: composeRequest.name ? `Email ${composeRequest.name}` : "New email",
      vendors: data.vendors,
      initial: {
        to: [composeRequest.to],
        subject: data.bid.solicitation_number ? `${data.bid.solicitation_number}: ` : "",
      },
    });
  }, [bidId, composeRequest, data, readOnly]);

  const account = data?.account ?? null;
  const counterparts = useMemo(() => {
    const all = new Set<string>();
    data?.threads.forEach((t) => t.counterpart_emails.forEach((a) => all.add(a)));
    return Array.from(all);
  }, [data]);

  async function syncNow() {
    setSyncing(true);
    setNotice(null);
    setError(null);
    const { ok, data: body } = await requestJson<{ summary: { stored: number; unlinked: number; more_pending?: boolean } }>("/api/backend/gmail/sync", { method: "POST" });
    setSyncing(false);
    if (!ok) { setError(body.error || "Sync failed."); await load(); return; }
    setNotice(`Sync complete: ${body.summary.stored} new bid email${body.summary.stored === 1 ? "" : "s"}${body.summary.unlinked ? `, ${body.summary.unlinked} need a bid chosen` : ""}.${body.summary.more_pending ? " More mail is waiting; press Sync now again." : ""}`);
    await load();
  }

  async function patchThread(threadId: number, payload: Record<string, unknown>) {
    setError(null);
    if (typeof payload.manual_override === "boolean") {
      // Show the tick at once; the reload below replaces it with the saved state (or reverts it on error).
      const manual = payload.manual_override;
      setData((current) => current && {
        ...current,
        threads: current.threads.map((t) => (t.id === threadId ? { ...t, manual_override: manual } : t)),
      });
    }
    const { ok, data: body } = await requestJson(`/api/backend/emails/threads/${threadId}`, { method: "PATCH", body: JSON.stringify(payload) });
    if (!ok) { setError(body.error || "Could not update the conversation."); await load(); return; }
    await load();
  }

  async function discard(message: EmailMessageItem) {
    const { ok, data: body } = await requestJson(`/api/backend/emails/${message.id}/discard`, { method: "POST" });
    if (!ok) setError(body.error || "Could not discard the message.");
    await load();
  }

  function startNew() {
    setError(null);
    setCompose({
      bidId,
      title: "New email",
      vendors: data?.vendors,
      initial: {
        to: data?.bid.contact_email ? [data.bid.contact_email] : [],
        subject: data?.bid.solicitation_number ? `${data.bid.solicitation_number}: ` : "",
      },
    });
  }

  function startReply(thread: EmailThreadItem) {
    setError(null);
    setCompose({
      bidId,
      replyToThreadId: thread.id,
      title: "Reply",
      vendors: data?.vendors,
      initial: { to: thread.counterpart_emails, subject: replySubject(thread.subject) },
    });
  }

  function startEdit(message: EmailMessageItem) {
    setError(null);
    setCompose({
      bidId,
      editMessageId: message.id,
      replyToThreadId: message.reply_to_thread_id,
      title: message.send_status === "held" ? "Edit held message" : "Edit and resend",
      vendors: data?.vendors,
      initial: { to: message.to, cc: message.cc, subject: message.subject || "", body_text: message.body_text || "" },
    });
  }

  function onDone(outcome: { kind: "sent" | "held" | "failed"; message: EmailMessageItem }) {
    if (outcome.kind === "sent") { setCompose(null); setNotice("Email sent. Gmail accepted it; delivery to the vendor's inbox is not confirmed."); }
    if (outcome.kind === "held") { setCompose(null); setNotice("The email has high spam risk and is held for admin review. You can edit it from the list below."); }
    if (outcome.kind === "failed") { setCompose(null); setError(outcome.message.send_error || "The email was not sent."); }
    load();
  }

  if (!data) return <p className="text-sm text-slate-600">{error || "Loading emails…"}</p>;
  const ownId = data.current_user_id;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {account?.connected ? (
            <p>Your mailbox: <strong>{account.gmail_address}</strong> · last synced {formatDateTime(account.last_synced_at)}</p>
          ) : account?.status === "expired" ? (
            <p role="alert" className="font-medium text-amber-800">Gmail authorization expired. <Link href="/settings" className="underline">Reconnect Gmail</Link> to send and sync.</p>
          ) : (
            <p className="text-slate-600"><Link href="/settings" className="font-medium text-primary underline">Connect Gmail</Link> to send and sync bid emails.</p>
          )}
        </div>
        <div className="flex gap-2">
          {account?.connected && (
            <Button variant="outline" size="sm" onClick={syncNow} disabled={syncing}>
              <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} aria-hidden />Sync now
            </Button>
          )}
          {!readOnly && <Button size="sm" onClick={startNew}><Mail className="mr-2 h-4 w-4" aria-hidden />New email</Button>}
        </div>
      </div>

      {readOnly && <p className="text-sm text-slate-600">Only this bid&apos;s current owner or an admin can send email for it. You can still read its conversations.</p>}
      {notice && <div role="status" className="rounded border bg-slate-50 p-3 text-sm">{notice}</div>}
      {error && <div role="alert" className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

      {data.outbox.length > 0 && (
        <section aria-label="Unsent emails" className="space-y-2">
          <h3 className="text-sm font-semibold">Not sent yet</h3>
          {data.outbox.map((message) => (
            <div key={message.id} className="rounded border p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{message.subject || "(no subject)"}</p>
                <StatusBadge message={message} />
              </div>
              <p className="text-xs text-slate-600">To {message.to.join(", ")} · by {message.sent_by_name} · {formatDateTime(message.created_at)}</p>
              {message.send_error && <p className="mt-1 text-sm text-red-700">{message.send_error}</p>}
              {message.send_status === "sending" && <p className="mt-1 text-sm text-amber-800">Sending was interrupted, so it is not known whether Gmail sent it. Check your Gmail Sent folder; discard this entry if it went out, or write the message again if it did not.</p>}
              {message.send_status === "held" && <p className="mt-1 text-sm text-amber-800">Waiting for an admin to review. Edit it to lower the spam risk, or ask an admin to release it.</p>}
              {message.sent_by_user_id === ownId && !readOnly && (
                <div className="mt-2 flex gap-2">
                  {message.send_status !== "sending" && <Button size="sm" variant="outline" onClick={() => startEdit(message)}>{message.send_status === "failed" ? "Edit and retry" : "Edit"}</Button>}
                  <Button size="sm" variant="ghost" onClick={() => discard(message)}>Discard</Button>
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {suggested.length > 0 && (
        <section aria-label="Possible matches" className="space-y-2 rounded border border-dashed p-3">
          <h3 className="text-sm font-semibold">Possible matches for this bid</h3>
          <p className="text-xs text-slate-600">These conversations mention more than one bid. Link one to this bid if it belongs here.</p>
          {suggested.map((thread) => (
            <div key={thread.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>{thread.subject || "(no subject)"} · {thread.counterpart_emails.join(", ")}</span>
              <Button size="sm" variant="outline" onClick={() => patchThread(thread.id, { bid_id: bidId })}>
                <Link2 className="mr-2 h-4 w-4" aria-hidden />Link to this bid
              </Button>
            </div>
          ))}
        </section>
      )}

      {data.threads.length === 0 ? (
        <p className="text-sm text-slate-600">No emails for this bid yet.{counterparts.length === 0 && " Send one, or sync Gmail to pull in vendor replies that mention the solicitation number."}</p>
      ) : (
        <ul className="space-y-3">
          {data.threads.map((thread) => {
            const expanded = openThread === thread.id;
            // Header status = the latest message we sent, so a bounce stays visible after the
            // mailer-daemon notice (or a vendor reply) becomes the newest message.
            const lastSent = [...thread.messages].reverse().find((m) => m.direction === "outbound" && m.send_status);
            return (
              <li key={thread.id} className="rounded border">
                <button type="button" className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left" aria-expanded={expanded}
                  onClick={() => setOpenThread(expanded ? null : thread.id)}>
                  <span>
                    <span className="block font-medium">{thread.subject || "(no subject)"}</span>
                    <span className="block text-xs text-slate-600">
                      {thread.counterpart_emails.join(", ") || "—"} · {thread.messages.length} message{thread.messages.length === 1 ? "" : "s"} · {formatDateTime(thread.last_message_at)}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    {(thread.vendors || []).map((vendor) => (
                      <span key={vendor.id} className="rounded-full bg-sky-100 px-2 py-0.5 font-semibold text-sky-900">
                        Vendor: {vendorName(vendor)}{vendor.automation_paused && vendor.negotiation_open ? " · automation paused" : ""}
                      </span>
                    ))}
                    {thread.manual_override && <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-semibold text-indigo-800">Handled manually</span>}
                    {lastSent && <StatusBadge message={lastSent} />}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700">{LINK_SOURCE_LABELS[thread.link_source]}</span>
                  </span>
                </button>
                {expanded && (
                  <div className="space-y-3 border-t p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                      <span>Mailbox: {thread.mailbox} ({thread.mailbox_owner_name})</span>
                      <label className="flex items-center gap-2 text-sm text-slate-800">
                        <input type="checkbox" checked={thread.manual_override}
                          onChange={(e) => patchThread(thread.id, { manual_override: e.target.checked })} />
                        I am handling this conversation manually
                      </label>
                    </div>
                    {thread.manual_override && thread.manual_override_by_name && (
                      <p className="text-xs text-indigo-800">Marked as handled manually by {thread.manual_override_by_name} on {formatDateTime(thread.manual_override_at)}.</p>
                    )}
                    {(thread.vendors || []).filter((vendor) => vendor.negotiation_open).map((vendor) => (
                      <p key={vendor.id} className="text-xs text-slate-700">
                        {thread.manual_override
                          ? `Automated negotiation with ${vendorName(vendor)} is paused while this is ticked. Untick it to let the automation continue.`
                          : `Ticking this pauses the automated negotiation with ${vendorName(vendor)} until you untick it.`}
                      </p>
                    ))}
                    <ol className="space-y-3">
                      {thread.messages.map((message) => (
                        <li key={message.id} className={`rounded border p-3 ${message.direction === "outbound" ? "bg-slate-50" : "bg-white"}`}>
                          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                            <span className="flex items-center gap-1">
                              {message.direction === "outbound" ? <ArrowUpRight className="h-3.5 w-3.5" aria-label="Sent" /> : <ArrowDownLeft className="h-3.5 w-3.5" aria-label="Received" />}
                              <strong className="text-slate-800">{message.from}</strong> → {message.to.join(", ")}{message.cc.length ? ` (cc ${message.cc.join(", ")})` : ""}
                            </span>
                            <span className="flex items-center gap-2">{formatDateTime(message.sent_at)}<StatusBadge message={message} /></span>
                          </div>
                          {message.send_status === "bounced" && message.send_error && <p className="mt-1 text-sm text-red-700">{message.send_error}</p>}
                          {message.reviewed_by_name && <p className="mt-1 text-xs text-slate-600">Released after review by {message.reviewed_by_name}</p>}
                          <div className="mt-2"><MessageBody message={message} /></div>
                        </li>
                      ))}
                    </ol>
                    {!readOnly && <Button size="sm" variant="outline" onClick={() => startReply(thread)}><Reply className="mr-2 h-4 w-4" aria-hidden />Reply</Button>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ComposeEmailDialog open={compose !== null} onOpenChange={(open) => { if (!open) setCompose(null); }} target={compose} account={account} onDone={onDone} />
    </div>
  );
}
