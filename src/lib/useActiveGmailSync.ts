"use client";

import { useEffect, useRef } from "react";

/** Refresh the agent's mailbox while they are viewing an active Gmail RFQ. */
export function useActiveGmailSync(enabled: boolean, onSynced: () => Promise<unknown>) {
  const callback = useRef(onSynced);
  callback.current = onSynced;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let syncing = false;
    const sync = async () => {
      if (syncing || document.visibilityState !== "visible") return;
      syncing = true;
      try {
        const response = await fetch("/api/backend/gmail/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ automatic: true }),
        });
        if (response.ok && (await response.json()).summary?.stored && active) {
          await callback.current();
        }
      } catch {
        // Manual sync can show provider errors. The next visible refresh can retry.
      } finally {
        syncing = false;
      }
    };
    void sync();
    const timer = window.setInterval(() => void sync(), 65_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [enabled]);
}
