"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserRound } from "lucide-react";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PipelineTable } from "@/components/pipeline/PipelineTable";
import { requesterQuery, type PipelineItem } from "@/lib/pipeline";

interface EmployeeOption {
  user_id: number;
  name: string;
  role: string;
}

export default function ByPersonPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  const [agentId, setAgentId] = useState<string>("");
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

  const load = useCallback(
    async (selectedAgent?: string) => {
      if (!user) return;
      setLoading(true);
      setError(null);
      try {
        const query = requesterQuery(user);
        const agent = selectedAgent ?? agentId;
        if (agent) query.set("agent_user_id", agent);
        const res = await fetch(`/api/backend/pipeline/by-person?${query}`, { cache: "no-store" });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          console.error("[by-person] load failed", { status: res.status, body: data });
          throw new Error(data.error || `Failed to load person view (${res.status})`);
        }
        const nextEmployees: EmployeeOption[] = data.employees || [];
        setEmployees(nextEmployees);
        const nextAgent = String(data.agent_user_id || nextEmployees[0]?.user_id || "");
        setAgentId(nextAgent);
        setItems(data.items || []);
      } catch (err) {
        console.error("[by-person] page error", err);
        setError(err instanceof Error ? err.message : "Failed to load person view");
      } finally {
        setLoading(false);
      }
    },
    [user, agentId]
  );

  useEffect(() => {
    if (user) load();
    // initial load only when user is set
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

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
          <UserRound className="h-6 w-6" />
          By person
        </h1>
        <p className="mt-1 text-muted-foreground">
          Full pipeline for one employee (replaces separate Jacob / Emma spreadsheet tabs).
        </p>
      </div>
      {error && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      {employees.length === 0 && !loading ? (
        <Card>
          <CardContent className="py-10 text-sm text-muted-foreground">No team members yet.</CardContent>
        </Card>
      ) : (
        <Tabs
          value={agentId || undefined}
          onValueChange={(value) => {
            setAgentId(value);
            load(value);
          }}
        >
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1">
            {employees.map((emp) => (
              <TabsTrigger key={emp.user_id} value={String(emp.user_id)}>
                {emp.name}
              </TabsTrigger>
            ))}
          </TabsList>
          {employees.map((emp) => (
            <TabsContent key={emp.user_id} value={String(emp.user_id)}>
              <Card>
                <CardHeader>
                  <CardTitle>{emp.name}</CardTitle>
                  <CardDescription>
                    {loading ? "Loading…" : `${items.length} solicitation(s)`}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <Skeleton className="h-40 w-full" />
                  ) : (
                    <PipelineTable
                      items={items}
                      variant="person"
                      empty="No pipeline rows for this person."
                    />
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  );
}
