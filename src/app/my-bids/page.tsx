"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, FileSpreadsheet } from "lucide-react";
import { getStoredUser, getUserDisplayName, type AuthUser } from "@/lib/auth";
import MyBidsAlerts from "@/components/notifications/MyBidsAlerts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PipelineTable } from "@/components/pipeline/PipelineTable";
import { requesterQuery, type PipelineItem } from "@/lib/pipeline";

interface MyGoal {
  achieved: number;
  monthly: number;
  left: number;
}

interface ActiveClaim {
  id: number;
  external_notice_id: string;
  solicitation_number?: string | null;
  title: string;
  expected_bid_value?: number | null;
  response_deadline?: string | null;
  state: string;
}

export default function MyBidsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bidParam = searchParams.get("bid");
  const highlightId = bidParam && /^\d+$/.test(bidParam) ? Number(bidParam) : null;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [activeClaims, setActiveClaims] = useState<ActiveClaim[]>([]);
  const [goal, setGoal] = useState<MyGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const current = getStoredUser();
    if (!current) {
      router.replace("/register");
      return;
    }
    setUser(current);
  }, [router]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const query = requesterQuery(user);
      const [bidsRes, goalRes, claimsRes] = await Promise.all([
        fetch(`/api/backend/pipeline/my-bids?${query}`, { cache: "no-store" }),
        fetch(`/api/backend/stats/my-goal?${query}`, { cache: "no-store" }),
        fetch("/api/backend/opportunities/mine", { cache: "no-store" }),
      ]);
      const bidsData = await bidsRes.json().catch(() => ({}));
      const goalData = await goalRes.json().catch(() => ({}));
      const claimsData = await claimsRes.json().catch(() => ({}));
      if (!bidsRes.ok) {
        console.error("[my-bids] load failed", { status: bidsRes.status, body: bidsData });
        throw new Error(bidsData.error || `Failed to load bids (${bidsRes.status})`);
      }
      setItems(bidsData.items || []);
      if (claimsRes.ok) {
        setActiveClaims(
          (claimsData.opportunities || []).filter(
            (claim: ActiveClaim) => claim.state === "assigned"
          )
        );
      } else {
        console.error("[my-bids] active claims load failed", {
          status: claimsRes.status,
          body: claimsData,
        });
        setActiveClaims([]);
      }
      if (goalRes.ok) {
        setGoal({
          achieved: Number(goalData.achieved || 0),
          monthly: Number(goalData.monthly || 0),
          left: Number(goalData.left || 0),
        });
      } else {
        console.error("[my-bids] goal load failed", { status: goalRes.status, body: goalData });
        setGoal(null);
      }
    } catch (err) {
      console.error("[my-bids] page error", err);
      setError(err instanceof Error ? err.message : "Failed to load bids");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  useEffect(() => {
    if (!highlightId || loading) return;
    document.getElementById(`pipeline-row-${highlightId}`)?.scrollIntoView({ block: "center" });
  }, [highlightId, loading, items]);

  if (!user) {
    return (
      <div className="space-y-6 p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <FileSpreadsheet className="h-6 w-6" />
          My bids
        </h1>
        <p className="mt-1 text-muted-foreground">Your assigned solicitations.</p>
      </div>
      <MyBidsAlerts />
      {error && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Achieved</CardDescription>
            <CardTitle className="text-3xl">{loading ? "—" : goal ? goal.achieved : "—"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Submitted bids this month (ET)</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Monthly</CardDescription>
            <CardTitle className="text-3xl">{loading ? "—" : goal ? goal.monthly : "—"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Your standing monthly goal</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Left</CardDescription>
            <CardTitle className="text-3xl">{loading ? "—" : goal ? goal.left : "—"}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">Remaining to hit this month</CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Active picked-up bids</CardTitle>
          <CardDescription>
            Work currently reserved for you, including bids that have not entered negotiation yet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-28 w-full" />
          ) : activeClaims.length ? (
            <div className="divide-y rounded-md border">
              {activeClaims.map((claim) => (
                <Link
                  key={claim.id}
                  href={`/sam-gov/${encodeURIComponent(claim.external_notice_id)}`}
                  className="flex items-center justify-between gap-4 p-4 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{claim.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {claim.solicitation_number || claim.external_notice_id}
                      {claim.response_deadline
                        ? ` · Due ${new Date(claim.response_deadline).toLocaleDateString()}`
                        : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-sm">
                    <span className="font-medium">
                      {claim.expected_bid_value == null
                        ? "Value not set"
                        : claim.expected_bid_value.toLocaleString("en-US", {
                            style: "currency",
                            currency: "USD",
                            maximumFractionDigits: 0,
                          })}
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No active bids are assigned to you.</p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{getUserDisplayName(user)}</CardTitle>
          <CardDescription>{loading ? "Loading…" : `${items.length} row(s)`}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <PipelineTable
              items={items}
              variant="my-bids"
              empty="No bids assigned to you yet."
              highlightId={highlightId}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
