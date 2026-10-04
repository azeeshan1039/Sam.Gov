"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { formatMoney } from "@/lib/pipeline";
import { dateOnly, easternTodayUtc, formatUtcDateRange } from "@/lib/eastern-date";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function WeeklySubmissionsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const weeks = useMemo(() => {
    const current = easternTodayUtc();
    current.setUTCDate(current.getUTCDate() - ((current.getUTCDay() + 6) % 7));
    return Array.from({ length: 13 }, (_, index) => {
      const start = new Date(current); start.setUTCDate(start.getUTCDate() - index * 7);
      const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
      return { value: dateOnly(start), label: formatUtcDateRange(start, end) };
    });
  }, []);
  const [weekStart, setWeekStart] = useState(weeks[0].value);
  const [data, setData] = useState<{ rows: Array<{ agent_user_id: number; agent_name: string; is_active: boolean; submitted_count: number; total_submitted_price: number; total_gross_profit: number }>; company_totals: { submitted_count: number; total_submitted_price: number; total_gross_profit: number } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { const current = getStoredUser(); if (!current) router.replace("/register"); else setUser(current); }, [router]);
  const load = useCallback(async () => {
    setError(null);
    try {
      const response = await fetch(`/api/backend/pipeline/weekly-submissions?week_start=${weekStart}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to load weekly submissions.");
      setData(body);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load weekly submissions."); }
  }, [weekStart]);
  useEffect(() => { if (user) load(); }, [load, user]);

  return <div className="space-y-6 p-6 lg:p-8">
    <div><h1 className="text-2xl font-bold">Weekly Submissions</h1><p className="text-muted-foreground">Monday–Sunday reporting in Eastern Time using actual submitted prices.</p></div>
    <label className="grid max-w-sm gap-1 text-sm">Week<select className="h-10 rounded-md border px-3" value={weekStart} onChange={(e) => setWeekStart(e.target.value)}>{weeks.map((week) => <option key={week.value} value={week.value}>{week.label}</option>)}</select></label>
    {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
    <div className="grid gap-4 sm:grid-cols-3"><Card><CardHeader><CardTitle className="text-sm">Submitted count</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{data?.company_totals.submitted_count ?? "—"}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Submitted price</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{formatMoney(data?.company_totals.total_submitted_price)}</CardContent></Card><Card><CardHeader><CardTitle className="text-sm">Gross profit</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{formatMoney(data?.company_totals.total_gross_profit)}</CardContent></Card></div>
    <Card><CardHeader><CardTitle>{user?.role === "admin" ? "Company agents" : "My submissions"}</CardTitle></CardHeader><CardContent><Table><TableHeader><TableRow><TableHead>Agent</TableHead><TableHead>Submitted</TableHead><TableHead>Submitted price</TableHead><TableHead>Gross profit</TableHead></TableRow></TableHeader><TableBody>{(data?.rows || []).map((row) => <TableRow key={row.agent_user_id}><TableCell>{row.agent_name}{row.is_active ? "" : " (inactive)"}</TableCell><TableCell>{row.submitted_count}</TableCell><TableCell>{formatMoney(row.total_submitted_price)}</TableCell><TableCell>{formatMoney(row.total_gross_profit)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
  </div>;
}
