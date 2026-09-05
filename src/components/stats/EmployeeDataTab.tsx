"use client";

import { useMemo, useState } from "react";
import { Pencil, Search } from "lucide-react";
import {
  PORTALS,
  PORTAL_COLORS,
  displayName,
  formatMoney,
  initials,
  portalCount,
  type ColumnGroup,
  type EmployeeStatsRow,
  type PortalName,
  type StatsPayload,
} from "@/lib/stats";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

const GROUPS: { id: ColumnGroup; label: string }[] = [
  { id: "all", label: "All Columns" },
  { id: "weekly", label: "Weekly Submissions (W1–W5)" },
  { id: "historical", label: "Historical & Goals" },
  { id: "portals", label: "Portals (SAM, SEPTA, Unison, Nassau)" },
  { id: "values", label: "Bid Values & Thresholds" },
];

const PORTAL_TEXT: Record<PortalName, string> = {
  "SAM.GOV": "text-blue-600",
  SEPTA: "text-green-600",
  Unison: "text-amber-600",
  Nassau: "text-violet-600",
};

function show(group: ColumnGroup, set: ColumnGroup) {
  return group === "all" || group === set;
}

function EmployeeCell({ row }: { row: EmployeeStatsRow }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-[11px] font-semibold text-white">
        {initials(row.name)}
      </span>
      <span className="font-medium text-slate-900">{displayName(row.name)}</span>
    </div>
  );
}

export function EmployeeDataTab({
  stats,
  loading,
  onEditGoal,
}: {
  stats: StatsPayload | null;
  loading: boolean;
  onEditGoal: (row: EmployeeStatsRow) => void;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<ColumnGroup>("all");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const rows = useMemo(() => {
    const list = (stats?.employees || []).filter((row) =>
      row.name.toLowerCase().includes(query.trim().toLowerCase())
    );
    return [...list].sort((a, b) =>
      sortDir === "desc" ? b.month_total - a.month_total : a.month_total - b.month_total
    );
  }, [stats, query, sortDir]);

  if (loading || !stats) {
    return <Skeleton className="h-96 w-full" />;
  }

  const weekCount = stats.week_labels.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employee name..."
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {GROUPS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setGroup(item.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                group === item.id
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50/80">
              <TableHead className="sticky left-0 z-10 min-w-[160px] bg-slate-50">Employee</TableHead>
              {show(group, "weekly") &&
                Array.from({ length: weekCount }).map((_, i) => (
                  <TableHead key={`w${i}`} className="whitespace-nowrap text-center">
                    W{i + 1} (SUB/POT)
                  </TableHead>
                ))}
              {show(group, "historical") && (
                <>
                  <TableHead>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 uppercase"
                      onClick={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))}
                    >
                      {stats.month_label} {sortDir === "desc" ? "▾" : "▴"}
                    </button>
                  </TableHead>
                  <TableHead className="whitespace-nowrap">Monthly Goal</TableHead>
                  <TableHead>{stats.prev_month_label}</TableHead>
                  <TableHead>{stats.prev2_month_label}</TableHead>
                </>
              )}
              {show(group, "portals") &&
                PORTALS.map((portal) => (
                  <TableHead key={portal} className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: PORTAL_COLORS[portal] }}
                      />
                      {portal}
                    </span>
                  </TableHead>
                ))}
              {show(group, "values") && (
                <>
                  <TableHead className="whitespace-nowrap">&lt;= 50K</TableHead>
                  <TableHead className="whitespace-nowrap">&gt;= 50K</TableHead>
                  <TableHead className="whitespace-nowrap">&gt;= 100K</TableHead>
                  <TableHead className="whitespace-nowrap">Avg Weekly Size</TableHead>
                  <TableHead className="whitespace-nowrap">Smallest Bid</TableHead>
                  <TableHead className="whitespace-nowrap">Biggest Bid</TableHead>
                </>
              )}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={20} className="py-8 text-center text-sm text-slate-500">
                  {query ? "No employees match that name." : "No team members yet."}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const metGoal = row.month_total >= row.monthly_goal && row.monthly_goal > 0;
                return (
                  <TableRow key={row.user_id} className="hover:bg-slate-50/80">
                    <TableCell className="sticky left-0 bg-white">
                      <EmployeeCell row={row} />
                    </TableCell>
                    {show(group, "weekly") &&
                      Array.from({ length: weekCount }).map((_, i) => {
                        const cell = row.weeks[i] || { submitted: 0, potential: 0 };
                        return (
                          <TableCell key={`${row.user_id}-w${i}`} className="text-center tabular-nums">
                            {cell.submitted} / {cell.potential}
                          </TableCell>
                        );
                      })}
                    {show(group, "historical") && (
                      <>
                        <TableCell>
                          {metGoal ? (
                            <span className="inline-flex min-w-[2rem] items-center justify-center rounded-full bg-emerald-100 px-2 py-0.5 text-sm font-semibold text-emerald-800">
                              {row.month_total}
                            </span>
                          ) : (
                            <span className="tabular-nums">{row.month_total}</span>
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">{row.monthly_goal}</TableCell>
                        <TableCell className="tabular-nums">{row.prev_month}</TableCell>
                        <TableCell className="tabular-nums">{row.prev2_month}</TableCell>
                      </>
                    )}
                    {show(group, "portals") &&
                      PORTALS.map((portal) => (
                        <TableCell
                          key={`${row.user_id}-${portal}`}
                          className={cn("tabular-nums font-medium", PORTAL_TEXT[portal])}
                        >
                          {portalCount(row, portal)}
                        </TableCell>
                      ))}
                    {show(group, "values") && (
                      <>
                        <TableCell className="tabular-nums">{row.lte_50k}</TableCell>
                        <TableCell className="tabular-nums font-medium text-blue-600">
                          {row.gte_50k}
                        </TableCell>
                        <TableCell className="tabular-nums font-medium text-violet-600">
                          {row.gte_100k}
                        </TableCell>
                        <TableCell className="tabular-nums">{formatMoney(row.avg_weekly)}</TableCell>
                        <TableCell className="tabular-nums">{formatMoney(row.smallest)}</TableCell>
                        <TableCell className="tabular-nums">{formatMoney(row.biggest)}</TableCell>
                      </>
                    )}
                    <TableCell className="text-right">
                      <button
                        type="button"
                        title="Edit monthly goal"
                        onClick={() => onEditGoal(row)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-blue-600 hover:bg-blue-50"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
