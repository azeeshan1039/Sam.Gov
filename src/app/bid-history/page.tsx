"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { PipelineTable } from "@/components/pipeline/PipelineTable";
import { formatOutcome, formatStatus, requesterQuery, type PipelineItem } from "@/lib/pipeline";

interface AgentOption {
  user_id: number;
  name: string;
}

const ALL = "all";

export default function BidHistoryPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [portals, setPortals] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [queryText, setQueryText] = useState("");
  const [portal, setPortal] = useState(ALL);
  const [agent, setAgent] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [outcome, setOutcome] = useState(ALL);
  const [size, setSize] = useState(ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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

  useEffect(() => {
    const timer = setTimeout(() => setQueryText(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const query = requesterQuery(user);
      if (queryText) query.set("q", queryText);
      if (portal !== ALL) query.set("portal", portal);
      if (agent !== ALL) query.set("agent_user_id", agent);
      if (status !== ALL) query.set("internal_status", status);
      if (outcome !== ALL) query.set("outcome", outcome);
      if (size !== ALL) query.set("size", size);
      if (dateFrom) query.set("date_from", dateFrom);
      if (dateTo) query.set("date_to", dateTo);
      const res = await fetch(`/api/backend/pipeline/history?${query}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("[bid-history] load failed", { status: res.status, body: data });
        throw new Error(data.error || `Failed to load bid history (${res.status})`);
      }
      setItems(data.items || []);
      setAgents(data.agents || []);
      setPortals(data.portals || []);
      setStatuses(data.statuses || []);
    } catch (err) {
      console.error("[bid-history] page error", err);
      setError(err instanceof Error ? err.message : "Failed to load bid history");
    } finally {
      setLoading(false);
    }
  }, [user, queryText, portal, agent, status, outcome, size, dateFrom, dateTo]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const filtersActive =
    Boolean(queryText) ||
    portal !== ALL ||
    agent !== ALL ||
    status !== ALL ||
    outcome !== ALL ||
    size !== ALL ||
    Boolean(dateFrom) ||
    Boolean(dateTo);

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
          <History className="h-6 w-6" />
          Bid history
        </h1>
        <p className="mt-1 text-muted-foreground">
          Every bid logged for this company. Search and filter the full record.
        </p>
      </div>
      {error && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle>All logged bids</CardTitle>
          <CardDescription>{loading ? "Loading…" : `${items.length} bid(s)`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search solicitation, title, or agent"
              className="lg:max-w-sm"
              aria-label="Search bids"
            />
            <FilterSelect
              label="Portal"
              value={portal}
              onChange={setPortal}
              options={[
                { value: ALL, label: "All portals" },
                ...portals.map((name) => ({ value: name, label: name })),
              ]}
            />
            <FilterSelect
              label="Agent"
              value={agent}
              onChange={setAgent}
              options={[
                { value: ALL, label: "All agents" },
                ...agents.map((person) => ({ value: String(person.user_id), label: person.name })),
              ]}
            />
            <FilterSelect
              label="Status"
              value={status}
              onChange={setStatus}
              options={[
                { value: ALL, label: "All statuses" },
                ...statuses.map((name) => ({ value: name, label: formatStatus(name) })),
              ]}
            />
            <FilterSelect
              label="Outcome"
              value={outcome}
              onChange={setOutcome}
              options={[
                { value: ALL, label: "All outcomes" },
                { value: "won", label: formatOutcome("won") },
                { value: "no_quote", label: formatOutcome("no_quote") },
              ]}
            />
            <FilterSelect
              label="Size"
              value={size}
              onChange={setSize}
              options={[
                { value: ALL, label: "All sizes" },
                { value: "lte_50k", label: "≤ $50k" },
                { value: "gte_50k", label: "≥ $50k" },
                { value: "gte_100k", label: "≥ $100k" },
              ]}
            />
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Assign from
              <Input
                type="date"
                value={dateFrom}
                onChange={(event) => setDateFrom(event.target.value)}
                className="lg:w-[160px]"
                aria-label="Assign from"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Assign to
              <Input
                type="date"
                value={dateTo}
                onChange={(event) => setDateTo(event.target.value)}
                className="lg:w-[160px]"
                aria-label="Assign to"
              />
            </label>
          </div>
          {loading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <div className="overflow-x-auto">
              <PipelineTable
                items={items}
                variant="history"
                empty={filtersActive ? "No bids match these filters." : "No bids have been logged yet."}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full lg:w-[180px]" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
