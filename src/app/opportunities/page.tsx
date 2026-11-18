"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bookmark, Building2, Clock, Inbox, Lock, RefreshCw, Search, Sparkles, Users } from "lucide-react";
import { getStoredUser } from "@/lib/auth";
import { isProductRfq } from "@/lib/ai-suggestion-prefilter";
import type { OpportunityAvailability } from "@/lib/opportunity-availability";
import type { SamGovOpportunity } from "@/types/sam-gov";

type SearchMode = "any_words" | "all_words" | "exact_phrase";
type DueKey = "any" | "7" | "30";
type TabKey = "unclaimed" | "suggested" | "all" | "awards";

interface AiSuggestion extends SamGovOpportunity {
  fitScore?: number;
  fitReason?: string;
}

const PAGE_SIZE = 8;
const SAVED_KEY = "cf-saved-searches";

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
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" });
}

export default function OpportunitiesPage() {
  const router = useRouter();
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
  const [tab, setTab] = useState<TabKey>("unclaimed");
  const [page, setPage] = useState(1);
  const [saved, setSaved] = useState<string[]>([]);
  const [searched, setSearched] = useState(false);
  const [portal, setPortal] = useState("all");
  const [sort, setSort] = useState<"closing" | "posted">("closing");
  const [suggestions, setSuggestions] = useState<AiSuggestion[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestError, setSuggestError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sam-gov", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Unable to load SAM.gov opportunities.");
      const catalog = data as SamGovOpportunity[];
      setItems(catalog);
      setSyncedAt(new Date());
      if (catalog.length) {
        const availabilityResponse = await fetch("/api/backend/opportunities/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            opportunities: catalog.slice(0, 1000).map((item) => ({
              external_notice_id: item.id,
              solicitation_number: item.solicitationNumber || item.id,
              source: "SAM.GOV",
            })),
          }),
        });
        if (availabilityResponse.ok) {
          const availabilityData = await availabilityResponse.json();
          setAvailability(Object.fromEntries((availabilityData.opportunities || []).map((item: OpportunityAvailability & { external_notice_id: string }) => [item.external_notice_id, item])));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load opportunities.");
    } finally {
      setLoading(false);
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
      const stored = JSON.parse(window.localStorage.getItem(SAVED_KEY) || "[]");
      if (Array.isArray(stored)) setSaved(stored.filter((item) => typeof item === "string"));
    } catch {
      setSaved([]);
    }
    load();
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
    return items.filter((item) => {
      if (!matchesQuery(item, query, mode)) return false;
      if (department !== "all" && item.department !== department) return false;
      if (noticeTypes.length && !noticeTypes.includes(item.type)) return false;
      if (setAside !== "all" && item.setAside !== setAside) return false;
      if (naics.trim() && !(item.ncode || "").toLowerCase().includes(naics.trim().toLowerCase())) return false;
      if (psc !== "all" && item.classificationCode !== psc) return false;
      if (portal !== "all" && portal !== "SAM.gov") return false;
      const remaining = daysUntil(item.closingDate);
      if (due === "7" && (remaining == null || remaining < 0 || remaining > 7)) return false;
      if (due === "30" && (remaining == null || remaining < 0 || remaining > 30)) return false;
      return true;
    });
  }, [department, due, items, mode, naics, noticeTypes, portal, psc, query, setAside]);

  const inPool = (item: SamGovOpportunity) => {
    const row = availability[item.id];
    if (!row || row.available) return true;
    const state = row.availability_state ?? "claimed";
    return state === "claimed" || state === "available";
  };
  const unclaimed = filtered.filter(inPool);
  const closeSoon = unclaimed.filter((item) => {
    const remaining = daysUntil(item.closingDate);
    return remaining != null && remaining >= 0 && remaining <= 7;
  }).length;
  const listed = tab === "unclaimed" ? unclaimed : tab === "suggested" ? suggestions.filter((item) => matchesQuery(item, query, mode)) : filtered;
  const visible = [...listed].sort((left, right) => {
    const leftKey = sort === "posted" ? left.postedDate || "" : left.closingDate || "9999";
    const rightKey = sort === "posted" ? right.postedDate || "" : right.closingDate || "9999";
    return sort === "posted" ? rightKey.localeCompare(leftKey) : leftKey.localeCompare(rightKey);
  });
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const pageItems = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const minutesAgo = syncedAt ? Math.max(0, Math.round((Date.now() - syncedAt.getTime()) / 60000)) : null;

  const loadSuggestions = async () => {
    if (!items.length || suggesting) return;
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
      setSuggestions(data.suggestions || []);
    } catch (err) {
      setSuggestError(err instanceof Error ? err.message : "Unable to load suggestions.");
    } finally {
      setSuggesting(false);
    }
  };

  const saveSearch = () => {
    const next = query.trim();
    if (!next || saved.includes(next)) return;
    const updated = [next, ...saved].slice(0, 8);
    setSearched(true);
    setSaved(updated);
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(updated));
  };

  const clearFilters = () => {
    setQuery("");
    setDraftQuery("");
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
              <div className="cf-eyebrow">SAM.gov · SEPTA · Unison · Nassau County</div>
              <h1 className="cf-h1">Opportunities</h1>
              <p className="cf-lead">Open solicitations from the current SAM.gov catalog. Other portals stay on their existing pages.</p>
            </div>
            <button className="cf-btn cf-btn-secondary" type="button" onClick={load} disabled={loading}>
              <RefreshCw size={16} strokeWidth={1.75} />
              Refresh · <span className="cf-mono" style={{ fontSize: 12 }}>{minutesAgo == null ? "not synced" : `synced ${minutesAgo} min ago`}</span>
            </button>
          </div>
          <form
            className="cf-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              setQuery(draftQuery);
              setSearched(Boolean(draftQuery.trim()));
              setPage(1);
            }}
          >
            <label htmlFor="opp-q" className="sr-only">Search opportunities</label>
            <div style={{ flex: "999 1 420px", position: "relative", display: "flex", height: 48, alignItems: "center" }}>
              <Search size={20} strokeWidth={1.75} color="#0891B2" aria-hidden style={{ position: "absolute", left: 14, top: 14 }} />
              <input id="opp-q" className="cf-search-input" type="search" placeholder="Search by keyword, solicitation number or NSN" value={draftQuery} onChange={(event) => setDraftQuery(event.target.value)} />
            </div>
            <label htmlFor="opp-portal" className="sr-only">Portal</label>
            <select id="opp-portal" className="cf-select cf-search-portal" value={portal} onChange={(event) => { setPortal(event.target.value); setPage(1); }}>
              <option value="all">All portals</option>
              <option>SAM.gov</option>
              <option>SEPTA</option>
              <option>Unison</option>
              <option>Nassau County</option>
            </select>
            <button className="cf-btn cf-btn-primary" type="submit" style={{ minHeight: 48, padding: "0 28px", fontSize: 15 }}>Search</button>
          </form>
          {searched && saved.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              <span className="cf-lbl" style={{ marginRight: 4 }}>Saved searches</span>
              {saved.map((item) => (
                <button key={item} type="button" className="cf-tag" onClick={() => { setQuery(item); setDraftQuery(item); setPage(1); }}>{item}</button>
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
            <div><div className="cf-kpi-v">{suggestions.length}</div><div className="cf-lbl" style={{ marginTop: 8 }}>Suggested for you</div></div>
            <Sparkles size={34} strokeWidth={1.4} color="#94A3B8" />
          </div>
          <div className="cf-card cf-kpi" style={{ flexDirection: "row", justifyContent: "space-between" }}>
            <div><div className="cf-kpi-v">—</div><div className="cf-lbl" style={{ marginTop: 8 }}>Picked up today</div></div>
            <Users size={34} strokeWidth={1.4} color="#94A3B8" />
          </div>
        </section>

        <nav aria-label="Opportunity lists" style={{ display: "flex", flexWrap: "wrap", gap: 28, borderBottom: "1px solid var(--cf-line)" }}>
          {([
            ["unclaimed", "Unclaimed", String(unclaimed.length)],
            ["suggested", "Suggested for you", String(suggestions.length)],
            ["all", "All SAM.gov", ""],
            ["awards", "Contract awards", ""],
          ] as const).map(([key, label, count]) => (
            <button key={key} type="button" className={`cf-tab${tab === key ? " cf-tab-on" : ""}`} aria-current={tab === key ? "page" : undefined} onClick={() => { setTab(key); setPage(1); if (key === "suggested" && suggestions.length === 0) loadSuggestions(); }}>
              {label}{count ? <span className="cf-count" style={key === "unclaimed" ? { color: "#0E7490", background: "rgba(34,211,238,.1)" } : undefined}>{count}</span> : null}
            </button>
          ))}
        </nav>

        {tab === "awards" ? (
          <section className="cf-card" style={{ padding: 24 }}>
            <h2 className="cf-h2">Contract awards</h2>
            <p className="cf-sub">This tab keeps the current awards search. It is not part of this three-screen demo.</p>
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
                  <option value="30">Next 30 days</option>
                  <option value="7">Next 7 days</option>
                  <option value="any">Anytime</option>
                </select>
              </div>
              <div className="cf-field">
                <span className="cf-lab">Notice type</span>
                {options.types.slice(0, 6).map((type) => (
                  <label key={type} className="cf-check">
                    <input type="checkbox" checked={noticeTypes.includes(type)} onChange={() => { setNoticeTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type]); setPage(1); }} />
                    {type}
                  </label>
                ))}
              </div>
              <div className="cf-field"><label htmlFor="opp-sa">Set-aside</label>
                <select id="opp-sa" className="cf-select" value={setAside} onChange={(event) => setSetAside(event.target.value)}>
                  <option value="all">All set-asides</option>
                  {options.setAsides.map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              <div className="cf-field"><label htmlFor="opp-naics">NAICS code</label>
                <input id="opp-naics" className="cf-input" value={naics} placeholder="e.g. 332722" onChange={(event) => { setNaics(event.target.value); setPage(1); }} />
              </div>
              <div className="cf-field"><label htmlFor="opp-psc">Product / service code</label>
                <select id="opp-psc" className="cf-select" value={psc} onChange={(event) => setPsc(event.target.value)}>
                  <option value="all">All PSC codes</option>
                  {options.pscs.map((item) => <option key={item}>{item}</option>)}
                </select>
              </div>
              <button className="cf-btn cf-btn-secondary" type="button" onClick={saveSearch} style={{ width: "100%" }}><Bookmark size={16} strokeWidth={1.75} />Save this search</button>
            </aside>

            <section aria-label="Results" style={{ flex: "999 1 560px", minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 14, color: "var(--cf-text-2)" }}>{loading || suggesting ? "Loading…" : <><strong className="cf-mono" style={{ color: "var(--cf-text)" }}>{visible.length}</strong> {tab === "unclaimed" ? "unclaimed" : "results"} · showing {visible.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, visible.length)}` : "0"}</>}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <label htmlFor="opp-sort" className="cf-lbl">Sort by</label>
                  <select id="opp-sort" className="cf-select" style={{ width: "auto", minWidth: 220 }} value={sort} onChange={(event) => setSort(event.target.value as "closing" | "posted")}>
                    <option value="closing">Closing date (soonest)</option>
                    <option value="posted">Recently posted</option>
                  </select>
                </div>
              </div>
              {suggestError ? <div role="alert" style={{ color: "#BE123C" }}>{suggestError}</div> : null}
              {!loading && pageItems.length === 0 ? (
                <div className="cf-card" style={{ padding: 28, textAlign: "center" }}>
                  <h2 className="cf-h2">No matching opportunities</h2>
                  <p className="cf-sub">{portal !== "all" && portal !== "SAM.gov" ? `${portal} is not in the current SAM.gov catalog.` : "Try another keyword or clear the filters."}</p>
                </div>
              ) : (
              <div className="cf-card cf-result-list">
              {pageItems.map((item) => {
                const claim = availability[item.id];
                const claimed = claim && claim.available === false;
                const remaining = daysUntil(item.closingDate);
                const reason = "fitReason" in item ? (item as AiSuggestion).fitReason : "";
                const matched = Boolean(query.trim() && reason);
                return (
                  <article key={item.id} className="cf-result" style={claimed ? { background: "rgba(255,255,255,.6)" } : undefined}>
                    <span className="cf-res-ico" style={claimed ? { background: "var(--cf-surface-3)", borderColor: "var(--cf-line-2)", color: "var(--cf-text-3)" } : undefined}>
                      {claimed ? <Lock size={22} strokeWidth={1.4} /> : <Building2 size={22} strokeWidth={1.4} />}
                    </span>
                    <div style={{ flex: "1 1 360px", minWidth: 0, display: "flex", flexDirection: "column", gap: 6 }}>
                      {claimed ? <span style={{ font: "500 17px var(--cf-display)", color: "var(--cf-text-2)" }}>{item.title || "Untitled"}</span> : <Link href={`/sam-gov/${encodeURIComponent(item.id)}`} style={{ font: "500 17px var(--cf-display)", color: "var(--cf-text)", textDecoration: "none" }}>{item.title || "Untitled"}</Link>}
                      <div style={{ font: "400 12px var(--cf-mono)", color: "var(--cf-text-3)", letterSpacing: "0.02em" }}>{(item.solicitationNumber || item.id).toUpperCase()} · {(item.department || "—").toUpperCase()} · SAM.GOV</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {claimed ? <span className="cf-pill cf-pill-pool">Claimed by {claim.assignee?.full_name || "another agent"}</span> : (
                          <>
                            {item.ncode ? <span className="cf-tag">NAICS {item.ncode}</span> : null}
                            {item.type ? <span className="cf-tag">{item.type}</span> : null}
                            {item.setAside ? <span className="cf-tag">{item.setAside}</span> : null}
                            {reason ? <span className={`cf-tag${matched ? " cf-tag-hit" : ""}`}>{reason}</span> : null}
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ minWidth: 130, display: "flex", flexDirection: "column", gap: 3 }}>
                      <span className="cf-lbl">Closes</span>
                      <span style={{ fontWeight: 500, color: claimed ? "var(--cf-text-2)" : "var(--cf-text)" }}>{formatWhen(item.closingDate)}</span>
                      <span className="cf-mono" style={{ fontSize: 12, fontWeight: 500, color: !claimed && remaining != null && remaining >= 0 && remaining <= 8 ? "#BE123C" : "var(--cf-text-2)" }}>{remaining == null ? "" : remaining < 0 ? "CLOSED" : `${remaining} DAYS LEFT`}</span>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {item.link ? <a className="cf-btn cf-btn-secondary" href={item.link} target="_blank" rel="noreferrer">SAM.gov ↗</a> : null}
                      {claimed ? <button className="cf-btn cf-btn-secondary" type="button" disabled style={{ background: "var(--cf-surface-3)", color: "var(--cf-text-3)", cursor: "not-allowed" }}>Claimed</button> : <Link className="cf-btn cf-btn-primary" href={`/sam-gov/${encodeURIComponent(item.id)}`}>Pick up</Link>}
                    </div>
                  </article>
                );
              })}
              </div>
              )}
              {pageCount > 1 ? (
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  {Array.from({ length: pageCount }, (_, index) => index + 1).slice(0, 8).map((number) => (
                    <button key={number} type="button" className={`cf-btn ${number === page ? "cf-btn-primary" : "cf-btn-secondary"}`} onClick={() => setPage(number)} aria-current={number === page ? "page" : undefined}>{number}</button>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        )}
      </main>
    </>
  );
}
