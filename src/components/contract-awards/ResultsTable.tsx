"use client";

import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CSV_COLUMNS } from "@/services/contract-awards";
import type { ContractAwardRecord } from "@/types/contract-awards";

interface Props {
  rows: ContractAwardRecord[];
  loading: boolean;
  error: string | null;
}

function fmtMoney(s: string): string {
  if (!s) return "";
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function fmtDate(s: string): string {
  if (!s) return "";
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

const MONEY_KEYS = new Set(["dollarsObligated", "totalUltimateContractValue"]);
const DATE_KEYS = new Set(["dateSigned"]);

export function ResultsTable({ rows, loading, error }: Props) {
  if (error) {
    return (
      <div className="m-6 rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  if (!loading && rows.length === 0) {
    return (
      <div className="m-6 rounded-md border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
        No contract awards match the current filters. Adjust filters and click
        Apply.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col [&>div]:min-h-0 [&>div]:flex-1">
      <Table>
        <TableHeader className="sticky top-0 z-10 bg-slate-50">
          <TableRow>
            {CSV_COLUMNS.map((c) => (
              <TableHead
                key={c.key}
                className="whitespace-nowrap px-3 py-2 text-xs"
              >
                {c.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && rows.length === 0 && (
            <TableRow>
              <TableCell
                colSpan={CSV_COLUMNS.length}
                className="py-8 text-center text-sm text-slate-500"
              >
                Querying GSA…
              </TableCell>
            </TableRow>
          )}
          {rows.map((r, idx) => (
            <TableRow key={`${r.piid}-${r.modificationNumber}-${idx}`}>
              {CSV_COLUMNS.map((c) => {
                const raw = r[c.key] ?? "";
                let display: string = raw;
                if (MONEY_KEYS.has(c.key)) display = fmtMoney(raw);
                else if (DATE_KEYS.has(c.key)) display = fmtDate(raw);
                return (
                  <TableCell
                    key={c.key}
                    className="whitespace-nowrap px-3 py-2 text-xs"
                    title={raw}
                  >
                    {display.length > 80
                      ? `${display.slice(0, 80)}…`
                      : display}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
