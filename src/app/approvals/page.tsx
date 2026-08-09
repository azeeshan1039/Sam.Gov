"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckSquare } from "lucide-react";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PipelineTable } from "@/components/pipeline/PipelineTable";
import { requesterQuery, type PipelineItem } from "@/lib/pipeline";

export default function ApprovalsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [awaitingApproval, setAwaitingApproval] = useState<PipelineItem[]>([]);
  const [needsSupplier, setNeedsSupplier] = useState<PipelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const current = getStoredUser();
    if (!current) {
      router.replace("/register");
      return;
    }
    if (current.role !== "admin") {
      router.replace("/negotiations");
      return;
    }
    setUser(current);
  }, [router]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/backend/pipeline/approvals?${requesterQuery(user)}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[approvals] load failed", { status: res.status, body: data });
        throw new Error(data.error || `Failed to load approvals (${res.status})`);
      }
      setAwaitingApproval(data.awaiting_approval || []);
      setNeedsSupplier(data.needs_supplier || []);
    } catch (err) {
      console.error("[approvals] page error", err);
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

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
          <CheckSquare className="h-6 w-6" />
          Approvals
        </h1>
        <p className="mt-1 text-muted-foreground">
          Two queues from the same pipeline: waiting on a manager, and still needing a supplier quote.
        </p>
      </div>
      {error && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Awaiting manager approval</CardTitle>
          <CardDescription>
            {loading ? "Loading…" : `${awaitingApproval.length} row(s) — approval pending or ready for approval`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <PipelineTable items={awaitingApproval} variant="full" empty="Nothing waiting on approval." />
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Needs supplier quote</CardTitle>
          <CardDescription>
            {loading ? "Loading…" : `${needsSupplier.length} row(s) — finding supplier / no quote / couldn\u2019t get quote`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <PipelineTable items={needsSupplier} variant="full" empty="No supplier-quote blockers." />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
