"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Download } from "lucide-react";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { PageBand, PageMain } from "@/components/design/PageFrame";
import { formatMoney, requesterQuery } from "@/lib/pipeline";
import {
  AWARD_OUTCOMES,
  CHECKPOINT_STATE_OPTIONS,
  SIZE_BUCKET_OPTIONS,
  formatCheckpoint,
  formatOutcomeLabel,
  type AwardTrackingItem,
  type AwardTrackingResponse,
} from "@/lib/awards";
import { CheckpointDialog } from "@/components/awards/CheckpointDialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const ALL = "all";
const PAGE_SIZE = 8;
const CHECK_DAYS = [30, 45, 60, 90];
type SortKey = "outcome" | "awarded_amount" | "submitted_price" | "submitted_at" | "checkpoint";

function dotStates(item: AwardTrackingItem) {
  const current = item.current_checkpoint?.checkpoint_days;
  const closed = item.award_outcome === "won" || item.award_outcome === "lost" || item.checkpoint_state === "complete";
  return CHECK_DAYS.map((day, index) => {
    if (item.checkpoint_state === "flagged" && day === 90) return "due";
    if (index < item.checkpoints_completed) return "done";
    if (current === day && (item.checkpoint_state === "due" || item.current_checkpoint?.state === "due")) return "due";
    if (closed) return "off";
    return "next";
  });
}

function checkpointNote(item: AwardTrackingItem) {
  if (item.checkpoint_state === "flagged") return { text: "90-DAY FLAG", color: "#BE123C" };
  if (item.checkpoint_state === "due" && item.current_checkpoint) return { text: `${item.current_checkpoint.checkpoint_days}-DAY DUE`, color: "#B45309" };
  if (item.checkpoint_state === "untracked") return { text: "BEFORE TRACKING", color: "var(--cf-text-3)" };
  if (item.current_checkpoint && item.checkpoint_state === "upcoming") return { text: `NEXT ${item.current_checkpoint.due_on}`, color: "var(--cf-text-3)" };
  if (item.award_outcome === "won" || item.award_outcome === "lost" || item.checkpoint_state === "complete") {
    const day = CHECK_DAYS[Math.max(0, item.checkpoints_completed - 1)] || 30;
    return { text: `CLOSED AT ${day}D`, color: "var(--cf-text-3)" };
  }
  return { text: "", color: "var(--cf-text-3)" };
}

function outcomePill(outcome: string) {
  if (outcome === "won") return "cf-pill-won";
  if (outcome === "lost") return "cf-pill-lost";
  if (outcome === "pending") return "cf-pill-app";
  return "cf-pill-pool";
}

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
  const [page, setPage] = useState(1);

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
    setPage(1);
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
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageItems = items.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
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
    <>
      <PageBand
        eyebrow="CHECKPOINTS · 30 / 45 / 60 / 90 DAYS"
        title="Award tracking"
        lead={isAdmin ? "Every submitted bid's award outcome and its 30/45/60/90-day checkpoints." : "Outcomes for the bids you submitted"}
        actions={<button type="button" className="cf-btn cf-btn-secondary" onClick={() => exportAwards(items)}><Download size={16} strokeWidth={1.75} />Export CSV</button>}
      />
      <PageMain>

      {summary && summary.due + summary.flagged > 0 && (
        <div role="status" style={{ display: "flex", flexWrap: "wrap", gap: "12px 20px", alignItems: "center", justifyContent: "space-between", background: "rgba(251,191,36,.06)", border: "1px solid rgba(251,191,36,.4)", borderRadius: 14, padding: "14px 20px" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 15 }}>
            <span><strong style={{ fontWeight: 500, color: "#B45309" }}>{summary.due + summary.flagged} award check{summary.due + summary.flagged === 1 ? "" : "s"}</strong> {summary.due + summary.flagged === 1 ? "is" : "are"} due. Record whether each bid was awarded and, if not, to whom and for how much.</span>
          </span>
          <button type="button" className="cf-btn cf-btn-secondary" onClick={() => setCheckpointState("due")}>Show checks due</button>
        </div>
      )}

      {error && <div role="alert" className="cf-banner cf-banner-bad">{error}</div>}

      <section className="cf-grid-kpi" aria-label="Outcome summary">
        <div className="cf-card cf-kpi cf-kpi-hero"><div className="cf-lbl" style={{ color: "#0E7490" }}>Submitted bids</div><div className="cf-kpi-v" style={{ fontSize: 32 }}>{loading && !data ? "—" : summary ? summary.count : "—"}</div></div>
        <div className="cf-card cf-kpi"><div className="cf-lbl">Won / lost</div><div className="cf-kpi-v" style={{ fontSize: 32 }}>{loading && !data || !summary ? "—" : <>{summary.outcomes.won} <span style={{ color: "var(--cf-text-3)", fontWeight: 400 }}>/</span> {summary.outcomes.lost}</>}</div></div>
        <div className="cf-card cf-kpi"><div className="cf-lbl">Win rate</div><div className="cf-kpi-v" style={{ fontSize: 32 }}>{loading && !data ? "—" : summary?.win_rate != null ? `${summary.win_rate}%` : "—"}</div><div className="cf-meta" style={{ marginTop: 8 }}>of decided bids</div></div>
        <div className="cf-card cf-kpi"><div className="cf-lbl">Pending / unknown</div><div className="cf-kpi-v" style={{ fontSize: 32 }}>{loading && !data || !summary ? "—" : <>{summary.outcomes.pending} <span style={{ color: "var(--cf-text-3)", fontWeight: 400 }}>/</span> {summary.outcomes.unknown}</>}</div></div>
        <div className="cf-card cf-kpi" style={{ borderColor: "rgba(251,113,133,.35)" }}><div className="cf-lbl" style={{ color: "#BE123C" }}>90-day flags</div><div className="cf-kpi-v" style={{ fontSize: 32 }}>{loading && !data ? "—" : summary ? summary.flagged : "—"}</div><div className="cf-meta" style={{ marginTop: 8 }}>No result after 90 days</div></div>
      </section>

      <section className="cf-card" aria-labelledby="sub-h" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 14, borderBottom: "1px solid var(--cf-line)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
            <h2 id="sub-h" className="cf-h2">{isAdmin ? "All submitted bids" : "My submitted bids"}</h2>
            <span className="cf-mono cf-meta">{loading ? "LOADING" : `${items.length} BIDS · NEWEST FIRST`}</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
            <div className="cf-flt" style={{ flex: "2 1 240px" }}>
              <label htmlFor="at-q">Search</label>
              <input id="at-q" className="cf-input" type="search" placeholder="Solicitation or title" aria-label="Search award records" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
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
            <FilterSelect label="Size bucket" visible="Size" value={size} onChange={setSize} options={[
              { value: ALL, label: "All sizes" }, ...SIZE_BUCKET_OPTIONS,
            ]} />
            <FilterSelect label="Checkpoint" value={checkpointState} onChange={setCheckpointState} options={[
              { value: ALL, label: "All checkpoints" }, ...CHECKPOINT_STATE_OPTIONS,
            ]} />
            <div className="cf-flt" style={{ flex: "1 1 150px" }}>
              <label htmlFor="at-f">Submitted from</label>
              <input id="at-f" className="cf-input" type="date" aria-label="Submitted from" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
            </div>
            <div className="cf-flt" style={{ flex: "1 1 150px" }}>
              <label htmlFor="at-t">Submitted to</label>
              <input id="at-t" className="cf-input" type="date" aria-label="Submitted to" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 18, fontSize: 12, color: "var(--cf-text-2)" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="cf-d cf-d-done" />Checked</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="cf-d cf-d-due" />Due now</span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span className="cf-d cf-d-next" />Upcoming</span>
          </div>
        </div>
        {loading && !data ? <Skeleton className="h-40 w-full" /> : (
          <div style={{ overflowX: "auto" }}>
            <table className="cf-table">
              <thead>
                <tr>
                  <th>Bid</th>
                  <th>Portal</th>
                  <SortHead label="Submitted" sortKey="submitted_at" sort={sort} dir={dir} onSort={toggleSort} />
                  <SortHead label="Submitted $" sortKey="submitted_price" sort={sort} dir={dir} onSort={toggleSort} numeric />
                  <th>Size</th>
                  <SortHead label="Checkpoints" sortKey="checkpoint" sort={sort} dir={dir} onSort={toggleSort} />
                  <SortHead label="Outcome" sortKey="outcome" sort={sort} dir={dir} onSort={toggleSort} />
                  <SortHead label="Awarded to" sortKey="awarded_amount" sort={sort} dir={dir} onSort={toggleSort} accessibleName="Awarded $" />
                  <th><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={9} style={{ textAlign: "center", color: "var(--cf-text-2)" }}>{filtersActive ? "No award records match these filters." : "No submitted bids yet."}</td></tr>
                ) : pageItems.map((item) => {
                  const note = checkpointNote(item);
                  const hot = item.checkpoint_state === "due" || item.flagged;
                  const under = item.submitted_price && item.awarded_amount != null && item.submitted_price > 0
                    ? Math.round((1 - item.awarded_amount / item.submitted_price) * 100)
                    : null;
                  return (
                    <tr key={item.id} data-testid={`award-row-${item.id}`} style={hot ? { background: "rgba(251,191,36,.035)" } : undefined}>
                      <td>
                        <a className="cf-id" href={`/bids/${item.id}`}>{item.solicitation_number || item.bid_id}</a>
                        <div className="cf-meta">{item.title || "—"}{isAdmin && item.agent_name ? <>{" · "}<span>{item.agent_name}</span></> : null}</div>
                      </td>
                      <td>{item.portal || "—"}</td>
                      <td className="cf-mono" style={{ fontSize: 13 }}>{item.submitted_on || "—"}</td>
                      <td className="cf-num">{formatMoney(item.submitted_price)}</td>
                      <td>{item.size_bucket || "—"}</td>
                      <td>
                        <span style={{ display: "inline-flex", gap: 5, alignItems: "center" }}>
                          {dotStates(item).map((state, index) => <span key={CHECK_DAYS[index]} className={`cf-d ${state === "done" ? "cf-d-done" : state === "due" ? "cf-d-due" : "cf-d-next"}${state === "off" ? " cf-d-off" : ""}`} />)}
                        </span>
                        <div className="cf-mono" style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.05em", marginTop: 5, color: note.color }}>{note.text}</div>
                        <span className="sr-only">{formatCheckpoint(item)}</span>
                      </td>
                      <td>
                        <span className={`cf-pill ${outcomePill(item.award_outcome)}`}>{formatOutcomeLabel(item.award_outcome)}</span>
                        {item.sam_info?.result === "found" && !item.sam_info.applied ? (
                          <span className="sr-only" aria-label="SAM.gov award information available" />
                        ) : null}
                      </td>
                      <td>
                        {item.award_outcome === "won" ? <div style={{ fontWeight: 500, color: "#047857" }}>Us</div> : item.awarded_to ? <div>{item.awarded_to}</div> : <span style={{ color: "var(--cf-text-3)" }}>{item.checkpoint_state === "flagged" ? "No award posted" : "—"}</span>}
                        {item.awarded_amount != null ? (
                          <div className="cf-meta cf-mono">
                            <span>{formatMoney(item.awarded_amount)}</span>
                            {item.award_outcome === "lost" && under != null ? <span>{` · ${Math.abs(under)}% ${under >= 0 ? "UNDER" : "OVER"}`}</span> : null}
                          </div>
                        ) : null}
                      </td>
                      <td>
                        {item.checkpoint_state === "due" ? <button type="button" className="cf-btn cf-btn-primary cf-btn-sm" onClick={() => setSelected(item)}>Update</button> : null}
                        {item.flagged && item.checkpoint_state !== "due" ? <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" onClick={() => setSelected(item)}>Review</button> : null}
                        {item.can_record && item.checkpoint_state !== "due" && !item.flagged ? <button type="button" className="sr-only" onClick={() => setSelected(item)}>Record check</button> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 24px", borderTop: "1px solid var(--cf-line)" }}>
          <span className="cf-mono cf-meta">{items.length === 0 ? "SHOWING 0" : `SHOWING ${(currentPage - 1) * PAGE_SIZE + 1}–${Math.min(currentPage * PAGE_SIZE, items.length)} OF ${items.length}`}</span>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" className="cf-btn cf-btn-secondary" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Previous</button>
            <button type="button" className="cf-btn cf-btn-secondary" disabled={currentPage >= pageCount} onClick={() => setPage(currentPage + 1)}>Next</button>
          </div>
        </div>
      </section>

      {summary && summary.top_competitors.length > 0 && (
        <Card className="cf-card border-0 shadow-none">
          <CardHeader>
            <CardTitle className="cf-h2">Who we lose to</CardTitle>
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
      </PageMain>
    </>
  );
}

function exportAwards(items: AwardTrackingItem[]) {
  const header = ["Solicitation", "Title", "Portal", "Submitted", "Submitted price", "Size", "Outcome", "Awarded to", "Awarded amount"];
  const lines = items.map((item) => [item.solicitation_number || item.bid_id, item.title || "", item.portal || "", item.submitted_on || "", item.submitted_price ?? "", item.size_bucket || "", item.award_outcome, item.awarded_to || "", item.awarded_amount ?? ""]);
  const csv = [header, ...lines].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "award-tracking.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function SortHead({ label, sortKey, sort, dir, onSort, numeric, accessibleName }: {
  label: string; sortKey: SortKey; sort: SortKey; dir: "asc" | "desc"; onSort: (key: SortKey) => void; numeric?: boolean; accessibleName?: string;
}) {
  const active = sort === sortKey;
  const Icon = !active ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={numeric ? "cf-num" : undefined} aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className="cf-lbl" aria-label={accessibleName} style={{ background: "transparent", border: 0, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, color: "inherit" }} onClick={() => onSort(sortKey)}>
        {label}<Icon size={14} aria-hidden />
      </button>
    </th>
  );
}

function FilterSelect({ label, visible, value, onChange, options }: {
  label: string; visible?: string; value: string; onChange: (value: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <div className="cf-flt" style={{ flex: "1 1 140px" }}>
      <span>{visible || label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="cf-select w-full" aria-label={label}><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
