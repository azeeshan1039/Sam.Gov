"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  PORTALS,
  PORTAL_COLORS,
  displayName,
  initials,
  portalCount,
  type EmployeeStatsRow,
  type PortalName,
  type StatsPayload,
} from "@/lib/stats";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const PORTAL_TEXT: Record<PortalName, string> = {
  "SAM.GOV": "text-blue-600",
  SEPTA: "text-green-600",
  Unison: "text-amber-600",
  Nassau: "text-violet-600",
};

export function PortalBreakdownTab({
  stats,
  loading,
}: {
  stats: StatsPayload | null;
  loading: boolean;
}) {
  const [query, setQuery] = useState("");

  const rows = useMemo(() => {
    return (stats?.employees || []).filter((row) =>
      row.name.toLowerCase().includes(query.trim().toLowerCase())
    );
  }, [stats, query]);

  if (loading || !stats) {
    return <Skeleton className="h-96 w-full" />;
  }

  const total = stats.bid_by_portal.total;
  const slices = PORTALS.map((portal) => {
    const found = stats.bid_by_portal.portals.find((p) => p.name === portal);
    const count = found?.count ?? 0;
    return {
      name: portal,
      count,
      pct: total > 0 ? Math.round((count / total) * 100) : 0,
      color: PORTAL_COLORS[portal],
    };
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Bid Distribution by Portal</h2>
          <p className="mt-1 text-sm text-slate-500">
            {total.toLocaleString()} submitted bids this month
          </p>
          <div className="mt-6 space-y-3">
            {slices.map((slice) => (
              <div key={slice.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2 font-medium text-slate-700">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: slice.color }}
                    />
                    {slice.name}
                  </span>
                  <span className="tabular-nums text-slate-600">
                    {slice.count} ({slice.pct}%)
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full"
                    style={{ width: `${slice.pct}%`, backgroundColor: slice.color }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          {slices.map((slice) => (
            <div
              key={slice.name}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                {slice.name}
              </p>
              <p className="mt-2 text-2xl font-bold text-slate-900">{slice.count}</p>
              <p className="mt-1 text-xs text-slate-400">{slice.pct}% of submissions</p>
            </div>
          ))}
        </div>
      </div>

      <div className="relative w-full max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search employee name..."
          className="pl-9"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80">
              <TableHead>Employee</TableHead>
              {PORTALS.map((portal) => (
                <TableHead key={portal}>
                  <span className="inline-flex items-center gap-1.5">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: PORTAL_COLORS[portal] }}
                    />
                    {portal}
                  </span>
                </TableHead>
              ))}
              <TableHead>Total</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-slate-500">
                  {query ? "No employees match that name." : "No team members yet."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row: EmployeeStatsRow) => (
                <TableRow key={row.user_id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-white">
                        {initials(row.name)}
                      </span>
                      <span className="font-medium">{displayName(row.name)}</span>
                    </div>
                  </TableCell>
                  {PORTALS.map((portal) => (
                    <TableCell
                      key={portal}
                      className={cn("tabular-nums font-medium", PORTAL_TEXT[portal])}
                    >
                      {portalCount(row, portal)}
                    </TableCell>
                  ))}
                  <TableCell className="tabular-nums font-semibold">{row.month_total}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
