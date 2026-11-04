"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, MailWarning, RefreshCw, Unplug } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateTime, requestJson, type GmailAccount, type SyncSummary } from "@/lib/emails";

/** Connect, reconnect, sync and disconnect the employee's own Gmail account (KAN-76). */
export function GmailConnectionCard({ callbackResult, callbackMessage }: { callbackResult?: string | null; callbackMessage?: string | null }) {
  const [account, setAccount] = useState<GmailAccount | null>(null);
  const [busy, setBusy] = useState<"connect" | "sync" | "disconnect" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);

  const load = useCallback(async () => {
    const { ok, data } = await requestJson<{ account: GmailAccount }>("/api/backend/gmail/status");
    if (!ok) { setError(data.error || "Unable to load Gmail status."); return; }
    setAccount(data.account);
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (callbackResult === "connected") setNotice("Gmail connected. Run Sync now to pull in bid emails.");
    if (callbackResult === "error") setError(callbackMessage || "Gmail could not be connected.");
  }, [callbackResult, callbackMessage]);

  async function connect() {
    setBusy("connect");
    setError(null);
    const { ok, data } = await requestJson<{ auth_url: string }>("/api/backend/gmail/connect", { method: "POST" });
    if (!ok || !data.auth_url) { setBusy(null); setError(data.error || "Unable to start the Google sign-in."); return; }
    window.location.assign(data.auth_url);
  }

  async function sync() {
    setBusy("sync");
    setError(null);
    setNotice(null);
    const { ok, data } = await requestJson<{ summary: SyncSummary; account: GmailAccount }>("/api/backend/gmail/sync", { method: "POST" });
    setBusy(null);
    if (data.account) setAccount(data.account);
    if (!ok) { setError(data.error || "Sync failed."); return; }
    const s = data.summary;
    setNotice(`Checked ${s.checked} message${s.checked === 1 ? "" : "s"}: ${s.stored} new bid email${s.stored === 1 ? "" : "s"} saved, ${s.not_bid_related} ignored as not bid-related${s.unlinked ? `, ${s.unlinked} matched more than one bid` : ""}.${s.more_pending ? " More mail is waiting; press Sync now again." : ""}`);
  }

  async function disconnect() {
    setBusy("disconnect");
    setConfirmDisconnect(false);
    const { ok, data } = await requestJson<{ account: GmailAccount }>("/api/backend/gmail/disconnect", { method: "POST" });
    setBusy(null);
    if (!ok) { setError(data.error || "Unable to disconnect Gmail."); return; }
    setAccount(data.account);
    setNotice("Gmail disconnected and Contract Finder's access was revoked. Bid emails already saved stay on their bids.");
  }

  const status = account?.status ?? "not_connected";
  return (
    <Card>
      <CardHeader><CardTitle>Gmail</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        {!account ? <p className="text-slate-600">{error || "Loading…"}</p> : (
          <>
            {status === "connected" && (
              <div className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" aria-hidden />
                <div>
                  <p>Connected as <strong>{account.gmail_address}</strong></p>
                  <p className="text-slate-600">Connected {formatDateTime(account.connected_at)} · last synced {formatDateTime(account.last_synced_at)}</p>
                </div>
              </div>
            )}
            {status === "expired" && (
              <div role="alert" className="flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
                <MailWarning className="mt-0.5 h-4 w-4" aria-hidden />
                <div>
                  <p className="font-semibold">Gmail authorization expired for {account.gmail_address}.</p>
                  <p>{account.last_error || "Reconnect to keep sending and syncing bid emails."}</p>
                </div>
              </div>
            )}
            {(status === "not_connected" || status === "disconnected") && (
              <p className="text-slate-600">
                Connect your Gmail account to send vendor emails from bids and sync their replies. Contract Finder only
                saves mail related to your bids: threads you start here, replies to them, and messages that mention a
                bid&apos;s solicitation number or a contact you already emailed about a bid.
              </p>
            )}
            {account.configured === false && (
              <p role="alert" className="text-amber-800">Gmail connection is not configured on the server yet. Ask an admin to set the Google OAuth settings.</p>
            )}
            {status === "connected" && account.last_error && <p className="text-red-700">{account.last_error}</p>}
            {notice && <p role="status" className="rounded border bg-slate-50 p-3">{notice}</p>}
            {error && error !== account.last_error && <p role="alert" className="text-red-700">{error}</p>}
            <div className="flex flex-wrap gap-2">
              {status === "connected" ? (
                <>
                  <Button onClick={sync} disabled={busy !== null}>
                    <RefreshCw className={`mr-2 h-4 w-4 ${busy === "sync" ? "animate-spin" : ""}`} aria-hidden />Sync now
                  </Button>
                  <Button variant="outline" onClick={() => setConfirmDisconnect(true)} disabled={busy !== null}>
                    <Unplug className="mr-2 h-4 w-4" aria-hidden />Disconnect
                  </Button>
                </>
              ) : (
                <Button onClick={connect} disabled={busy !== null || account.configured === false}>
                  {busy === "connect" && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
                  {status === "expired" ? "Reconnect Gmail" : "Connect Gmail"}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
      <Dialog open={confirmDisconnect} onOpenChange={setConfirmDisconnect}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Gmail?</DialogTitle>
            <DialogDescription>
              Contract Finder stops sending and syncing with {account?.gmail_address} and revokes its access in Google.
              Bid emails already saved stay on their bids. You can reconnect at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDisconnect(false)}>Cancel</Button>
            <Button variant="destructive" onClick={disconnect}>Disconnect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
