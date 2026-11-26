"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { PageBand, PageMain } from "@/components/design/PageFrame";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { etMonthKey, etMonthOptions } from "@/lib/eastern";
import { type EmployeeStatsRow, type StatsPayload } from "@/lib/stats";
import { EmployeeDataTab } from "@/components/stats/EmployeeDataTab";
import { PortalBreakdownTab } from "@/components/stats/PortalBreakdownTab";
import { EditGoalDialog } from "@/components/stats/EditGoalDialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const OverviewTab = dynamic(
  () => import("@/components/stats/OverviewTab").then((mod) => mod.OverviewTab),
  {
    ssr: false,
    loading: () => (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    ),
  }
);

type MainTab = "overview" | "employees" | "portals";

const MAIN_TABS: { id: MainTab; label: string }[] = [
  { id: "overview", label: "Overview" },
  { id: "employees", label: "Employee Data" },
  { id: "portals", label: "Portal Breakdown" },
];

export default function StatsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [monthKey, setMonthKey] = useState(() => etMonthKey());
  const [tab, setTab] = useState<MainTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const [editRow, setEditRow] = useState<EmployeeStatsRow | null>(null);
  const months = useMemo(() => etMonthOptions(), []);

  useEffect(() => {
    const currentUser = getStoredUser();
    if (!currentUser) {
      router.replace("/register");
      return;
    }
    if (currentUser.role !== "admin") {
      router.replace("/my-bids?access=manager");
      return;
    }
    setUser(currentUser);
  }, [router]);

  const fetchStats = useCallback(async () => {
    if (!user) return;
    const [year, month] = monthKey.split("-").map(Number);
    setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        company_id: String(user.company_id),
        requester_user_id: String(user.id),
        year: String(year),
        month: String(month),
      });
      const res = await fetch(`/api/backend/stats?${query.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message = data.error || `Could not load stats (${res.status})`;
        console.error("[stats] Fetch failed", { status: res.status, body: data, year, month });
        throw new Error(message);
      }
      setStats(data as StatsPayload);
    } catch (err) {
      console.error("[stats] Failed to load stats page", err);
      setError(err instanceof Error ? err.message : "Could not load stats");
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [user, monthKey]);

  useEffect(() => {
    if (!user) return;
    fetchStats();
  }, [user, fetchStats]);

  if (!user) {
    return (
      <PageMain>
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </PageMain>
    );
  }

  const periodLabel = stats
    ? `${stats.month_label} ${stats.year}`
    : months.find((m) => m.value === monthKey)?.label || monthKey;

  return (
    <>
      <PageBand
        eyebrow="Reports"
        title="Bid performance and sales"
        lead={periodLabel}
        actions={
          <Select value={monthKey} onValueChange={setMonthKey}>
            <SelectTrigger aria-label="Reporting month" className="cf-select w-44"><SelectValue placeholder="Select month" /></SelectTrigger>
            <SelectContent>
              {months.map((month) => <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />
      <div className="border-b" style={{ borderColor: "var(--cf-line)" }}>
        <nav className="cf-wrap flex flex-wrap gap-x-7" aria-label="Stats views">
          {MAIN_TABS.map((item) => (
            <button key={item.id} type="button" onClick={() => setTab(item.id)}
              className={tab === item.id ? "cf-tab cf-tab-on" : "cf-tab"} aria-pressed={tab === item.id}>
              {item.label}
            </button>
          ))}
        </nav>
      </div>
      <PageMain className="cf-workspace">
      {error && (
        <div role="alert" className="cf-banner cf-banner-bad">
          {error}
        </div>
      )}

      {tab === "overview" && <OverviewTab stats={stats} loading={loading} />}
      {tab === "employees" && (
        <EmployeeDataTab
          stats={stats}
          loading={loading}
          onEditGoal={(row) => setEditRow(row)}
        />
      )}
      {tab === "portals" && <PortalBreakdownTab stats={stats} loading={loading} />}

      <EditGoalDialog
        open={editRow != null}
        onOpenChange={(open) => {
          if (!open) setEditRow(null);
        }}
        user={user}
        memberId={editRow?.user_id ?? null}
        memberName={editRow?.name ?? ""}
        currentGoal={editRow?.monthly_goal ?? 50}
        onSaved={fetchStats}
      />
      </PageMain>
    </>
  );
}
