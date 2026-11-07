"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Tags, RefreshCw } from "lucide-react";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface NicheOwner {
  id: number;
  full_name: string;
}

interface NicheOpportunity {
  id: number;
  external_notice_id: string;
  solicitation_number: string | null;
  title: string;
  state: string;
  assignee?: NicheOwner | null;
}

interface NicheDirectoryEntry {
  naics_code: string;
  naics_description?: string | null;
  total_bid_count: number;
  active_bid_count: number;
  owners: NicheOwner[];
  qualified_owners?: Array<{ user: NicheOwner; submitted_count: number }>;
  approval?: {
    status: "pending" | "approved" | string;
    duplicate_of_code?: string | null;
  } | null;
  qualification_rule?: {
    minimum_submitted_bids: number;
    credit_model: string;
    over_limit_behavior: string;
  };
  routing_flags?: Array<{
    id: number;
    message: string | null;
    finder?: NicheOwner | null;
    owner?: NicheOwner | null;
    opportunity?: NicheOpportunity | null;
  }>;
  opportunities: NicheOpportunity[];
}

interface PerformanceSummary {
  submitted_bid_count: number;
  won: number;
  lost: number;
  pending: number;
  unknown: number;
  terminal_outcome_count: number;
  win_rate: number | null;
}

interface NichePerformanceEntry extends PerformanceSummary {
  naics_code: string;
  naics_description?: string | null;
}

interface NichePerformanceReport {
  date_from: string;
  date_to: string;
  baseline_label: string;
  niche: PerformanceSummary;
  baseline: PerformanceSummary;
  niches: NichePerformanceEntry[];
}

function formatRate(value: number | null) {
  if (value == null) return "N/A";
  return `${Math.round(value * 1000) / 10}%`;
}

export default function NicheDirectoryPage() {
  const router = useRouter();
  const [items, setItems] = useState<NicheDirectoryEntry[]>([]);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approvalLoading, setApprovalLoading] = useState<string | null>(null);
  const [performance, setPerformance] = useState<NichePerformanceReport | null>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = dateFrom && dateTo ? `?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}` : "";
      const [directoryResponse, performanceResponse] = await Promise.all([
        fetch("/api/backend/opportunities/niches", { cache: "no-store" }),
        fetch(`/api/backend/pipeline/niche-performance${query}`, { cache: "no-store" }),
      ]);
      const directory = await directoryResponse.json().catch(() => ({}));
      const performanceData = await performanceResponse.json().catch(() => ({}));
      if (!directoryResponse.ok) throw new Error(directory.error || "Unable to load niche directory.");
      if (!performanceResponse.ok) throw new Error(performanceData.error || "Unable to load niche performance.");
      setItems(directory.niches || []);
      setPerformance(performanceData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load niche directory.");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) return router.replace("/register");
    setCurrentUser(user);
    void load();
  }, [load, router]);

  const approve = async (item: NicheDirectoryEntry) => {
    setApprovalLoading(item.naics_code);
    setError(null);
    try {
      const response = await fetch("/api/backend/opportunities/niches/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          naics_code: item.naics_code,
          naics_description: item.naics_description,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Unable to approve niche.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to approve niche.");
    } finally {
      setApprovalLoading(null);
    }
  };

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Tags className="h-6 w-6" />Niche directory</h1>
          <p className="mt-1 text-muted-foreground">Company NAICS niches, active owners, and related bids.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Niche performance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">From</label>
              <input className="mt-1 h-9 rounded border px-3" type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">To</label>
              <input className="mt-1 h-9 rounded border px-3" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
            <Button variant="outline" onClick={load} disabled={loading}>Apply</Button>
          </div>
          {performance ? (
            <>
              <p className="text-muted-foreground">Period: {performance.date_from} to {performance.date_to}. Baseline: {performance.baseline_label}.</p>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded border p-3">
                  <p className="text-muted-foreground">Niche allocation win rate</p>
                  <p className="text-2xl font-bold">{formatRate(performance.niche.win_rate)}</p>
                  <p className="text-xs text-muted-foreground">{performance.niche.won} won · {performance.niche.lost} lost · {performance.niche.pending} pending · {performance.niche.unknown} unknown</p>
                </div>
                <div className="rounded border p-3">
                  <p className="text-muted-foreground">General allocation win rate</p>
                  <p className="text-2xl font-bold">{formatRate(performance.baseline.win_rate)}</p>
                  <p className="text-xs text-muted-foreground">{performance.baseline.won} won · {performance.baseline.lost} lost · {performance.baseline.pending} pending · {performance.baseline.unknown} unknown</p>
                </div>
              </div>
              {performance.niches.length > 0 && (
                <div className="space-y-2">
                  <p className="font-medium">By niche</p>
                  {performance.niches.map((item) => (
                    <div key={item.naics_code} className="flex flex-wrap justify-between gap-2 rounded border p-3">
                      <span>{item.naics_code}{item.naics_description ? ` · ${item.naics_description}` : ""}</span>
                      <span className="font-medium">{formatRate(item.win_rate)} ({item.won}W / {item.lost}L)</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">Performance data is loading.</p>
          )}
        </CardContent>
      </Card>
      {loading ? <p className="text-sm text-muted-foreground">Loading niche ownership…</p> : items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No NAICS niches have been assigned yet.</CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {items.map((item) => (
            <Card key={item.naics_code}>
              <CardHeader>
                <CardTitle className="text-base">{item.naics_code}{item.naics_description ? ` · ${item.naics_description}` : ""}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="flex flex-wrap gap-2 text-muted-foreground">
                  <span>{item.active_bid_count} active</span>
                  <span>·</span>
                  <span>{item.total_bid_count} total</span>
                  <span>·</span>
                  <span>{item.approval?.status === "approved" ? "Approved" : "Pending approval"}</span>
                </div>
                {item.approval?.duplicate_of_code && (
                  <div className="rounded border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    Similar niche detected: {item.approval.duplicate_of_code}
                  </div>
                )}
                {currentUser?.role === "admin" && item.approval?.status !== "approved" && (
                  <Button size="sm" onClick={() => approve(item)} disabled={approvalLoading === item.naics_code}>
                    {approvalLoading === item.naics_code ? "Approving..." : "Approve niche"}
                  </Button>
                )}
                <div className="rounded border bg-slate-50 p-3">
                  <p className="font-medium">Ownership rule</p>
                  <p className="mt-1 text-muted-foreground">
                    Qualifies after {item.qualification_rule?.minimum_submitted_bids ?? 3} submitted bid(s). Credit model: owner only. Over-limit routing: manager review.
                  </p>
                </div>
                <div>
                  <p className="font-medium">Owners</p>
                  <p className="mt-1 text-muted-foreground">
                    {item.owners.length ? item.owners.map((owner) => owner.full_name).join(", ") : "No active owner"}
                  </p>
                </div>
                <div>
                  <p className="font-medium">Qualified owners</p>
                  <p className="mt-1 text-muted-foreground">
                    {item.qualified_owners?.length
                      ? item.qualified_owners.map((owner) => `${owner.user.full_name} (${owner.submitted_count})`).join(", ")
                      : "No employee has qualified yet"}
                  </p>
                </div>
                {(item.routing_flags || []).length > 0 && (
                  <div className="space-y-2 rounded border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    <p className="font-medium">Manager review</p>
                    {(item.routing_flags || []).map((flag) => (
                      <p key={flag.id}>
                        {flag.opportunity?.solicitation_number || flag.opportunity?.title || "Bid"} stayed available: {flag.message || "qualified owner is over limit"}
                      </p>
                    ))}
                  </div>
                )}
                <div className="space-y-2">
                  {item.opportunities.slice(0, 5).map((opportunity) => (
                    <Link key={opportunity.id} href={`/sam-gov/${encodeURIComponent(opportunity.external_notice_id)}`} className="block rounded border p-3 hover:bg-slate-50">
                      <p className="font-medium">{opportunity.solicitation_number || opportunity.external_notice_id}</p>
                      <p className="line-clamp-1 text-muted-foreground">{opportunity.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{opportunity.state}{opportunity.assignee ? ` · ${opportunity.assignee.full_name}` : ""}</p>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
