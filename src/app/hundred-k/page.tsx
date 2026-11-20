"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { AdminTabs, PageBand, PageMain } from "@/components/design/PageFrame";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PipelineTable } from "@/components/pipeline/PipelineTable";
import {
  formatMoney,
  HUNDRED_K_THRESHOLD,
  requesterQuery,
  type PipelineEmployeeGroup,
} from "@/lib/pipeline";

export default function HundredKPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [employees, setEmployees] = useState<PipelineEmployeeGroup[]>([]);
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
      const res = await fetch(`/api/backend/pipeline/hundred-k?${requesterQuery(user)}`, {
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[hundred-k] load failed", { status: res.status, body: data });
        throw new Error(data.error || `Failed to load 100k bids (${res.status})`);
      }
      setEmployees(data.employees || []);
    } catch (err) {
      console.error("[hundred-k] page error", err);
      setError(err instanceof Error ? err.message : "Failed to load 100k bids");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const withRows = employees.filter((e) => e.items.length > 0);
  const tabEmployees = withRows.length > 0 ? withRows : employees;

  if (!user) {
    return (
      <PageMain>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </PageMain>
    );
  }

  return (
    <>
      <PageBand title="$100K+ bids" lead={`Opportunities with gross sales ≥ ${formatMoney(HUNDRED_K_THRESHOLD)}, grouped by employee.`} />
      <AdminTabs current="/hundred-k" />
      <PageMain className="cf-workspace">
      {error && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : tabEmployees.length === 0 ? (
        <Card className="cf-card">
          <CardContent className="py-10 text-sm text-muted-foreground">
            No team members yet.
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue={String(tabEmployees[0].user_id)}>
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            {tabEmployees.map((emp) => (
              <TabsTrigger key={emp.user_id} value={String(emp.user_id)}>
                {emp.name} ({emp.items.length})
              </TabsTrigger>
            ))}
          </TabsList>
          {tabEmployees.map((emp) => (
            <TabsContent key={emp.user_id} value={String(emp.user_id)}>
              <Card className="cf-card">
                <CardHeader>
                  <CardTitle className="cf-h2">{emp.name}</CardTitle>
                  <CardDescription>
                    {emp.items.length} high-value solicitation(s)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <PipelineTable
                    items={emp.items}
                    variant="hundred-k"
                    empty="No $100k+ opportunities for this person."
                  />
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}
      </PageMain>
    </>
  );
}
