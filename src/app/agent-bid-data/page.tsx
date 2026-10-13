"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { formatMoney, type PipelineItem } from "@/lib/pipeline";
import { PipelineTable } from "@/components/pipeline/PipelineTable";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { easternReportingRange, type ReportingPreset } from "@/lib/eastern-date";
import { BidSizeSection, type SizeReport } from "@/components/bid-size/BidSizeSection";

interface Metrics {
  submitted_bid_count: number;
  total_submitted_price: number;
  total_gross_profit: number;
  biggest_submitted_bid: number;
  size_buckets: Record<string, { count: number; submitted_price: number }>;
}

const ALL_AGENTS = "all";

export default function AgentBidDataPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const linkedAgent = searchParams.get("agent_user_id") || "";
  const [user, setUser] = useState<AuthUser | null>(null);
  const [agentId, setAgentId] = useState("");
  const [employees, setEmployees] = useState<Array<{ user_id: number; name: string; is_active: boolean }>>([]);
  const [active, setActive] = useState<PipelineItem[]>([]);
  const [historical, setHistorical] = useState<PipelineItem[]>([]);
  const [completed, setCompleted] = useState<PipelineItem[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [sizeReport, setSizeReport] = useState<SizeReport | null>(null);
  const [trendInterval, setTrendInterval] = useState<"week" | "month">("month");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Only the latest request may update the page; a slower earlier response must not
  // switch the agent selector back (e.g. picking "All agents" during the first load).
  const latestRequest = useRef(0);

  useEffect(() => {
    const current = getStoredUser();
    if (!current) return router.replace("/register");
    setUser(current);
    if (current.role === "agent") setAgentId(String(current.id));
    else if (linkedAgent) setAgentId(linkedAgent);
  }, [router, linkedAgent]);

  const load = useCallback(async (nextAgent = agentId, from = dateFrom, to = dateTo, nextInterval = trendInterval) => {
    if (!user) return;
    const requestId = ++latestRequest.current;
    setLoading(true); setError(null);
    const query = new URLSearchParams();
    if (nextAgent) query.set("agent_user_id", nextAgent);
    if (from && to) { query.set("date_from", from); query.set("date_to", to); }
    query.set("interval", nextInterval);
    try {
      const response = await fetch(`/api/backend/pipeline/agent-bid-data?${query}`, { cache: "no-store" });
      const data = await response.json();
      if (requestId !== latestRequest.current) return;
      if (!response.ok) throw new Error(data.error || "Unable to load agent bid data.");
      setEmployees(data.employees || []);
      setAgentId(String(data.agent_user_id || nextAgent));
      setDateFrom(data.date_from); setDateTo(data.date_to);
      setActive(data.active || []); setHistorical(data.historical || []); setCompleted(data.completed || []); setMetrics(data.metrics);
      setSizeReport(data.size_report || null);
    } catch (err) { if (requestId === latestRequest.current) setError(err instanceof Error ? err.message : "Unable to load agent bid data."); }
    finally { if (requestId === latestRequest.current) setLoading(false); }
  }, [agentId, dateFrom, dateTo, trendInterval, user]);

  useEffect(() => {
    if (!user) return;
    const nextAgent = user.role === "agent" ? String(user.id) : (linkedAgent || agentId);
    load(nextAgent);
  }, [user, linkedAgent]); // eslint-disable-line react-hooks/exhaustive-deps

  const preset = (kind: ReportingPreset) => {
    const { from, to } = easternReportingRange(kind);
    setDateFrom(from); setDateTo(to); load(agentId, from, to);
  };
  const changeInterval = (next: "week" | "month") => { setTrendInterval(next); load(agentId, dateFrom, dateTo, next); };
  const companyMode = agentId === ALL_AGENTS;

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div><h1 className="text-2xl font-bold">Agent Bid Data</h1><p className="text-muted-foreground">Complete bid history and submitted-price reporting.</p></div>
      <Card><CardContent className="flex flex-wrap items-end gap-3 pt-6">
        {user?.role === "admin" && <label className="grid gap-1 text-sm">Agent<select className="h-10 rounded-md border px-3" value={agentId} onChange={(e) => { setAgentId(e.target.value); load(e.target.value); }}><option value={ALL_AGENTS}>All agents (company)</option>{employees.map((employee) => <option key={employee.user_id} value={employee.user_id}>{employee.name}{employee.is_active ? "" : " (inactive)"}</option>)}</select></label>}
        <div className="flex gap-2"><Button variant="outline" onClick={() => preset("today")}>Today</Button><Button variant="outline" onClick={() => preset("week")}>This week</Button><Button variant="outline" onClick={() => preset("month")}>This month</Button></div>
        <label className="grid gap-1 text-sm">From<Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} /></label>
        <label className="grid gap-1 text-sm">To<Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} /></label>
        <Button onClick={() => load()}>Apply custom range</Button>
      </CardContent></Card>
      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <div className="grid gap-4 md:grid-cols-4">
        {[["Submitted bids", metrics?.submitted_bid_count ?? 0], ["Submitted price", formatMoney(metrics?.total_submitted_price)], ["Gross profit", formatMoney(metrics?.total_gross_profit)], ["Biggest bid", formatMoney(metrics?.biggest_submitted_bid)]].map(([label, value]) => <Card key={String(label)}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{loading ? "—" : value}</CardContent></Card>)}
      </div>
      <BidSizeSection report={sizeReport} companyMode={companyMode} interval={trendInterval} onIntervalChange={changeInterval} />
      {companyMode ? (
        <p className="text-sm text-muted-foreground">Choose an agent to see their individual active, released and completed bids.</p>
      ) : <>
        <Card><CardHeader><CardTitle>Active bids</CardTitle></CardHeader><CardContent><PipelineTable items={active} variant="person" empty="No active bids." /></CardContent></Card>
        <Card><CardHeader><CardTitle>Historical / released / reassigned</CardTitle></CardHeader><CardContent><PipelineTable items={historical} variant="person" empty="No released or reassigned bids." /></CardContent></Card>
        <Card><CardHeader><CardTitle>Completed bids</CardTitle></CardHeader><CardContent><PipelineTable items={completed} variant="history" empty="No completed bids." /></CardContent></Card>
      </>}
    </div>
  );
}
