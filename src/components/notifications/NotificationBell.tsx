"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { agentAlertLabel, formatAlertTime, type AgentAlert } from "@/lib/agent-alerts";
import { useAgentAlerts } from "@/components/notifications/AgentAlertsProvider";

export default function NotificationBell() {
  const router = useRouter();
  const { alerts, unreadCount, loading, error, refresh, markRead } = useAgentAlerts();
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    refresh();
    const onPointerDown = (event: MouseEvent) => {
      if (!panelRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, refresh]);

  const openAlert = async (alert: AgentAlert) => {
    setOpen(false);
    if (!alert.is_read) {
      try {
        await markRead([alert.id]);
      } catch (err) {
        console.error("[notifications] mark read failed", err);
      }
    }
    router.push(alert.href || "/my-bids");
  };

  const countLabel = unreadCount > 9 ? "9+" : String(unreadCount);

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        aria-label={unreadCount ? `Alerts, ${unreadCount} unread` : "Alerts"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="relative flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm hover:bg-slate-50"
      >
        <Bell className="h-4 w-4" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {countLabel}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <p className="text-sm font-semibold text-slate-900">Alerts</p>
            {unreadCount > 0 && (
              <button
                type="button"
                className="text-xs font-medium text-slate-600 hover:text-slate-900"
                onClick={() => {
                  markRead("all").catch((err) => console.error("[notifications] mark all failed", err));
                }}
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {error && <p className="px-3 py-3 text-sm text-red-600">{error}</p>}
            {!error && loading && alerts.length === 0 && (
              <p className="px-3 py-3 text-sm text-slate-500">Loading alerts…</p>
            )}
            {!error && !loading && alerts.length === 0 && (
              <p className="px-3 py-3 text-sm text-slate-500">No alerts.</p>
            )}
            {alerts.map((alert) => (
              <button
                key={alert.id}
                type="button"
                onClick={() => openAlert(alert)}
                className={`block w-full border-b border-slate-100 px-3 py-3 text-left last:border-b-0 hover:bg-slate-50 ${
                  alert.is_read ? "bg-white" : "bg-amber-50"
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {agentAlertLabel(alert.notification_type)}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">{alert.title}</p>
                <p className="mt-0.5 text-sm text-slate-600">{alert.reason}</p>
                <p className="mt-1 text-xs text-slate-400">{formatAlertTime(alert.created_at)}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
