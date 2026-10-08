"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Activity, ArrowLeft, ArrowRight, RefreshCw } from "lucide-react";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 25;

interface ActivityEvent {
  id: number;
  bid_id: number;
  bid: string;
  solicitation_number: string | null;
  title: string | null;
  changed_by_name: string | null;
  old_status: string;
  new_status: string;
  changed_at_eastern: string;
}

interface ActivityResponse {
  items: ActivityEvent[];
  total: number;
  limit: number;
  offset: number;
}

export default function ActivityLogPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
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
      const offset = page * PAGE_SIZE;
      const response = await fetch(
        `/api/backend/pipeline/activity?limit=${PAGE_SIZE}&offset=${offset}`,
        { cache: "no-store" }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Could not load activity (${response.status}).`);
      const result = data as ActivityResponse;
      setEvents(result.items || []);
      setTotal(result.total || 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load activity.");
    } finally {
      setLoading(false);
    }
  }, [page, user]);

  useEffect(() => {
    if (user) void load();
  }, [load, user]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const firstItem = total === 0 ? 0 : page * PAGE_SIZE + 1;
  const lastItem = Math.min((page + 1) * PAGE_SIZE, total);

  if (!user) {
    return <div className="space-y-6 p-6 lg:p-8"><Skeleton className="h-8 w-56" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <main className="space-y-6 p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Activity className="h-6 w-6" />Status activity</h1>
          <p className="mt-1 text-muted-foreground">Company-wide chronological log of bid status changes.</p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw aria-hidden="true" className="h-4 w-4" />Refresh
        </Button>
      </div>

      {error && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
        <span>{error}</span><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>Try again</Button>
      </div>}

      <Card>
        <CardHeader>
          <CardTitle>All status changes</CardTitle>
          <CardDescription aria-live="polite">
            {loading ? "Loading activity…" : total ? `Showing ${firstItem}–${lastItem} of ${total} events` : "No status changes have been recorded yet."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading && events.length === 0 ? <Skeleton className="h-48 w-full" /> : events.length > 0 ? <>
            <ol aria-label="Status change events" className="divide-y">
              {events.map((event) => {
                const when = event.changed_at_eastern
                  ? new Date(event.changed_at_eastern).toLocaleString("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" })
                  : "Time unavailable";
                return <li key={event.id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">
                        <Link className="text-primary underline-offset-4 hover:underline" href={`/bids/${event.bid_id}`}>
                          {event.solicitation_number || event.bid || `Bid ${event.bid_id}`}
                        </Link>
                        <span className="font-normal">: {event.old_status} → {event.new_status}</span>
                      </p>
                      {event.title && <p className="truncate text-sm text-muted-foreground">{event.title}</p>}
                      <p className="text-sm text-muted-foreground">Changed by {event.changed_by_name || "Unknown user"}</p>
                    </div>
                    <time className="shrink-0 text-sm text-muted-foreground" dateTime={event.changed_at_eastern || undefined}>{when} ET</time>
                  </div>
                </li>;
              })}
            </ol>
            <nav aria-label="Activity pagination" className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
              <p className="text-sm text-muted-foreground">Page {page + 1} of {pageCount}</p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setPage((current) => Math.max(0, current - 1))} disabled={loading || page === 0}>
                  <ArrowLeft aria-hidden="true" className="h-4 w-4" />Previous
                </Button>
                <Button variant="outline" onClick={() => setPage((current) => Math.min(pageCount - 1, current + 1))} disabled={loading || page + 1 >= pageCount}>
                  Next<ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Button>
              </div>
            </nav>
          </> : !loading && !error ? <p className="py-6 text-sm text-muted-foreground">Status changes will appear here as bids move through the workflow.</p> : null}
        </CardContent>
      </Card>
    </main>
  );
}
