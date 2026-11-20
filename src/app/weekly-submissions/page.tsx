"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { PageBand, PageMain, ReportTabs } from "@/components/design/PageFrame";
import { formatMoney } from "@/lib/pipeline";
import { dateOnly, easternTodayUtc, formatUtcDateRange } from "@/lib/eastern-date";

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

  const totals = data?.company_totals;
  const selected = weeks.find((week) => week.value === weekStart);

  return <>
    <PageBand eyebrow="REPORTS" title="Weekly submissions" lead="Monday–Sunday in Eastern Time, using actual submitted prices" />
    <ReportTabs current="/weekly-submissions" />
    <PageMain>
    {error && <div role="alert" className="cf-banner cf-banner-bad">{error}</div>}
    <section aria-label="Week totals" className="cf-grid-kpi">
      <div className="cf-card cf-kpi cf-kpi-hero"><div className="cf-lbl" style={{ color: "#0E7490" }}>Submitted bids</div><div className="cf-kpi-v" style={{ font: "500 34px/1 var(--cf-display)" }}>{totals ? totals.submitted_count : "—"}</div></div>
      <div className="cf-card cf-kpi"><div className="cf-lbl">Submitted price</div><div className="cf-kpi-v" style={{ font: "500 26px/1.1 var(--cf-mono)" }}>{formatMoney(totals?.total_submitted_price)}</div></div>
      <div className="cf-card cf-kpi"><div className="cf-lbl">Gross profit</div><div className="cf-kpi-v" style={{ font: "500 26px/1.1 var(--cf-mono)" }}>{formatMoney(totals?.total_gross_profit)}</div></div>
    </section>
    <section id="weekly" className="cf-card" aria-labelledby="wk-h" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "20px 24px 14px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <h2 id="wk-h" className="cf-h2">Weekly submissions</h2>
          <p className="cf-sub">{user?.role === "admin" ? "Company agents" : "My submissions"} · {selected?.label || "Selected week"}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <label htmlFor="wk" className="cf-lbl">Week</label>
          <select id="wk" className="cf-select" style={{ width: "auto" }} value={weekStart} onChange={(event) => setWeekStart(event.target.value)}>
            {weeks.map((week) => <option key={week.value} value={week.value}>{week.label}</option>)}
          </select>
        </div>
      </div>
      <div tabIndex={0} style={{ overflowX: "auto" }}>
        <table className="cf-table">
          <thead><tr><th>Agent</th><th className="cf-num">Bids</th><th className="cf-num">Submitted price</th><th className="cf-num">Gross profit</th></tr></thead>
          <tbody>
            {(data?.rows || []).map((row) => (
              <tr key={row.agent_user_id}>
                <td>{row.agent_name}{row.is_active ? "" : " (inactive)"}</td>
                <td className="cf-num">{row.submitted_count}</td>
                <td className="cf-num">{formatMoney(row.total_submitted_price)}</td>
                <td className="cf-num">{formatMoney(row.total_gross_profit)}</td>
              </tr>
            ))}
            {totals ? (
              <tr>
                <td style={{ fontWeight: 600, background: "var(--cf-surface-2)" }}>Total</td>
                <td className="cf-num" style={{ fontWeight: 600, background: "var(--cf-surface-2)" }}>{totals.submitted_count}</td>
                <td className="cf-num" style={{ fontWeight: 600, background: "var(--cf-surface-2)", color: "var(--cf-cyan-text)" }}>{formatMoney(totals.total_submitted_price)}</td>
                <td className="cf-num" style={{ fontWeight: 600, background: "var(--cf-surface-2)" }}>{formatMoney(totals.total_gross_profit)}</td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
    </PageMain>
  </>;
}
