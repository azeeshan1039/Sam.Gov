"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpamRiskPanel } from "./SpamRiskPanel";
import { formatDateTime, requestJson, type EmailMessageItem } from "@/lib/emails";

/** Admin review queue for high-risk outgoing email (KAN-78). */
export function HeldEmailsCard() {
  const [messages, setMessages] = useState<EmailMessageItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { ok, data } = await requestJson<{ messages: EmailMessageItem[] }>("/api/backend/emails/held");
    if (!ok) { setError(data.error || "Unable to load held emails."); return; }
    setMessages(data.messages);
  }, []);

  useEffect(() => { load(); }, [load]);

  async function act(message: EmailMessageItem, action: "release" | "discard") {
    setBusyId(message.id);
    setError(null);
    setNotice(null);
    // Release sends the version the admin reviewed; the server refuses if the sender changed it since.
    const body = action === "release" ? JSON.stringify({ fingerprint: message.spam_check?.fingerprint || "" }) : undefined;
    const { ok, data } = await requestJson<{ message: EmailMessageItem }>(`/api/backend/emails/${message.id}/${action}`, { method: "POST", body });
    setBusyId(null);
    if (!ok) setError(data.message?.send_error || data.error || `Unable to ${action} the message.`);
    else setNotice(action === "release" ? `Sent from ${message.mailbox}.` : "Message discarded.");
    await load();
  }

  return (
    <Card>
      <CardHeader><CardTitle>Emails held for review</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        {notice && <p role="status" className="text-emerald-700">{notice}</p>}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        {!messages ? <p className="text-slate-600">Loading…</p> : messages.length === 0 ? (
          <p className="text-slate-600">No emails are waiting for review.</p>
        ) : messages.map((message) => (
          <div key={message.id} className="space-y-2 rounded border p-3">
            <div>
              <p className="font-medium">{message.subject || "(no subject)"}</p>
              <p className="text-xs text-slate-600">
                From {message.sent_by_name} ({message.mailbox}) to {message.to.join(", ")} · {formatDateTime(message.created_at)}
                {message.bid && <> · <Link className="underline" href={`/bids/${message.bid.id}`}>{message.bid.solicitation_number || message.bid.title}</Link></>}
              </p>
            </div>
            <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded bg-slate-50 p-2 font-sans">{message.body_text}</pre>
            {message.spam_check && <SpamRiskPanel result={message.spam_check} />}
            <div className="flex gap-2">
              <Button size="sm" onClick={() => act(message, "release")} disabled={busyId !== null}>Approve and send</Button>
              <Button size="sm" variant="outline" onClick={() => act(message, "discard")} disabled={busyId !== null}>Discard</Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
