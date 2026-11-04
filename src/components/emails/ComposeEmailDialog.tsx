"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SpamRiskPanel } from "./SpamRiskPanel";
import {
  parseAddressList,
  requestJson,
  type EmailDraft,
  type EmailMessageItem,
  type EmailVendor,
  type GmailAccount,
  type SpamCheckResult,
} from "@/lib/emails";

export interface ComposeTarget {
  bidId: number;
  replyToThreadId?: number | null;
  /** Held or failed message being edited and re-sent. */
  editMessageId?: number | null;
  initial: Partial<EmailDraft>;
  title?: string;
  /** KAN-80 vendors on the bid, offered as one-click recipients. */
  vendors?: EmailVendor[];
}

type SendOutcome = { kind: "sent" | "held" | "failed"; message: EmailMessageItem };

function draftKey(draft: EmailDraft) {
  return JSON.stringify(draft);
}

/**
 * Compose, spam-check and send a bid email from the employee's own Gmail (KAN-77/KAN-78).
 * The server re-runs the check on every send; this dialog never changes what was typed.
 */
export function ComposeEmailDialog({
  open,
  onOpenChange,
  target,
  account,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ComposeTarget | null;
  account: GmailAccount | null;
  onDone: (outcome: SendOutcome) => void;
}) {
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [check, setCheck] = useState<SpamCheckResult | null>(null);
  const [checkedKey, setCheckedKey] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState<"check" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // One id per compose attempt: a retried or double-clicked send is never delivered twice.
  const [requestId, setRequestId] = useState("");

  useEffect(() => {
    if (!open || !target) return;
    setTo((target.initial.to || []).join(", "));
    setCc((target.initial.cc || []).join(", "));
    setSubject(target.initial.subject || "");
    setBody(target.initial.body_text || "");
    setCheck(null);
    setCheckedKey(null);
    setAcknowledged(false);
    setError(null);
    setRequestId(typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  }, [open, target]);

  const draft = useMemo<EmailDraft>(() => ({
    to: parseAddressList(to),
    cc: parseAddressList(cc),
    subject: subject.trim(),
    body_text: body,
  }), [to, cc, subject, body]);
  const stale = Boolean(check && checkedKey !== draftKey(draft));
  const connected = Boolean(account?.connected);

  useEffect(() => { if (stale) setAcknowledged(false); }, [stale]);

  const vendorChoices = (target?.vendors || []).filter((vendor) => !draft.to.includes(vendor.email) && !draft.cc.includes(vendor.email));
  function addRecipient(email: string) {
    setTo((current) => (current.trim() ? `${current.trim().replace(/[,;]\s*$/, "")}, ${email}` : email));
  }

  async function runCheck(): Promise<SpamCheckResult | null> {
    setBusy("check");
    setError(null);
    const { ok, data } = await requestJson<{ spam_check: SpamCheckResult }>("/api/backend/emails/spam-check", {
      method: "POST",
      body: JSON.stringify({ ...draft, reply_to_thread_id: target?.replyToThreadId || null }),
    });
    setBusy(null);
    if (!ok) { setError(data.error || "The spam-risk check could not run."); return null; }
    setCheck(data.spam_check);
    setCheckedKey(draftKey(draft));
    return data.spam_check;
  }

  async function send() {
    if (!target) return;
    if (!draft.to.length) { setError("Add at least one recipient."); return; }
    let current = check;
    if (!current || stale) {
      current = await runCheck();
      if (!current) return;
      // Show the fresh result first whenever it raises anything.
      if (current.level !== "low") return;
    }
    if (current.level !== "low" && !current.will_hold && !acknowledged) {
      setError("Tick the box to confirm you reviewed the warnings.");
      return;
    }
    setBusy("send");
    setError(null);
    const payload = { ...draft, acknowledge_warnings: acknowledged };
    let response;
    if (target.editMessageId) {
      const saved = await requestJson(`/api/backend/emails/${target.editMessageId}`, { method: "PATCH", body: JSON.stringify(draft) });
      if (!saved.ok) { setBusy(null); setError(saved.data.error || "Could not save your changes."); return; }
      response = await requestJson<{ message: EmailMessageItem; spam_check?: SpamCheckResult; requires_acknowledgement?: boolean }>(
        `/api/backend/emails/${target.editMessageId}/send`, { method: "POST", body: JSON.stringify(payload) });
    } else {
      response = await requestJson<{ message: EmailMessageItem; spam_check?: SpamCheckResult; requires_acknowledgement?: boolean }>(
        "/api/backend/emails/send", {
          method: "POST",
          body: JSON.stringify({ ...payload, bid_id: target.bidId, reply_to_thread_id: target.replyToThreadId || null, client_request_id: requestId }),
        });
    }
    setBusy(null);
    const { status, data } = response;
    if (data.spam_check) { setCheck(data.spam_check); setCheckedKey(draftKey(draft)); }
    if (status === 422 && data.requires_acknowledgement) {
      setError(data.error || "Review the warnings and confirm before sending.");
      return;
    }
    if (status === 202 && data.message) { onDone({ kind: "held", message: data.message }); return; }
    if (response.ok && data.message) { onDone({ kind: "sent", message: data.message }); return; }
    if (data.message) { onDone({ kind: "failed", message: data.message }); return; }
    setError(data.error || "The message was not sent.");
  }

  const willHold = Boolean(check && !stale && check.will_hold);
  const needsAck = Boolean(check && !stale && check.level !== "low" && !check.will_hold);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{target?.title || "New email"}</DialogTitle>
          <DialogDescription>
            {connected
              ? <>Sending as <strong>{account?.gmail_address}</strong>. The message goes from your Gmail account and is saved to this bid.</>
              : "Connect your Gmail account before sending email from Contract Finder."}
          </DialogDescription>
        </DialogHeader>

        {!connected ? (
          <div role="alert" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {account?.status === "expired" ? "Your Gmail authorization expired." : "Gmail is not connected."}{" "}
            <Link href="/settings" className="font-semibold underline">Open Settings to {account?.status === "expired" ? "reconnect" : "connect"} Gmail</Link>.
          </div>
        ) : (
          <div className="space-y-3">
            <label className="grid gap-1 text-sm">To
              <Input aria-label="To" value={to} onChange={(e) => setTo(e.target.value)} placeholder="vendor@example.com, second@example.com" />
            </label>
            {vendorChoices.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm" role="group" aria-label="Vendors on this bid">
                <span className="text-slate-600">Vendors on this bid:</span>
                {vendorChoices.map((vendor) => (
                  <Button key={vendor.id} type="button" size="sm" variant="outline" onClick={() => addRecipient(vendor.email)}>
                    Add {vendor.company_name || vendor.email}
                  </Button>
                ))}
              </div>
            )}
            <label className="grid gap-1 text-sm">Cc
              <Input aria-label="Cc" value={cc} onChange={(e) => setCc(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">Subject
              <Input aria-label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </label>
            <label className="grid gap-1 text-sm">Message
              <Textarea aria-label="Message" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
            </label>
            {check && <SpamRiskPanel result={check} stale={stale} />}
            {needsAck && (
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1" checked={acknowledged} onChange={(e) => setAcknowledged(e.target.checked)} />
                I reviewed these warnings and want to send the message as written.
              </label>
            )}
            {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {connected && (
            <>
              <Button variant="secondary" onClick={runCheck} disabled={busy !== null}>
                {busy === "check" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                {check ? "Re-check spam risk" : "Check spam risk"}
              </Button>
              <Button onClick={send} disabled={busy !== null || (needsAck && !acknowledged)}>
                {busy === "send" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden /> : <Send className="mr-2 h-4 w-4" aria-hidden />}
                {willHold ? "Submit for review" : "Send"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
