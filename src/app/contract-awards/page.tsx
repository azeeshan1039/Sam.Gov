"use client";

import * as React from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FilterRail } from "@/components/contract-awards/FilterRail";
import { ResultsTable } from "@/components/contract-awards/ResultsTable";
import {
  EMPTY_FILTERS,
  type ContractAwardFilters,
  type ContractAwardRecord,
  type ContractAwardsSearchResponse,
} from "@/types/contract-awards";

const PAGE_SIZE = 25;
const CSV_HARD_CAP = 100_000;

type CapChoice = "100" | "1000" | "10000" | "100000" | "all";

const CAP_OPTIONS: Array<{ value: CapChoice; label: string }> = [
  { value: "100", label: "100 rows" },
  { value: "1000", label: "1,000 rows" },
  { value: "10000", label: "10,000 rows" },
  { value: "100000", label: "100,000 rows" },
  { value: "all", label: "All matching" },
];

function resolveCap(choice: CapChoice, totalRecords: number | null): number {
  if (choice === "all") {
    if (totalRecords == null) return CSV_HARD_CAP;
    return Math.min(totalRecords, CSV_HARD_CAP);
  }
  return Number(choice);
}

function formatCount(n: number): string {
  return n.toLocaleString();
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}m ${r}s` : `${s}s`;
}

export default function ContractAwardsPage() {
  const [filters, setFilters] = React.useState<ContractAwardFilters>(EMPTY_FILTERS);
  const [results, setResults] = React.useState<ContractAwardRecord[]>([]);
  const [totalRecords, setTotalRecords] = React.useState<number | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [downloading, setDownloading] = React.useState(false);
  const [downloadElapsed, setDownloadElapsed] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [hasSearched, setHasSearched] = React.useState(false);
  const [capChoice, setCapChoice] = React.useState<CapChoice>("1000");

  const runSearch = React.useCallback(
    async (f: ContractAwardFilters) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/contract-awards", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filters: f, limit: PAGE_SIZE, offset: 0 }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data?.error || `Search failed (${res.status}).`);
          setResults([]);
          setTotalRecords(null);
        } else {
          const page = data as ContractAwardsSearchResponse;
          setResults(page.records);
          setTotalRecords(page.totalRecords);
        }
      } catch (e: any) {
        setError(e?.message || "Network error.");
        setResults([]);
        setTotalRecords(null);
      } finally {
        setLoading(false);
        setHasSearched(true);
      }
    },
    []
  );

  const downloadCsv = async () => {
    const cap = resolveCap(capChoice, totalRecords);
    setDownloading(true);
    setDownloadElapsed(0);
    setError(null);
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setDownloadElapsed(Date.now() - startedAt);
    }, 500);
    try {
      const res = await fetch("/api/contract-awards/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters, cap }),
      });
      if (!res.ok) {
        let msg = `Export failed (${res.status}).`;
        try {
          const j = await res.json();
          if (j?.error) msg = j.error;
        } catch {
          /* not JSON */
        }
        setError(msg);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = res.headers.get("Content-Disposition") || "";
      const m = cd.match(/filename="([^"]+)"/);
      a.download = m?.[1] || "contract-awards.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setError(e?.message || "Download failed.");
    } finally {
      window.clearInterval(timer);
      setDownloading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col">
      <header className="flex items-center justify-between gap-4 border-b border-slate-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Contract Awards
          </h1>
        </div>
        <div className="flex items-center gap-4">
          {totalRecords !== null && (
            <p className="text-xs text-slate-600">
              Showing {results.length.toLocaleString()} of{" "}
              <span className="font-medium">
                {totalRecords.toLocaleString()}
              </span>{" "}
              matching records
            </p>
          )}
          <div className="flex items-center gap-2">
            <Select
              value={capChoice}
              onValueChange={(v) => setCapChoice(v as CapChoice)}
              disabled={downloading}
            >
              <SelectTrigger className="h-9 w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CAP_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              onClick={downloadCsv}
              disabled={downloading || !hasSearched || results.length === 0}
            >
              <Download className="h-4 w-4" />
              {downloading
                ? `Generating… (${formatElapsed(downloadElapsed)})`
                : `Download CSV (${formatCount(
                    resolveCap(capChoice, totalRecords)
                  )})`}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <FilterRail
          value={filters}
          onChange={setFilters}
          onApply={() => runSearch(filters)}
          onReset={() => {
            setFilters(EMPTY_FILTERS);
            setResults([]);
            setTotalRecords(null);
            setError(null);
            setHasSearched(false);
          }}
          busy={loading}
        />
        <main className="flex min-w-0 flex-1 flex-col bg-slate-50">
          {!hasSearched ? (
            <div className="m-6 rounded-md border border-dashed border-slate-300 p-10 text-center text-sm text-slate-500">
              Set filters in the left rail, then click Apply to query GSA.
            </div>
          ) : (
            <ResultsTable rows={results} loading={loading} error={error} />
          )}
        </main>
      </div>
    </div>
  );
}
