"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import type { AuthUser } from "@/lib/auth";
import {
  fetchAgentAlerts,
  markAgentAlertsRead,
  type AgentAlert,
} from "@/lib/agent-alerts";

interface AgentAlertsContextValue {
  alerts: AgentAlert[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  markRead: (ids: number[] | "all") => Promise<void>;
}

const AgentAlertsContext = createContext<AgentAlertsContextValue | null>(null);

export function AgentAlertsProvider({
  user,
  children,
}: {
  user: AuthUser | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const userId = user?.id;
  const companyId = user?.company_id;
  const [alerts, setAlerts] = useState<AgentAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const visitKey = pathname === "/my-bids" ? "my-bids" : "app";

  const refresh = useCallback(async () => {
    if (!userId || !companyId) return;
    setLoading(true);
    try {
      const data = await fetchAgentAlerts({ id: userId, company_id: companyId });
      setAlerts(data.notifications);
      setUnreadCount(data.unread_count);
      setError(null);
    } catch (err) {
      console.error("[notifications] load failed", err);
      setError(err instanceof Error ? err.message : "Failed to load alerts");
    } finally {
      setLoading(false);
    }
  }, [userId, companyId]);

  useEffect(() => {
    if (!userId || !companyId) {
      setAlerts([]);
      setUnreadCount(0);
      setError(null);
      return;
    }
    refresh();
  }, [userId, companyId, visitKey, refresh]);

  const markRead = useCallback(
    async (ids: number[] | "all") => {
      if (!userId || !companyId) return;
      await markAgentAlertsRead({ id: userId, company_id: companyId }, ids);
      await refresh();
    },
    [userId, companyId, refresh]
  );

  const value = useMemo(
    () => ({ alerts, unreadCount, loading, error, refresh, markRead }),
    [alerts, unreadCount, loading, error, refresh, markRead]
  );

  return <AgentAlertsContext.Provider value={value}>{children}</AgentAlertsContext.Provider>;
}

export function useAgentAlerts() {
  const value = useContext(AgentAlertsContext);
  if (!value) {
    throw new Error("useAgentAlerts must be used inside AgentAlertsProvider");
  }
  return value;
}
