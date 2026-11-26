"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { PageBand, PageMain, ReportTabs } from "@/components/design/PageFrame";
import { formatMoney, type PipelineItem } from "@/lib/pipeline";
import { PipelineTable } from "@/components/pipeline/PipelineTable";
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
const PRESETS: { kind: ReportingPreset; label: string }[] = [
  { kind: "today", label: "Today" },
  { kind: "week", label: "This week" },
  { kind: "month", label: "This month" },
];

function rangeStamp(from: string, to: string) {
  const stamp = (iso: string) => {
    const [year, month, day] = iso.split("-").map(Number);
    if (!year || !month || !day) return "";
    return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  };
  const start = stamp(from);
  const end = stamp(to);
  if (!start || !end) return "Reports";
  const sameYear = from.slice(0, 4) === to.slice(0, 4);
  return `Reports · ${sameYear ? start.replace(/, \d{4}$/, "") : start} – ${end}`;
}

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
  const pressed = PRESETS.find((item) => {
    const range = easternReportingRange(item.kind);
    return range.from === dateFrom && range.to === dateTo;
  })?.kind;

  const kpis: Array<[string, string, boolean]> = [
    ["Submitted bids", metrics ? String(metrics.submitted_bid_count) : "—", true],
    ["Submitted price", metrics ? formatMoney(metrics.total_submitted_price) : "—", false],
    ["Gross profit", metrics ? formatMoney(metrics.total_gross_profit) : "—", false],
    ["Biggest bid", metrics ? formatMoney(metrics.biggest_submitted_bid) : "—", false],
  ];

  return (
    <>
      <PageBand
        eyebrow={rangeStamp(dateFrom, dateTo)}
        title="Bid data"
        lead="Submitted prices and bid sizes"
        actions={(
          <form style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }} onSubmit={(event) => { event.preventDefault(); load(); }}>
            {user?.role === "admin" && (
              <div className="cf-flt" style={{ flex: "1 1 200px" }}>
                <label htmlFor="rep-agent">Agent</label>
                <select id="rep-agent" className="cf-select" aria-label="Agent" value={agentId} onChange={(event) => { setAgentId(event.target.value); load(event.target.value); }}>
                  <option value={ALL_AGENTS}>All agents (company)</option>
                  {employees.map((employee) => <option key={employee.user_id} value={employee.user_id}>{employee.name}{employee.is_active ? "" : " (inactive)"}</option>)}
                </select>
              </div>
            )}
            <div className="cf-seg-wrap" role="group" aria-label="Quick range">
              {PRESETS.map((item) => (
                <button key={item.kind} className={`cf-seg${pressed === item.kind ? " cf-seg-on" : ""}`} type="button" aria-pressed={pressed === item.kind} onClick={() => preset(item.kind)}>{item.label}</button>
              ))}
            </div>
            <div className="cf-flt">
              <label htmlFor="rep-from">From</label>
              <input id="rep-from" className="cf-date" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </div>
            <div className="cf-flt">
              <label htmlFor="rep-to">To</label>
              <input id="rep-to" className="cf-date" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
            <button className="cf-btn cf-btn-primary" type="submit" style={{ minHeight: 36 }}>Apply</button>
          </form>
        )}
      />
      <ReportTabs current="/agent-bid-data" />
      <PageMain>
      {error && <div role="alert" className="cf-banner cf-banner-bad">{error}</div>}
      <section aria-label="Totals" className="cf-grid-kpi">
        {kpis.map(([label, value, hero]) => (
          <div key={label} className={`cf-card cf-kpi${hero ? " cf-kpi-hero" : ""}`}>
            <div className="cf-lbl" style={hero ? { color: "#0E7490" } : undefined}>{label}</div>
            <div className="cf-kpi-v" style={hero ? { font: "500 34px/1 var(--cf-display)" } : { font: "500 26px/1.1 var(--cf-mono)" }}>{loading && !metrics ? "—" : value}</div>
          </div>
        ))}
      </section>
      <BidSizeSection report={sizeReport} scope={companyMode ? "company" : user?.role === "admin" ? "employee" : "self"} interval={trendInterval} onIntervalChange={changeInterval} />
      {companyMode ? (
        <p className="cf-sub">Choose an agent to see their individual active, released and completed bids.</p>
      ) : <>
        <section className="cf-card" style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 12 }}>
          <h2 className="cf-h2">Active bids</h2>
          <PipelineTable items={active} variant="person" empty="No active bids." />
        </section>
        <section className="cf-card" style={{ padding: "20px 24px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
          <div>
            <h2 className="cf-h2">Historical / released / reassigned</h2>
            {historical.length === 0 ? <p className="cf-sub">No bids were released or reassigned away from you in this period.</p> : null}
          </div>
          <Link className="cf-link" href={user?.role === "admin" ? "/bid-history" : "/my-bids"}>{user?.role === "admin" ? "Open pipeline" : "See active and completed bids in My bids"}</Link>
          <div style={{ flex: "1 1 100%", minWidth: 0 }}><PipelineTable items={historical} variant="person" empty="No released or reassigned bids." /></div>
        </section>
        <section className="cf-card" aria-labelledby="done-h" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "18px 24px 14px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <div>
              <h2 id="done-h" className="cf-h2">Completed bids</h2>
              <p className="cf-sub">Submitted bids in this range, with the recorded price and outcome</p>
            </div>
            <span className="cf-mono cf-meta">{completed.length} BIDS</span>
          </div>
          <div style={completed.length === 0 ? { padding: "0 24px 20px" } : undefined}>
            <PipelineTable items={completed} variant="history" empty="No completed bids." />
          </div>
        </section>
      </>}
      </PageMain>
    </>
  );
}
