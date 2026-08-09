"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { BarChart3 } from "lucide-react";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const PORTALS = ["SAM.GOV", "SEPTA", "Unison", "Nassau"] as const;

interface LeaderboardRow {
  user_id: number;
  name: string;
  wins: number;
  amount: number;
}

interface MonthlyGoal {
  achieved: number;
  monthly: number;
  left: number;
}

interface WeekCount {
  label: string;
  count: number;
}

interface PortalCount {
  name: string;
  count: number;
}

interface EmployeeWeekRow {
  user_id: number;
  name: string;
  weeks: number[];
}

interface TrackerRow {
  user_id: number;
  name: string;
  achieved: number;
  left: number;
  monthly: number;
}

interface PortalEmployeeRow {
  user_id: number;
  name: string;
  [portal: string]: string | number;
}

interface BidStatsRow {
  user_id: number;
  name: string;
  avg_weekly: number;
  smallest: number;
  biggest: number;
}

interface StatsPayload {
  year: number;
  month: number;
  week_labels: string[];
  leaderboard: LeaderboardRow[];
  monthly_goal: MonthlyGoal;
  bid_by_week: { total: number; weeks: WeekCount[] };
  bid_by_portal: { total: number; portals: PortalCount[] };
  by_week: EmployeeWeekRow[];
  tracker: TrackerRow[];
  portal_by_employee: PortalEmployeeRow[];
  bid_stats: BidStatsRow[];
}

function monthOptions(now = new Date()) {
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < 18; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleString("en-US", { month: "long", year: "numeric" });
    options.push({ value, label });
  }
  return options;
}

function formatMoney(value: number | null | undefined) {
  const n = Number(value || 0);
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

export default function StatsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [monthKey, setMonthKey] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsPayload | null>(null);
  const months = useMemo(() => monthOptions(), []);

  useEffect(() => {
    const currentUser = getStoredUser();
    if (!currentUser) {
      router.replace("/register");
      return;
    }
    if (currentUser.role !== "admin") {
      router.replace("/negotiations");
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
      <div className="space-y-6 p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const weekLabels = stats?.week_labels?.length
    ? stats.week_labels
    : ["Week 1", "Week 2", "Week 3", "Week 4"];

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <BarChart3 className="h-6 w-6" />
            Stats
          </h1>
          <p className="mt-1 text-muted-foreground">
            Company bid performance for the selected month.
          </p>
        </div>
        <div className="w-full sm:w-56">
          <Select value={monthKey} onValueChange={setMonthKey}>
            <SelectTrigger>
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Tabs defaultValue="leaderboard" className="space-y-4">
        <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
          <TabsTrigger value="monthly-goal">Monthly Goal</TabsTrigger>
          <TabsTrigger value="bid-by-week">Bid by Week MTD</TabsTrigger>
          <TabsTrigger value="bid-by-portal">Bid by Portal MTD</TabsTrigger>
          <TabsTrigger value="by-week">By Week</TabsTrigger>
          <TabsTrigger value="tracker">Tracker</TabsTrigger>
          <TabsTrigger value="portal-by-employee">Portal by Employee</TabsTrigger>
          <TabsTrigger value="bid-stats">Bid Stats</TabsTrigger>
        </TabsList>

        <TabsContent value="leaderboard">
          <StatsCard title="Leaderboard" description="Top 3 by bids won (accept supplier + submit).">
            <SimpleTable
              loading={loading}
              headers={["Rank", "Name", "Bids won", "Amount"]}
              empty="No won bids this month."
              rows={(stats?.leaderboard || []).map((row, i) => [
                `${i + 1}${i === 0 ? "st" : i === 1 ? "nd" : "rd"}`,
                row.name,
                String(row.wins),
                formatMoney(row.amount),
              ])}
            />
          </StatsCard>
        </TabsContent>

        <TabsContent value="monthly-goal">
          <StatsCard title="Monthly Goal" description="Company submitted-bid count vs goal.">
            <SimpleTable
              loading={loading}
              headers={["Achieved", "Monthly", "Left"]}
              rows={
                stats
                  ? [
                      [
                        String(stats.monthly_goal.achieved),
                        String(stats.monthly_goal.monthly),
                        String(stats.monthly_goal.left),
                      ],
                    ]
                  : []
              }
            />
          </StatsCard>
        </TabsContent>

        <TabsContent value="bid-by-week">
          <StatsCard title="Bid by Week MTD" description="Submitted bids by calendar week.">
            <SimpleTable
              loading={loading}
              headers={["Total", ...weekLabels]}
              rows={
                stats
                  ? [
                      [
                        String(stats.bid_by_week.total),
                        ...weekLabels.map((_, i) => String(stats.bid_by_week.weeks[i]?.count ?? 0)),
                      ],
                    ]
                  : []
              }
            />
          </StatsCard>
        </TabsContent>

        <TabsContent value="bid-by-portal">
          <StatsCard title="Bid by Portal MTD" description="Submitted bids by portal.">
            <SimpleTable
              loading={loading}
              headers={["Total", ...PORTALS]}
              rows={
                stats
                  ? [
                      [
                        String(stats.bid_by_portal.total),
                        ...PORTALS.map((portal) => {
                          const found = stats.bid_by_portal.portals.find((p) => p.name === portal);
                          return String(found?.count ?? 0);
                        }),
                      ],
                    ]
                  : []
              }
            />
          </StatsCard>
        </TabsContent>

        <TabsContent value="by-week">
          <StatsCard title="By Week" description="Submitted bids per employee per calendar week.">
            <SimpleTable
              loading={loading}
              headers={["Employee", ...weekLabels]}
              empty="No team members yet."
              rows={(stats?.by_week || []).map((row) => [
                row.name,
                ...weekLabels.map((_, i) => String(row.weeks[i] ?? 0)),
              ])}
            />
          </StatsCard>
        </TabsContent>

        <TabsContent value="tracker">
          <StatsCard title="Tracker" description="Per-employee progress toward the member monthly goal.">
            <SimpleTable
              loading={loading}
              headers={["Employee", "Achieved", "Left", "Monthly"]}
              empty="No team members yet."
              rows={(stats?.tracker || []).map((row) => [
                row.name,
                String(row.achieved),
                String(row.left),
                String(row.monthly),
              ])}
            />
          </StatsCard>
        </TabsContent>

        <TabsContent value="portal-by-employee">
          <StatsCard title="Portal by Employee (MTD)" description="Submitted bids per employee per portal.">
            <SimpleTable
              loading={loading}
              headers={["Employee", ...PORTALS]}
              empty="No team members yet."
              rows={(stats?.portal_by_employee || []).map((row) => [
                String(row.name),
                ...PORTALS.map((portal) => String(row[portal] ?? 0)),
              ])}
            />
          </StatsCard>
        </TabsContent>

        <TabsContent value="bid-stats">
          <StatsCard title="Bid Stats" description="Submitted bid amounts (vendor final price).">
            <SimpleTable
              loading={loading}
              headers={["Employee", "Average weekly Bid Size", "Smallest Bid", "Biggest Bid"]}
              empty="No team members yet."
              rows={(stats?.bid_stats || []).map((row) => [
                row.name,
                formatMoney(row.avg_weekly),
                formatMoney(row.smallest),
                formatMoney(row.biggest),
              ])}
            />
          </StatsCard>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StatsCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function SimpleTable({
  headers,
  rows,
  loading,
  empty = "No data for this month.",
}: {
  headers: string[];
  rows: string[][];
  loading: boolean;
  empty?: string;
}) {
  if (loading) {
    return <Skeleton className="h-24 w-full" />;
  }

  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {headers.map((header) => (
            <TableHead key={header}>{header}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row, i) => (
          <TableRow key={`${row[0]}-${i}`}>
            {row.map((cell, j) => (
              <TableCell key={`${i}-${j}`} className={j === 0 ? "font-medium" : undefined}>
                {cell}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
