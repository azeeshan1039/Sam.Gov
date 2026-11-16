"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { AdminTabs, PageBand, PageMain } from "@/components/design/PageFrame";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PipelineTable } from "@/components/pipeline/PipelineTable";
import { requesterQuery, type PipelineItem } from "@/lib/pipeline";

export default function PipelinePage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<PipelineItem[]>([]);
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
      const res = await fetch(`/api/backend/pipeline?${requesterQuery(user)}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[pipeline] load failed", { status: res.status, body: data });
        throw new Error(data.error || `Failed to load pipeline (${res.status})`);
      }
      setItems(data.items || []);
    } catch (err) {
      console.error("[pipeline] page error", err);
      setError(err instanceof Error ? err.message : "Failed to load pipeline");
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
    <>
      <PageBand title="Bid pipeline" lead="Master list of solicitations. $100K+, Approvals, and By person are filters of this data." />
      <AdminTabs current="/pipeline" />
      <PageMain>
      {error && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>All opportunities</CardTitle>
          <CardDescription>{loading ? "Loading…" : `${items.length} row(s)`}</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-40 w-full" /> : <PipelineTable items={items} variant="full" />}
        </CardContent>
      </Card>
      </PageMain>
    </>
  );
}
