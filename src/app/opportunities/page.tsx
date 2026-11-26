"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Bookmark, Building2, Clock, Inbox, Lock, RefreshCw, Search, Sparkles, Users } from "lucide-react";
import { getStoredUser } from "@/lib/auth";
import { isProductRfq } from "@/lib/ai-suggestion-prefilter";
import { presentOpportunityAvailability, type OpportunityAvailability } from "@/lib/opportunity-availability";
import { opportunityDeadlinePassed } from "@/lib/eastern-date";
import type { SamGovOpportunity } from "@/types/sam-gov";

type SearchMode = "any_words" | "all_words" | "exact_phrase";
type DueKey = "any" | "7" | "30" | "since_day" | "since_week" | "since_month";
type TabKey = "unclaimed" | "suggested" | "all" | "awards";

interface SavedSearch {
  query: string; department: string; mode: SearchMode; due: DueKey; noticeTypes: string[];
  setAside: string; naics: string; psc: string;
  zip: string; state: string; country: string; updated: string; activeOnly: boolean;
}

interface AiSuggestion extends SamGovOpportunity {
  fitScore?: number;
  fitReason?: string;
}

interface SuggestionResult {
  suggestions: AiSuggestion[];
  total_analyzed?: number;
  total_dropped_by_gate?: number;
  total_ai_scored?: number;
  total_with_description?: number;
  threshold?: number;
}

const PAGE_SIZE = 8;
const SAVED_KEY = "cf-saved-searches";
const DUE_LABELS: Record<DueKey, string> = {
  any: "Anytime",
  "7": "Next 7 days",
  "30": "Next 30 days",
  since_day: "From yesterday onward",
  since_week: "From 7 days ago onward",
  since_month: "From one month ago onward",
};

function dueFrom(filter: DueKey) {
  if (filter !== "since_day" && filter !== "since_week" && filter !== "since_month") return null;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  if (filter === "since_month") date.setMonth(date.getMonth() - 1);
  else date.setDate(date.getDate() - (filter === "since_week" ? 7 : 1));
  return date;
}

function matchesQuery(opp: SamGovOpportunity, query: string, mode: SearchMode) {
  if (!query.trim()) return true;
  const searchable = [opp.title, opp.department, opp.ncode, opp.solicitationNumber, opp.classificationCode, opp.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const needle = query.toLowerCase().trim();
  if (mode === "exact_phrase") return searchable.includes(needle);
  const words = needle.split(/\s+/);
  return mode === "all_words" ? words.every((word) => searchable.includes(word)) : words.some((word) => searchable.includes(word));
}

function daysUntil(value?: string) {
  if (!value) return null;
  const due = new Date(value);
  if (Number.isNaN(due.getTime())) return null;
  return Math.ceil((due.getTime() - Date.now()) / 86400000);
}

function formatWhen(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: /^\d{4}-\d{2}-\d{2}$/.test(value) ? "UTC" : "America/New_York" });
}

export default function OpportunitiesPage() {
  return (
    <Suspense fallback={<div className="cf-wrap cf-main">Loading opportunities…</div>}>
      <OpportunityCatalog />
    </Suspense>
  );
}

function OpportunityCatalog() {
  const router = useRouter();
  const requestedView = useSearchParams().get("view");
  const [ready, setReady] = useState(false);
  const [items, setItems] = useState<SamGovOpportunity[]>([]);
  const [availability, setAvailability] = useState<Record<string, OpportunityAvailability>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [query, setQuery] = useState("");
  const [draftQuery, setDraftQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("all_words");
  const [department, setDepartment] = useState("all");
  const [due, setDue] = useState<DueKey>("any");
  const [noticeTypes, setNoticeTypes] = useState<string[]>([]);
  const [setAside, setSetAside] = useState("all");
  const [naics, setNaics] = useState("");
  const [psc, setPsc] = useState("all");
  const [zip, setZip] = useState("");
  const [state, setState] = useState("");
  const [country, setCountry] = useState("");
  const [updated, setUpdated] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [catalogWarning, setCatalogWarning] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>(requestedView === "all" ? "all" : "unclaimed");
  const [page, setPage] = useState(1);
  const [saved, setSaved] = useState<SavedSearch[]>([]);
  const [storageKey, setStorageKey] = useState("");
  const [sort, setSort] = useState<"closing" | "posted" | "fit">("closing");
  const [suggestionResult, setSuggestionResult] = useState<SuggestionResult | null>(null);
  const suggestions = suggestionResult?.suggestions ?? [];
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  useEffect(() => {
    setTab(requestedView === "all" ? "all" : "unclaimed");
    setPage(1);
    setSort("closing");
  }, [requestedView]);

  const catalogRequest = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    catalogRequest.current?.abort();
    const controller = new AbortController();
    catalogRequest.current = controller;
    setLoading(true);
    setPage(1);
    setAvailability({});
    setError(null);
    try {
      const res = await fetch("/api/sam-gov", { cache: "no-store", signal: controller.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load SAM.gov opportunities.");
      const catalog = data as SamGovOpportunity[];
      if (controller.signal.aborted) return;
      const source = res.headers?.get("X-SAM-Gov-Source");
      const fetched = res.headers?.get("X-SAM-Gov-Last-Fetched");
      const fetchedAt = fetched ? new Date(fetched) : null;
      setSyncedAt(fetchedAt && Number.isFinite(+fetchedAt) ? fetchedAt : null);
      setCatalogWarning(source === "stale"
        ? "Showing cached notices. SAM.gov could not be refreshed."
        : source === "unavailable" ? "The SAM.gov catalog is temporarily unavailable."
        : source === "partial" ? "SAM.gov returned a partial set of notices." : null);
      setItems(catalog);
      const checked: Record<string, OpportunityAvailability> = {};
      for (let offset = 0; offset < catalog.length; offset += 1000) {
        const availabilityResponse = await fetch("/api/backend/opportunities/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            opportunities: catalog.slice(offset, offset + 1000).map((item) => ({
              external_notice_id: item.id,
              solicitation_number: item.solicitationNumber || item.id,
              source: "SAM.GOV", ncode: item.ncode, naics_description: item.naicsDescription,
            })),
          }),
        });
        const result = await availabilityResponse.json();
        if (!availabilityResponse.ok) throw new Error(result.error || "Unable to check availability.");
        for (const row of result.opportunities || []) checked[row.external_notice_id] = row;
      }
      if (controller.signal.aborted) return;
      setAvailability(checked);
    } catch (err) {
      if (controller.signal.aborted) return;
      setAvailability({});
      setError(err instanceof Error ? err.message : "Unable to load opportunities.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) {
      router.replace("/register");
      return;
    }
    setReady(true);
    try {
      const key = [SAVED_KEY, user.company_id, user.id].join(":");
      setStorageKey(key);
      const stored = JSON.parse(window.localStorage.getItem(key) || "[]");
      if (Array.isArray(stored)) {
        setSaved(stored
          .filter((item) => item && typeof item.query === "string" && Array.isArray(item.noticeTypes))
          .map(({ portal: _legacyPortal, ...search }) => search));
      }
    } catch {
      setSaved([]);
    }
    void load();
    return () => catalogRequest.current?.abort();
  }, [load, router]);

  const options = useMemo(() => {
    const departments = new Set<string>();
    const types = new Set<string>();
    const setAsides = new Set<string>();
    const pscs = new Set<string>();
    items.forEach((item) => {
      if (item.department && item.department !== "N/A") departments.add(item.department);
      if (item.type) types.add(item.type);
      if (item.setAside) setAsides.add(item.setAside);
      if (item.classificationCode) pscs.add(item.classificationCode);
    });
    return {
      departments: Array.from(departments).sort(),
      types: Array.from(types).sort(),
      setAsides: Array.from(setAsides).sort(),
      pscs: Array.from(pscs).sort(),
    };
  }, [items]);

  const filtered = useMemo(() => {
    const earliestDue = dueFrom(due);
    return items.filter((item) => {
      if (!matchesQuery(item, query, mode)) return false;
      if (zip.trim() && item.location?.zip !== zip.trim()) return false;
      if (state && item.location?.state?.name !== state) return false;
      if (country && item.location?.country?.name !== country) return false;
      if (updated && (!item.postedDate || new Date(item.postedDate).getTime() < Date.now() - Number(updated) * 86400000)) return false;
      if (activeOnly && !(item.active ?? ((daysUntil(item.closingDate) ?? -1) >= 0))) return false;
      if (department !== "all" && item.department !== department) return false;
      if (noticeTypes.length && !noticeTypes.includes(item.type)) return false;
      if (setAside !== "all" && item.setAside !== setAside) return false;
      if (naics.trim() && !(item.ncode || "").toLowerCase().includes(naics.trim().toLowerCase())) return false;
      if (psc !== "all" && item.classificationCode !== psc) return false;
      const remaining = daysUntil(item.closingDate);
      if (earliestDue) {
        const deadline = new Date(/^\d{4}-\d{2}-\d{2}$/.test(item.closingDate) ? item.closingDate + "T00:00:00" : item.closingDate);
        if (Number.isNaN(deadline.getTime()) || deadline < earliestDue) return false;
      }
      if (due === "7" && (remaining == null || remaining < 0 || remaining > 7)) return false;
      if (due === "30" && (remaining == null || remaining < 0 || remaining > 30)) return false;
      return true;
    });
  }, [department, due, items, mode, naics, noticeTypes, psc, query, setAside, zip, state, country, updated, activeOnly]);

  const inPool = (item: SamGovOpportunity) => {
    const row = availability[item.id];
    return row && presentOpportunityAvailability(row).state === "available" && !opportunityDeadlinePassed(item.closingDate);
  };
  const unclaimed = filtered.filter(inPool);
  const closeSoon = unclaimed.filter((item) => {
    const remaining = daysUntil(item.closingDate);
    return remaining != null && remaining >= 0 && remaining <= 7;
  }).length;
  const filteredIds = new Set(filtered.map((item) => item.id));
  const listed = tab === "unclaimed" ? unclaimed : tab === "suggested" ? suggestions.filter((item) => filteredIds.has(item.id)) : filtered;
  const visible = [...listed].sort((left, right) => {
    if (tab === "suggested" && sort === "fit") {
      return ((right as AiSuggestion).fitScore ?? 0) - ((left as AiSuggestion).fitScore ?? 0);
    }
    const leftKey = sort === "posted" ? left.postedDate || "" : left.closingDate || "9999";
    const rightKey = sort === "posted" ? right.postedDate || "" : right.closingDate || "9999";
    return sort === "posted" ? rightKey.localeCompare(leftKey) : leftKey.localeCompare(rightKey);
  });
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageItems = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const minutesAgo = syncedAt ? Math.max(0, Math.round((Date.now() - syncedAt.getTime()) / 60000)) : null;

  const loadSuggestions = useCallback(async () => {
    if (loading || !items.length || suggesting) return;
    setSuggesting(true);
    setSuggestError(null);
    try {
      const res = await fetch("/api/sam-gov/ai-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunities: items.filter(isProductRfq) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load suggestions.");
      setSuggestionResult({ ...data, suggestions: data.suggestions ?? [] });
      setPage(1);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "Unable to load suggestions.");
    } finally {
      setSuggesting(false);
    }
  }, [items, loading, suggesting]);

  useEffect(() => {
    if (tab === "suggested" && !suggestionResult && !suggestError) void loadSuggestions();
  }, [tab, suggestionResult, suggestError, loadSuggestions]);

  const saveSearch = () => {
    const next: SavedSearch = { query: draftQuery.trim(), department, mode, due, noticeTypes, setAside, naics, psc, zip, state, country, updated, activeOnly };
    setQuery(next.query);
    setPage(1);
    const identical = JSON.stringify(next);
    const searches = [next, ...saved.filter((item) => JSON.stringify(item) !== identical)].slice(0, 8);
    setSaved(searches);
    window.localStorage.setItem(storageKey, JSON.stringify(searches));
  };

  const clearFilters = () => {
    setQuery("");
    setDraftQuery("");
    setZip(""); setCountry(""); setState(""); setUpdated(""); setActiveOnly(false);
    setMode("all_words");
    setDepartment("all");
    setDue("any");
    setNoticeTypes([]);
    setSetAside("all");
    setNaics("");
    setPsc("all");
    setPage(1);
  };

  if (!ready) return <div className="cf-wrap cf-main">Loading...</div>;

  return (
    <>
      <section className="cf-band">
        <div className="cf-wrap cf-band-in" style={{ alignItems: "stretch", flexDirection: "column", flexWrap: "nowrap" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div className="cf-eyebrow">SAM.gov</div>
              <h1 className="cf-h1">Opportunities</h1>
              <p className="cf-lead">Browse open solicitations from the SAM.gov catalog.</p>
            </div>
            <button className="cf-btn cf-btn-secondary" type="button" onClick={load} disabled={loading}>
              <RefreshCw size={16} strokeWidth={1.75} />
              Refresh · <span className="cf-mono" style={{ fontSize: 12 }}>{minutesAgo == null ? "no refresh time" : `fetched ${minutesAgo} min ago`}</span>
            </button>
          </div>
          <form
            className="cf-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              setQuery(draftQuery);
              setPage(1);
            }}
          >
            <label htmlFor="opp-q" className="sr-only">Search opportunities</label>
            <div style={{ flex: "999 1 420px", position: "relative", display: "flex", height: 48, alignItems: "center" }}>
              <Search size={20} strokeWidth={1.75} color="#0891B2" aria-hidden style={{ position: "absolute", left: 14, top: 14 }} />
              <input id="opp-q" className="cf-search-input" type="search" placeholder="Search by keyword, solicitation number or NSN" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} />
            </div>
            <button className="cf-btn cf-btn-primary" type="submit" style={{ minHeight: 48, padding: "0 28px", fontSize: 15 }}>Search</button>
          </form>
          {saved.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <span className="cf-lbl" style={{ marginRight: 4 }}>Saved searches</span>
              {saved.map((item) => (
                <button key={JSON.stringify(item)} type="button" className="cf-tag" onClick={() => {
                  setQuery(item.query); setDraftQuery(item.query); setDepartment(item.department); setMode(item.mode);
                  setDue(item.due); setNoticeTypes(item.noticeTypes); setSetAside(item.setAside); setNaics(item.naics);
                  setPsc(item.psc); setZip(item.zip); setState(item.state); setCountry(item.country);
                  setUpdated(item.updated); setActiveOnly(item.activeOnly); setPage(1);
                }}>{[item.query, item.department !== "all" && item.department, item.zip, item.state, item.country, item.naics, item.psc !== "all" && item.psc, ...item.noticeTypes, item.setAside !== "all" && item.setAside, item.due !== "any" && DUE_LABELS[item.due], item.updated && "Updated in " + item.updated + " days", item.activeOnly && "Active"].filter(Boolean).join(" · ") || "All opportunities"}</button>
              ))}
            </div>
          ) : null}
        </div>
      </section>
      <main className="cf-wrap cf-main">
        {error ? <div role="alert" style={{ border: "1px solid rgba(251,191,36,.45)", background: "rgba(251,191,36,.12)", color: "#B45309", borderRadius: 12, padding: "12px 16px" }}>{error}</div> : null}
        <section className="cf-grid-kpi" aria-label="Pool summary">
          <div className="cf-card cf-kpi cf-kpi-hero" style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <div><div className="cf-kpi-v">{loading ? "—" : unclaimed.length}</div><div className="cf-lbl" style={{ marginTop: 8, color: "#0E7490" }}>Unclaimed</div></div>
            <Inbox size={34} strokeWidth={1.4} color="#0891B2" />
          </div>
          <div className="cf-card cf-kpi" style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <div><div className="cf-kpi-v">{loading ? "—" : closeSoon}</div><div className="cf-lbl" style={{ marginTop: 8 }}>Close in 7 days</div></div>
            <Clock size={34} strokeWidth={1.4} color="#94A3B8" />
          </div>
          <div className="cf-card cf-kpi" style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <div><div className="cf-kpi-v">{suggestionResult ? suggestions.length : "—"}</div><div className="cf-lbl" style={{ marginTop: 8 }}>AI suggestions</div></div>
            <Sparkles size={34} strokeWidth={1.4} color="#94A3B8" />
          </div>
          <div className="cf-card cf-kpi" style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <div><div className="cf-kpi-v">—</div><div className="cf-lbl" style={{ marginTop: 8 }}>Picked up today</div></div>
            <Users size={34} strokeWidth={1.4} color="#94A3B8" />
          </div>
        </section>

        {catalogWarning && <p role="status" className="cf-banner cf-banner-warn">{catalogWarning}</p>}
        <nav aria-label="Opportunity lists" style={{ display: "flex", flexWrap: "wrap", gap: 28, borderBottom: "1px solid var(--cf-line)" }}>
          {([
            ["unclaimed", "Unclaimed", String(unclaimed.length)],
            ["suggested", "AI suggestions", suggestionResult ? String(suggestions.length) : ""],
            ["all", "All SAM.gov", ""],
            ["awards", "Contract awards", ""],
          ] as const).map(([key, label, count]) => (
            <button key={key} type="button" className={`cf-tab${tab === key ? " cf-tab-on" : ""}`} aria-current={tab === key ? "page" : undefined} onClick={() => {
              if (key === tab) return;
              setTab(key);
              setPage(1);
              setSort(key === "suggested" ? "fit" : "closing");
            }}>
              {label}{count ? <span className="cf-count" style={key === "unclaimed" ? { color: "#0E7490", background: "rgba(34,211,238,.1)" } : undefined}>{count}</span> : null}
            </button>
          ))}
        </nav>

        {tab === "awards" ? (
          <section className="cf-card" style={{ padding: 24 }}>
            <h2 className="cf-h2">Contract awards</h2>

            <Link className="cf-btn cf-btn-primary" href="/contract-awards" style={{ marginTop: 16 }}>Open contract awards</Link>
          </section>
        ) : (
          <div className="cf-split" style={{ alignItems: "flex-start" }}>
            <aside className="cf-card" aria-labelledby="filters-h" style={{ flex: "1 1 260px", maxWidth: "100%", padding: "18px 20px 20px", display: "flex", flexDirection: "column", gap: 18, boxSizing: "border-box" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <h2 id="filters-h" className="cf-h2" style={{ fontSize: 16 }}>Filters</h2>
                <button type="button" className="cf-link" onClick={clearFilters} style={{ background: "transparent", border: 0, cursor: "pointer", fontSize: 13 }}>Clear all</button>
              </div>
              <div className="cf-field">
                <span className="cf-lab">Keyword match</span>
                <div className="cf-match" role="group" aria-label="Keyword match">
                  {([
                    ["any_words", "Any"],
                    ["all_words", "All words"],
                    ["exact_phrase", "Exact"],
                  ] as const).map(([key, label]) => (
                    <button key={key} type="button" aria-pressed={mode === key} onClick={() => { setMode(key); setPage(1); }}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="cf-field"><label htmlFor="opp-dept">Department</label>
                <select id="opp-dept" className="cf-select" value={department} onChange={(event) => { setDepartment(event.target.value); setPage(1); }}>
                  <option value="all">All departments</option>
                  {options.departments.map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              <div className="cf-field"><label htmlFor="opp-due">Response due</label>
                <select id="opp-due" className="cf-select" value={due} onChange={(event) => { setDue(event.target.value as DueKey); setPage(1); }}>
                  {(["any", "7", "30", "since_day", "since_week", "since_month"] as const).map((value) => (
                    <option key={value} value={value}>{DUE_LABELS[value]}</option>
                  ))}
                </select>
              </div>
              <div className="cf-field">
                <span className="cf-lab">Notice type</span>
                {options.types.map((type) => (
                  <label key={type} className="cf-check">
                    <input type="checkbox" checked={noticeTypes.includes(type)} onChange={() => { setNoticeTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]); setPage(1); }} />
                    {type}
                  </label>
                ))}
              </div>
              <div className="cf-field"><label htmlFor="opp-sa">Set-aside</label>
                <select id="opp-sa" className="cf-select" value={setAside} onChange={(event) => { setSetAside(event.target.value); setPage(1); }}>
                  <option value="all">All set-asides</option>
                  {options.setAsides.map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              <div className="cf-field"><label htmlFor="opp-naics">NAICS code</label>
                <input id="opp-naics" className="cf-input" value={naics} placeholder="e.g. 332722" onChange={(event) => { setNaics(event.target.value); setPage(1); }} />
              </div>
              <div className="cf-field"><label htmlFor="opp-psc">Product / service code</label>
                <select id="opp-psc" className="cf-select" value={psc} onChange={(event) => { setPsc(event.target.value); setPage(1); }}>
                  <option value="all">All PSC codes</option>
                  {options.pscs.map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              <label className="cf-field">Updated date
                <select className="cf-select" value={updated} onChange={e => { setUpdated(e.target.value); setPage(1); }}>
                  <option value="">Any time</option><option value="1">Past day</option><option value="7">Past week</option><option value="30">Past month</option>
                </select>
              </label>
              <label className="cf-field">ZIP code<input className="cf-input" value={zip} onChange={e => { setZip(e.target.value); setPage(1); }} /></label>
              <label className="cf-field">State / territory<select className="cf-select" value={state} onChange={e => { setState(e.target.value); setPage(1); }}>
                <option value="">All states</option>{Array.from(new Set(items.map(i => i.location?.state?.name).filter(Boolean))).sort().map(v => <option key={v}>{v}</option>)}
              </select></label>
              <label className="cf-field">Country<select className="cf-select" value={country} onChange={e => { setCountry(e.target.value); setPage(1); }}>
                <option value="">All countries</option>{Array.from(new Set(items.map(i => i.location?.country?.name).filter(Boolean))).sort().map(v => <option key={v}>{v}</option>)}
              </select></label>
              <label className="cf-check"><input type="checkbox" checked={activeOnly} onChange={e => { setActiveOnly(e.target.checked); setPage(1); }} />Active notices only</label>
              <button className="cf-btn cf-btn-secondary" type="button" onClick={saveSearch} style={{ width: "100%" }}><Bookmark size={16} strokeWidth={1.75} />Save this search</button>
            </aside>

            <section aria-label="Results" style={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              {tab === "suggested" && (
                <div className="cf-card flex flex-wrap items-center justify-between gap-3 p-4">
                  <div>
                    <h2 className="cf-h2">Recommended opportunities</h2>
                    {suggestionResult?.total_analyzed != null ? (
                      <p className="cf-sub">{suggestions.length} {suggestions.length === 1 ? "match" : "matches"} from {suggestionResult.total_analyzed} sent for screening.</p>
                    ) : null}
                    {suggestionResult?.total_ai_scored != null && suggestionResult.total_dropped_by_gate != null ? (
                      <p className="cf-meta">{suggestionResult.total_ai_scored} scored by AI · {suggestionResult.total_dropped_by_gate} excluded by screening rules.</p>
                    ) : null}
                    {suggestionResult?.total_with_description != null && (
                      <p className="cf-meta">{suggestionResult.total_with_description} shortlisted with notice description text.</p>
                    )}
                  </div>
                  <button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" onClick={loadSuggestions} disabled={loading || suggesting || !items.length}>
                    {suggesting ? "Analyzing…" : suggestError ? "Retry AI suggestions" : suggestionResult ? "Refresh suggestions" : "Get AI suggestions"}
                  </button>
                </div>
              )}
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 14, color: "var(--cf-text-2)" }}>{loading || suggesting ? "Loading…" : <><strong className="cf-mono" style={{ color: "var(--cf-text)" }}>{visible.length}</strong> {tab === "unclaimed" ? "unclaimed" : "results"} · showing {visible.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, visible.length)}` : "0"}</>}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <label htmlFor="opp-sort" className="cf-lbl">Sort by</label>
                  <select id="opp-sort" className="cf-select" style={{ width: "auto", minWidth: 220 }} value={tab !== "suggested" && sort === "fit" ? "closing" : sort} onChange={(event) => { setSort(event.target.value as typeof sort); setPage(1); }}>
                    {tab === "suggested" && <option value="fit">Highest AI fit</option>}
                    <option value="closing">Closing date (soonest)</option>
                    <option value="posted">Recently posted</option>
                  </select>
                </div>
              </div>
              {tab === "suggested" && suggestError ? <div role="alert" className="cf-banner cf-banner-bad">{suggestError}</div> : null}
              {!loading && !suggesting && pageItems.length === 0 && !(tab === "suggested" && suggestError) ? (
                <div className="cf-card" style={{ padding: 28, textAlign: "center" }}>
                  <h2 className="cf-h2">No matching opportunities</h2>
                  {tab === "suggested" && suggestionResult && suggestions.length === 0 ? (
                    <p className="cf-sub">No recommendations met the {suggestionResult.threshold ?? 60}% fit threshold.</p>
                  ) : <p className="cf-sub">Try another keyword or clear the filters.</p>}
                </div>
              ) : (
              <div className="cf-card cf-result-list">
              {pageItems.map((item) => {
                const claim = availability[item.id];
                const claimed = claim && claim.available === false;
                const remaining = daysUntil(item.closingDate);
                const expired = opportunityDeadlinePassed(item.closingDate);
                const { fitReason, fitScore } = item as AiSuggestion;
                const location = [item.location?.city?.name, item.location?.state?.name, item.location?.country?.name].filter(Boolean).join(", ");
                return (
                  <article key={item.id} className="cf-result" style={claimed ? { background: "rgba(255,255,255,.6)" } : undefined}>
                    <span className="cf-res-ico" style={claimed ? { background: "var(--cf-surface-3)", borderColor: "var(--cf-line-2)", color: "var(--cf-text-3)" } : undefined}>
                      {claimed ? <Lock size={22} strokeWidth={1.4} /> : <Building2 size={22} strokeWidth={1.4} />}
                    </span>
                    <div style={{ flex: "1 1 360px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                      <Link href={`/sam-gov/${encodeURIComponent(item.id)}`} style={{ font: "500 17px var(--cf-display)", color: "var(--cf-text)", textDecoration: "none" }}>{item.title || "Untitled"}</Link>
                      <div style={{ font: "400 12px var(--cf-mono)", color: "var(--cf-text-3)", letterSpacing: "0.02em" }}>{(item.solicitationNumber || item.id).toUpperCase()} · {(item.department || "—").toUpperCase()} · SAM.GOV</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {claimed ? <span className="cf-pill cf-pill-pool">{presentOpportunityAvailability(claim).label}</span> : (
                          <>
                            {item.ncode ? <span className="cf-tag">NAICS {item.ncode}{item.naicsDescription ? ` · ${item.naicsDescription}` : ""}</span> : null}
                            {item.type ? <span className="cf-tag">{item.type}</span> : null}
                            {item.setAside ? <span className="cf-tag">{item.setAside}</span> : null}
                          </>
                        )}
                        {fitScore != null ? <span className="cf-tag cf-tag-hit">{fitScore}% AI fit</span> : null}
                        {location ? <span className="cf-tag">{location}</span> : null}
                      </div>
                      {fitReason ? (
                        <details>
                          <summary className="cf-link cursor-pointer">Why this matches</summary>
                          <p className="cf-sub">{fitReason}</p>
                        </details>
                      ) : null}
                    </div>
                    <div style={{ minWidth: 130, display: "flex", flexDirection: "column", gap: 3 }}>
                      <span className="cf-lbl">Closes</span>
                      <span style={{ fontWeight: 500, color: claimed ? "var(--cf-text-2)" : "var(--cf-text)" }}>{formatWhen(item.closingDate)}</span>
                      <span className="cf-mono" style={{ fontSize: 12, fontWeight: 500, color: !claimed && remaining != null && remaining >= 0 && remaining <= 8 ? "#BE123C" : "var(--cf-text-2)" }}>{expired ? "CLOSED" : remaining == null ? "" : `${Math.max(0, remaining)} DAYS LEFT`}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {item.link ? <a className="cf-btn cf-btn-secondary" href={item.link} target="_blank" rel="noreferrer">SAM.gov ↗</a> : null}
                      {expired ? <span className="cf-pill cf-pill-pool">Deadline passed</span> : !claim ? <span className="cf-meta">Availability unknown</span> : claimed ? <button className="cf-btn cf-btn-secondary" type="button" disabled style={{ background: "var(--cf-surface-3)", color: "var(--cf-text-3)", cursor: "not-allowed" }}>Claimed</button> : <Link className="cf-btn cf-btn-primary" href={`/sam-gov/${encodeURIComponent(item.id)}`}>Pick up</Link>}
                    </div>
                  </article>
                );
              })}
              </div>
              )}
              {pageCount > 1 ? (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
                  <button className="cf-btn cf-btn-secondary" disabled={page <= 1} onClick={() => setPage(current => Math.max(1, current - 1))}>Previous</button>
                  {Array.from({ length: Math.min(5, pageCount) }, (_, i) => Math.max(1, Math.min(page - 2, pageCount - 4)) + i).map((number) => (
                    <button key={number} type="button" className={`cf-btn ${number === page ? "cf-btn-primary" : "cf-btn-secondary"}`} onClick={() => setPage(number)} aria-current={number === page ? "page" : undefined}>{number}</button>
                  ))}
                  <button className="cf-btn cf-btn-secondary" disabled={page >= pageCount} onClick={() => setPage(current => Math.min(pageCount, current + 1))}>Next</button>
                </div>
              ) : null}
            </section>
          </div>
        )}
      </main>
    </>
  );
}
