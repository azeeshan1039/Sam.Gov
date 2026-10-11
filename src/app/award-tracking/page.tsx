"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Medal } from "lucide-react";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { formatDate, formatMoney, requesterQuery } from "@/lib/pipeline";
import {
  AWARD_OUTCOMES,
  CHECKPOINT_STATE_OPTIONS,
  SIZE_BUCKET_OPTIONS,
  checkpointChipClass,
  formatCheckpoint,
  formatOutcomeLabel,
  outcomeBadgeClass,
  type AwardTrackingItem,
  type AwardTrackingResponse,
} from "@/lib/awards";
import { CheckpointDialog } from "@/components/awards/CheckpointDialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ALL = "all";
type SortKey = "outcome" | "awarded_amount" | "submitted_price" | "submitted_at" | "checkpoint";

export default function AwardTrackingPage() {
  return (
    <Suspense fallback={<div className="space-y-6 p-6 lg:p-8"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>}>
      <AwardTracking />
    </Suspense>
  );
}

function AwardTracking() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [data, setData] = useState<AwardTrackingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [queryText, setQueryText] = useState("");
  const [agent, setAgent] = useState(ALL);
  const [outcome, setOutcome] = useState(ALL);
  const [portal, setPortal] = useState(ALL);
  const [size, setSize] = useState(ALL);
  const [checkpointState, setCheckpointState] = useState(searchParams.get("checkpoint_state") || ALL);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<SortKey>("submitted_at");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [selected, setSelected] = useState<AwardTrackingItem | null>(null);
  const [handledLink, setHandledLink] = useState<string | null>(null);

  useEffect(() => {
    const current = getStoredUser();
    if (!current) {
      router.replace("/register");
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
      if (agent !== ALL) query.set("agent_user_id", agent);
      if (outcome !== ALL) query.set("outcome", outcome);
      if (portal !== ALL) query.set("portal", portal);
      if (size !== ALL) query.set("size", size);
      if (checkpointState !== ALL) query.set("checkpoint_state", checkpointState);
      if (dateFrom) query.set("date_from", dateFrom);
      if (dateTo) query.set("date_to", dateTo);
      query.set("sort", sort);
      query.set("dir", dir);
      const response = await fetch(`/api/backend/pipeline/award-tracking?${query}`, { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || `Failed to load award tracking (${response.status})`);
      setData(body as AwardTrackingResponse);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load award tracking");
    } finally {
      setLoading(false);
    }
  }, [user, queryText, agent, outcome, portal, size, checkpointState, dateFrom, dateTo, sort, dir]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  // Deep links from a notification or the dashboard flag (/award-tracking?checkpoint_state=…&bid=<id>)
  // can arrive while this page is already open, so each new URL is handled once.
  const linkKey = searchParams.toString();
  useEffect(() => {
    setCheckpointState(searchParams.get("checkpoint_state") || ALL);
  }, [linkKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const bid = Number(searchParams.get("bid"));
    if (!bid || !data || handledLink === linkKey) return;
    const match = data.items.find((item) => item.id === bid);
    if (!match) return;  // may appear once the list reloads with the linked filter
    setSelected(match);
    setHandledLink(linkKey);
  }, [data, handledLink, linkKey, searchParams]);

  function toggleSort(key: SortKey) {
    if (sort === key) setDir(dir === "asc" ? "desc" : "asc");
    else {
      setSort(key);
      setDir(key === "outcome" ? "asc" : "desc");
    }
  }

  const items = data?.items ?? [];
  const summary = data?.summary;
  const isAdmin = user?.role === "admin";
  const filtersActive = Boolean(queryText) || [agent, outcome, portal, size, checkpointState].some((v) => v !== ALL) || Boolean(dateFrom || dateTo);
  const focusCheckpoint = useMemo(() => {
    if (!selected?.current_checkpoint) return null;
    return selected.current_checkpoint.state === "due" ? selected.current_checkpoint.checkpoint_days : null;
  }, [selected]);

  if (!user) {
    return <div className="space-y-6 p-6 lg:p-8"><Skeleton className="h-8 w-48" /><Skeleton className="h-64 w-full" /></div>;
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold"><Medal className="h-6 w-6" />Award Tracking</h1>
        <p className="mt-1 text-slate-600">
          {isAdmin ? "Every submitted bid's award outcome and its 30/45/60/90-day checkpoints." : "Award outcomes and checkpoints for the bids you submitted."}
        </p>
      </div>

      {!isAdmin && summary && summary.due + summary.flagged > 0 && (
        <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          {summary.due + summary.flagged} award check(s) need your update.{" "}
          <button className="font-medium underline" onClick={() => setCheckpointState("due")}>Show checks due</button>
        </div>
      )}

      {error && <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Award summary">
        {[
          ["Submitted bids", summary ? String(summary.count) : "—"],
          ["Won / Lost", summary ? `${summary.outcomes.won} / ${summary.outcomes.lost}` : "—"],
          ["Win rate", summary?.win_rate != null ? `${summary.win_rate}%` : "—"],
          ["Pending / Unknown", summary ? `${summary.outcomes.pending} / ${summary.outcomes.unknown}` : "—"],
          ["90-day flags", summary ? String(summary.flagged) : "—"],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-600">{label}</CardTitle></CardHeader>
            <CardContent className="text-2xl font-bold">{loading && !data ? "—" : value}</CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader>
          <CardTitle>{isAdmin ? "All submitted bids" : "My submitted bids"}</CardTitle>
          <CardDescription className="text-slate-600">{loading ? "Loading…" : `${items.length} bid(s)`}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap">
            <Input value={search} onChange={(event) => setSearch(event.target.value)}
              placeholder="Search solicitation, title, or agent" className="lg:max-w-xs" aria-label="Search award records" />
            {isAdmin && (
              <FilterSelect label="Employee" value={agent} onChange={setAgent} options={[
                { value: ALL, label: "All employees" },
                ...(data?.agents ?? []).map((person) => ({ value: String(person.user_id), label: person.name })),
              ]} />
            )}
            <FilterSelect label="Outcome" value={outcome} onChange={setOutcome} options={[
              { value: ALL, label: "All outcomes" },
              ...AWARD_OUTCOMES.map((value) => ({ value, label: formatOutcomeLabel(value) })),
            ]} />
            <FilterSelect label="Portal" value={portal} onChange={setPortal} options={[
              { value: ALL, label: "All portals" },
              ...(data?.portals ?? []).map((name) => ({ value: name, label: name })),
            ]} />
            <FilterSelect label="Size bucket" value={size} onChange={setSize} options={[
              { value: ALL, label: "All sizes" }, ...SIZE_BUCKET_OPTIONS,
            ]} />
            <FilterSelect label="Checkpoint" value={checkpointState} onChange={setCheckpointState} options={[
              { value: ALL, label: "All checkpoints" }, ...CHECKPOINT_STATE_OPTIONS,
            ]} />
            <label className="flex flex-col gap-1 text-xs text-slate-600">Submitted from
              <Input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="lg:w-[160px]" aria-label="Submitted from" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-600">Submitted to
              <Input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="lg:w-[160px]" aria-label="Submitted to" />
            </label>
          </div>

          {loading && !data ? <Skeleton className="h-40 w-full" /> : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-slate-600">Bid</TableHead>
                    <TableHead className="text-slate-600">Solicitation #</TableHead>
                    {isAdmin && <TableHead className="text-slate-600">Agent</TableHead>}
                    <TableHead className="text-slate-600">Portal</TableHead>
                    <SortHead label="Submitted" sortKey="submitted_at" sort={sort} dir={dir} onSort={toggleSort} />
                    <SortHead label="Submitted $" sortKey="submitted_price" sort={sort} dir={dir} onSort={toggleSort} />
                    <TableHead className="text-slate-600">Size</TableHead>
                    <SortHead label="Outcome" sortKey="outcome" sort={sort} dir={dir} onSort={toggleSort} />
                    <TableHead className="text-slate-600">Awarded to</TableHead>
                    <SortHead label="Awarded $" sortKey="awarded_amount" sort={sort} dir={dir} onSort={toggleSort} />
                    <SortHead label="Checkpoint" sortKey="checkpoint" sort={sort} dir={dir} onSort={toggleSort} />
                    <TableHead className="text-slate-600"><span className="sr-only">Actions</span></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isAdmin ? 12 : 11} className="py-8 text-center text-slate-600">
                        {filtersActive ? "No award records match these filters." : "No submitted bids yet."}
                      </TableCell>
                    </TableRow>
                  ) : items.map((item) => (
                    <TableRow key={item.id} data-testid={`award-row-${item.id}`}>
                      <TableCell className="whitespace-nowrap font-medium">{item.bid_id}</TableCell>
                      <TableCell className="max-w-[220px]">
                        <div className="font-medium">{item.solicitation_number || "—"}</div>
                        <div className="truncate text-xs text-slate-600" title={item.title || ""}>{item.title}</div>
                      </TableCell>
                      {isAdmin && <TableCell className="whitespace-nowrap">{item.agent_name || "—"}</TableCell>}
                      <TableCell>{item.portal || "—"}</TableCell>
                      <TableCell className="whitespace-nowrap">{formatDate(item.submitted_on)}</TableCell>
                      <TableCell className="tabular-nums">{formatMoney(item.submitted_price)}</TableCell>
                      <TableCell className="whitespace-nowrap">{item.size_bucket || "—"}</TableCell>
                      <TableCell>
                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${outcomeBadgeClass(item.award_outcome)}`}>
                          {formatOutcomeLabel(item.award_outcome)}
                        </span>
                        {item.sam_info?.result === "found" && !item.sam_info.applied && (
                          <span className="ml-1 inline-block h-2 w-2 rounded-full bg-blue-500" title="SAM.gov award information available" aria-label="SAM.gov award information available" />
                        )}
                      </TableCell>
                      <TableCell>{item.awarded_to || "—"}</TableCell>
                      <TableCell className="tabular-nums">{formatMoney(item.awarded_amount)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-xs ${checkpointChipClass(item.checkpoint_state)}`}>
                          {formatCheckpoint(item)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button size="sm" variant={item.checkpoint_state === "due" || item.flagged ? "default" : "outline"} onClick={() => setSelected(item)}>
                          {item.can_record ? "Record check" : "View"}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {summary && summary.top_competitors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Who we lose to</CardTitle>
            <CardDescription className="text-slate-600">Winners recorded on lost bids, by count. Lost to competitors: {formatMoney(summary.lost_to_competitors_total)}.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y text-sm">
              {summary.top_competitors.map((competitor) => (
                <li key={competitor.name} className="flex justify-between py-2">
                  <span className="font-medium">{competitor.name}</span>
                  <span className="text-slate-600">{competitor.count} bid(s) · {formatMoney(competitor.total)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <CheckpointDialog
        item={selected}
        focusCheckpoint={focusCheckpoint}
        open={selected !== null}
        onOpenChange={(open) => { if (!open) setSelected(null); }}
        onSaved={() => load()}
      />
    </div>
  );
}

function SortHead({ label, sortKey, sort, dir, onSort }: {
  label: string; sortKey: SortKey; sort: SortKey; dir: "asc" | "desc"; onSort: (key: SortKey) => void;
}) {
  const active = sort === sortKey;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className="text-slate-600" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="inline-flex items-center gap-1 whitespace-nowrap font-medium" onClick={() => onSort(sortKey)}>
        {label}<Icon className="h-3.5 w-3.5" aria-hidden />
      </button>
    </TableHead>
  );
}

function FilterSelect({ label, value, onChange, options }: {
  label: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full lg:w-[180px]" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}
