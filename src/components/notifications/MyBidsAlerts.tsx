"use client";

import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
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
    <section className="cf-card" style={{ display: "flex", flexDirection: "column", borderColor: "rgba(251,191,36,.4)", background: "linear-gradient(180deg, rgba(251,191,36,.06), transparent 60%), var(--cf-surface)" }}>
      <div style={{ padding: "18px 24px 6px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 className="cf-h2" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Bell size={20} strokeWidth={1.75} color="#D97706" aria-hidden />
          {unreadCount} alert{unreadCount === 1 ? "" : "s"}
        </h2>
        {unreadCount > 0 ? (
          <button
            type="button"
            style={{ border: 0, background: "none", font: "500 13px var(--cf-body)", color: "#0E7490", cursor: "pointer", minHeight: 32 }}
            onClick={() => {
              markRead("all").catch((err) => console.error("[notifications] mark all failed", err));
            }}
          >
            Mark all read
          </button>
        ) : null}
      </div>
      {error ? <p className="cf-err" style={{ padding: "0 24px 16px" }}>{error}</p> : null}
      {!error && loading && unread.length === 0 ? <p className="cf-meta" style={{ padding: "8px 24px 18px" }}>Loading alerts…</p> : null}
      {!error && !loading && unread.length === 0 ? <p className="cf-meta" style={{ padding: "8px 24px 18px" }}>No new alerts</p> : null}
      {unread.length > 0 ? (
        <ul style={{ listStyle: "none", margin: 0, padding: "0 24px 10px" }}>
          {unread.map((alert) => (
            <li key={alert.id} style={{ borderTop: "1px solid var(--cf-line)" }}>
              <button
                type="button"
                onClick={() => openAlert(alert.id, alert.href)}
                style={{ width: "100%", display: "flex", flexWrap: "wrap", gap: "8px 16px", alignItems: "center", justifyContent: "space-between", padding: "11px 0", border: 0, background: "transparent", textAlign: "left", cursor: "pointer", color: "inherit" }}
              >
                <span style={{ fontSize: 14 }}>
                  <span className="cf-due">{agentAlertLabel(alert.notification_type)}</span>
                  {" · "}
                  <span style={{ fontWeight: 500 }}>{alert.title}</span>
                  {alert.reason ? <span className="cf-meta"> · {alert.reason}</span> : null}
                </span>
                <span className="cf-mono cf-meta">{formatAlertTime(alert.created_at)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
