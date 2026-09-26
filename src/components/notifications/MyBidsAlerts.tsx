"use client";

import { useRouter } from "next/navigation";
import { agentAlertLabel, formatAlertTime } from "@/lib/agent-alerts";
import { useAgentAlerts } from "@/components/notifications/AgentAlertsProvider";

export default function MyBidsAlerts() {
  const router = useRouter();
  const { alerts, unreadCount, loading, error, markRead } = useAgentAlerts();
  const unread = alerts.filter((alert) => !alert.is_read);

  const openAlert = async (id: number, href: string) => {
    try {
      await markRead([id]);
    } catch (err) {
      console.error("[notifications] mark read failed", err);
    }
    router.push(href || "/my-bids");
  };

  return (
    <section className="rounded-lg border bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Alerts</h2>
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
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {!error && loading && unread.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">Loading alerts…</p>
      )}
      {!error && !loading && unread.length === 0 && (
        <p className="mt-3 text-sm text-slate-500">No alerts.</p>
      )}
      {unread.length > 0 && (
        <ul className="mt-3 divide-y divide-slate-100">
          {unread.map((alert) => (
            <li key={alert.id}>
              <button
                type="button"
                onClick={() => openAlert(alert.id, alert.href)}
                className="w-full rounded-md px-2 py-3 text-left hover:bg-amber-50"
              >
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {agentAlertLabel(alert.notification_type)}
                </p>
                <p className="mt-1 text-sm font-medium text-slate-900">{alert.title}</p>
                <p className="mt-0.5 text-sm text-slate-600">{alert.reason}</p>
                <p className="mt-1 text-xs text-slate-400">{formatAlertTime(alert.created_at)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
