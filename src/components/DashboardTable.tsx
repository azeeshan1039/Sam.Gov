"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { SamGovOpportunity } from "@/types/sam-gov";
import DashboardChart from "./DashboardChart";
import DashboardChartTrend from "./DashboardChartTrend";
import { AgGridReact } from "ag-grid-react";
import { ColDef } from "ag-grid-community";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-alpine.css";

const columnDefs: ColDef[] = [
  { field: "id", headerName: "Solicitation ID", flex: 1, minWidth: 140 },
  { field: "title", headerName: "Title", flex: 2, minWidth: 200, cellRenderer: ({data}: {data: {noticeId: string; title: string}}) => <Link className="cf-link" href={"/sam-gov/" + encodeURIComponent(data.noticeId)}>{data.title}</Link> },
  { field: "agency", headerName: "Agency", width: 100 },
  { field: "value", headerName: "Est. Value", width: 110 },
  { field: "posted", headerName: "Posted", width: 110 },
  { field: "due", headerName: "Due Date", width: 110 },
];

export default function DashboardTable() {
  const [catalog, setCatalog] = useState<SamGovOpportunity[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/sam-gov", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Unable to load recent opportunities.");
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("Unable to read the catalog.");
        setCatalog(data);
      })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  const { rowData, agencies, weekLabels, weekCounts } = useMemo(() => {
    const byAgency = new Map<string, number>();
    const now = new Date();
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7) - 21);
    const weekLabels = Array.from({length: 4}, (_, i) => new Date(monday.getTime() + i * 604800000).toISOString().slice(0, 10));
    const weekCounts = [0, 0, 0, 0];
    for (const item of catalog) {
      const agency = item.department || "Unspecified";
      byAgency.set(agency, (byAgency.get(agency) || 0) + 1);
      const week = Math.floor((Date.parse(item.postedDate || "") - monday.getTime()) / 604800000);
      if (week >= 0 && week < 4) weekCounts[week]++;
    }
    const rowData = [...catalog].sort((a,b) => (b.postedDate || "").localeCompare(a.postedDate || "")).slice(0, 25).map(i => ({
      id: i.solicitationNumber || i.id, noticeId: i.id, title: i.title, agency: i.department,
      posted: i.postedDate?.slice(0,10), due: i.closingDate?.slice(0,10), value: "—",
    }));
    const agencies = Array.from(byAgency).sort((a,b) => b[1] - a[1]).slice(0,6);
    return { rowData, agencies, weekLabels, weekCounts };
  }, [catalog]);
  const defaultColDef = useMemo<ColDef>(
    () => ({
      sortable: true,
      resizable: true,
      filter: true,
    }),
    []
  );

  if (loading || error || catalog.length === 0) return <p className="cf-meta">{loading ? "Loading catalog…" : error || "No opportunities in the catalog."}</p>;
  return (<>
    <div className="cf-grid2">
      <DashboardChart categories={agencies.map(([name]) => name)} counts={agencies.map(([, count]) => count)} />
      <DashboardChartTrend categories={weekLabels} counts={weekCounts} />
    </div>
    <div className="ag-theme-alpine h-[320px] w-full">
      <AgGridReact
        rowData={rowData}
        columnDefs={columnDefs}
        defaultColDef={defaultColDef}
        domLayout="normal"
        rowHeight={40}
        headerHeight={44}
      />
    </div>
  </>);
}
