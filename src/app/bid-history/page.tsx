"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Download } from "lucide-react";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { AdminTabs, PageBand, PageMain } from "@/components/design/PageFrame";
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
  const [sort, setSort] = useState("recent");
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

  const orderedItems = useMemo(() => sort === "due"
    ? [...items].sort((left, right) =>
        (left.due_date || "9999-12-31").localeCompare(right.due_date || "9999-12-31") || right.id - left.id)
    : items, [items, sort]);

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
      <PageMain>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </PageMain>
    );
  }

  return (
    <>
      <PageBand
        eyebrow={`ADMIN · ${items.length} BIDS LOGGED`}
        title="Bid history & pipeline"
        lead="Browse and filter the company’s logged bids."
        actions={(
          <button type="button" className="cf-btn cf-btn-secondary" onClick={() => exportHistory(orderedItems)}>
            <Download size={16} strokeWidth={1.75} />Export CSV
          </button>
        )}
      />
      <AdminTabs current="/bid-history" />
      <PageMain>
      {error && <div role="alert" className="cf-banner cf-banner-bad">{error}</div>}
      {items.some((item) => item.internal_status === "Waiting Approval") ? (
        <section className="cf-card" aria-labelledby="appr-h" style={{ borderColor: "rgba(251,191,36,.4)", background: "linear-gradient(180deg, rgba(251,191,36,.05), transparent 50%), var(--cf-surface)" }}>
          <div style={{ padding: "16px 24px 8px", display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h2 id="appr-h" className="cf-h2">{items.filter((item) => item.internal_status === "Waiting Approval").length} bids waiting for your approval</h2>
          </div>
          <ul style={{ listStyle: "none", margin: 0, padding: "0 24px 8px" }}>
            {items.filter((item) => item.internal_status === "Waiting Approval").slice(0, 4).map((item) => (
              <li key={item.id} style={{ display: "flex", flexWrap: "wrap", gap: "12px 24px", alignItems: "center", padding: "14px 0", borderTop: "1px solid var(--cf-line)" }}>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ font: "500 16px var(--cf-display)" }}>{item.title || item.bid_id}{(item.expected_submitted_price || 0) >= 500000 ? <span className="cf-tag" style={{ marginLeft: 8 }}> $500K+</span> : null}</div>
                  <div className="cf-mono cf-meta" style={{ marginTop: 4 }}>{item.solicitation_number || item.bid_id} · {(item.portal || "—").toUpperCase()} · {item.agent_name || "—"}</div>
                </div>
                <Link className="cf-btn cf-btn-primary cf-btn-sm" href={`/approvals?bid=${item.id}`}>Review & approve</Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <section className="cf-card" aria-labelledby="all-h" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", display: "flex", flexDirection: "column", gap: 14, borderBottom: "1px solid var(--cf-line)" }}>
          <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div>
              <h2 id="all-h" className="cf-h2">All logged bids</h2>
              <p className="cf-sub">{loading ? "Loading…" : `${items.length} bids`}</p>
            </div>
            <div className="cf-seg-wrap" role="group" aria-label="Bid history view">
              <Link className="cf-seg" href="/agent-bid-data">By person</Link>
            </div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "flex-end" }}>
            <div className="cf-flt" style={{ flex: "2 1 240px" }}>
              <label htmlFor="bh-q">Search</label>
              <input id="bh-q" className="cf-input" type="search" aria-label="Search bids" placeholder="Solicitation, title or agent" value={search} onChange={(event) => setSearch(event.target.value)} />
            </div>
            <FilterSelect label="Portal" value={portal} onChange={setPortal} options={[{ value: ALL, label: "All portals" }, ...portals.map((name) => ({ value: name, label: name }))]} />
            <FilterSelect label="Agent" value={agent} onChange={setAgent} options={[{ value: ALL, label: "All agents" }, ...agents.map((person) => ({ value: String(person.user_id), label: person.name }))]} />
            <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: ALL, label: "All statuses" }, ...statuses.map((name) => ({ value: name, label: formatStatus(name) }))]} />
            <FilterSelect label="Outcome" value={outcome} onChange={setOutcome} options={[{ value: ALL, label: "All outcomes" }, { value: "won", label: formatOutcome("won") }, { value: "lost", label: formatOutcome("lost") }, { value: "pending", label: formatOutcome("pending") }, { value: "no_quote", label: "No quote" }]} />
            <FilterSelect label="Size" value={size} onChange={setSize} options={[{ value: ALL, label: "All sizes" }, { value: "lte_50k", label: "≤ $50k" }, { value: "gte_50k", label: "≥ $50k" }, { value: "gte_100k", label: "≥ $100k" }]} />
            <FilterSelect label="Sort by" value={sort} onChange={setSort} options={[{ value: "recent", label: "Most recent" }, { value: "due", label: "Due soonest" }]} />
            <div className="cf-flt" style={{ flex: "1 1 150px" }}><label htmlFor="bh-f">Assigned from</label><input id="bh-f" className="cf-date" type="date" aria-label="Assign from" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} /></div>
            <div className="cf-flt" style={{ flex: "1 1 150px" }}><label htmlFor="bh-t">Assigned to</label><input id="bh-t" className="cf-date" type="date" aria-label="Assign to" value={dateTo} onChange={(event) => setDateTo(event.target.value)} /></div>
          </div>
        </div>
        {loading ? <Skeleton className="h-40 w-full" /> : (
          <PipelineTable items={orderedItems} variant="ledger" empty={filtersActive ? "No bids match these filters." : "No bids have been logged yet."} />
        )}
      </section>
      </PageMain>
    </>
  );
}

function exportHistory(items: PipelineItem[]) {
  const header = ["Solicitation", "Title", "Portal", "Agent", "Status", "Cost", "Price", "Gross profit", "Assigned", "Due", "Outcome"];
  const lines = items.map((item) => [item.solicitation_number || item.bid_id, item.title || "", item.portal || "", item.agent_name || "", item.internal_status, item.supplier_cost ?? "", item.submitted_price ?? item.expected_submitted_price ?? "", item.gross_profit ?? "", item.assign_date || "", item.due_date || "", item.award_outcome || item.outcome || ""]);
  const csv = [header, ...lines].map((row) => row.map((cell) => `"${String(cell).replace(/"/g, "\"\"")}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "bid-history.csv";
  link.click();
  URL.revokeObjectURL(url);
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
    <div className="cf-flt" style={{ flex: "1 1 140px" }}>
      <span>{label}</span>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="cf-select w-full" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
      </Select>
    </div>
  );
}
