"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import Link from "next/link";
import { Sparkles, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import type { SamGovOpportunity } from "@/types/sam-gov";

const DEFAULT_NOTICE_TYPES = ["Solicitation", "Combined Synopsis/Solicitation"];
const DEFAULT_DATE_RANGE: DateRangeKey = "past_day";
const DEFAULT_RESPONSE_DATE: DateRangeKey = "any";
const DEFAULT_COUNTRY = "UNITED STATES";
const DEFAULT_ACTIVE_ONLY = true;
const DEFAULT_SEARCH_MODE: SearchMode = "all_words";

type DateRangeKey = "past_day" | "past_week" | "past_month" | "any";
type SearchMode = "any_words" | "all_words" | "exact_phrase";

interface AiSuggestion extends SamGovOpportunity {
  fitScore: number;
  fitReason: string;
}

interface CompanyProfile {
  company_name: string;
  naics_codes: string[];
  set_aside_qualifications: string[];
  capabilities: string[];
  geographic_preferences: string[];
  past_performance: string[];
}

const DATE_RANGE_OPTIONS: { value: DateRangeKey; label: string }[] = [
  { value: "past_day", label: "Past Day" },
  { value: "past_week", label: "Past Week" },
  { value: "past_month", label: "Past Month" },
  { value: "any", label: "Anytime" },
];

function getDateThreshold(range: DateRangeKey): Date | null {
  if (range === "any") return null;
  const now = new Date();
  if (range === "past_day") now.setDate(now.getDate() - 1);
  else if (range === "past_week") now.setDate(now.getDate() - 7);
  else if (range === "past_month") now.setMonth(now.getMonth() - 1);
  now.setHours(0, 0, 0, 0);
  return now;
}

function matchesSearchQuery(opp: SamGovOpportunity, query: string, mode: SearchMode): boolean {
  if (!query.trim()) return true;
  const searchable = [opp.title, opp.department, opp.ncode, opp.description, opp.officeAddress]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (mode === "exact_phrase") {
    return searchable.includes(query.toLowerCase().trim());
  }
  const words = query.toLowerCase().trim().split(/\s+/);
  if (mode === "all_words") {
    return words.every((w) => searchable.includes(w));
  }
  return words.some((w) => searchable.includes(w));
}

function ScoreBadge({ score }: { score: number }) {
  const color =
    score >= 90
      ? "bg-emerald-100 text-emerald-800 border-emerald-200"
      : score >= 80
      ? "bg-blue-100 text-blue-800 border-blue-200"
      : "bg-amber-100 text-amber-800 border-amber-200";

  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold ${color}`}>
      <Sparkles className="h-3 w-3" />
      {score}% match
    </span>
  );
}

function OpportunityCard({ opp }: { opp: SamGovOpportunity }) {
  const locationStr = opp.location
    ? `${opp.location.city?.name || ""}${opp.location.city?.name && opp.location.state?.name ? ", " : ""}${opp.location.state?.name || ""}`
    : "—";

  return (
    <article className="flex flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <h3 className="line-clamp-2 text-base font-semibold text-slate-900" title={opp.title}>
        {opp.title || "Untitled"}
      </h3>
      <dl className="mt-3 flex-1 space-y-1.5 text-sm">
        <div>
          <span className="text-slate-500">NAICS</span>
          <span className="ml-1.5 text-slate-700">{opp.ncode || "—"}</span>
        </div>
        <div>
          <span className="text-slate-500">Type</span>
          <span className="ml-1.5 text-slate-700">{opp.type || "—"}</span>
        </div>
        <div>
          <span className="text-slate-500">Department</span>
          <span className="ml-1.5 text-slate-700 line-clamp-1">{opp.department || "—"}</span>
        </div>
        <div>
          <span className="text-slate-500">Location</span>
          <span className="ml-1.5 text-slate-700">{locationStr}</span>
        </div>
        <div>
          <span className="text-slate-500">Closing</span>
          <span className="ml-1.5 text-slate-700">
            {opp.closingDate ? new Date(opp.closingDate).toLocaleDateString() : "—"}
          </span>
        </div>
      </dl>
      <div className="mt-4 flex gap-2">
        <Link
          href={`/sam-gov/${opp.id}`}
          className="inline-flex flex-1 items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          View Details
        </Link>
        {opp.link && opp.link !== "#" && (
          <a
            href={opp.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            SAM.gov →
          </a>
        )}
      </div>
    </article>
  );
}

function SuggestionCard({ opp }: { opp: AiSuggestion }) {
  const [expanded, setExpanded] = useState(false);
  const locationStr = opp.location
    ? `${opp.location.city?.name || ""}${opp.location.city?.name && opp.location.state?.name ? ", " : ""}${opp.location.state?.name || ""}`
    : "—";

  return (
    <article className="flex flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-2 mb-2">
        <ScoreBadge score={opp.fitScore} />
      </div>
      <h3 className="line-clamp-2 text-base font-semibold text-slate-900" title={opp.title}>
        {opp.title || "Untitled"}
      </h3>
      <dl className="mt-3 flex-1 space-y-1.5 text-sm">
        <div>
          <span className="text-slate-500">NAICS</span>
          <span className="ml-1.5 text-slate-700">{opp.ncode || "—"}</span>
        </div>
        <div>
          <span className="text-slate-500">Type</span>
          <span className="ml-1.5 text-slate-700">{opp.type || "—"}</span>
        </div>
        <div>
          <span className="text-slate-500">Department</span>
          <span className="ml-1.5 text-slate-700 line-clamp-1">{opp.department || "—"}</span>
        </div>
        <div>
          <span className="text-slate-500">Location</span>
          <span className="ml-1.5 text-slate-700">{locationStr}</span>
        </div>
        <div>
          <span className="text-slate-500">Closing</span>
          <span className="ml-1.5 text-slate-700">
            {opp.closingDate ? new Date(opp.closingDate).toLocaleDateString() : "—"}
          </span>
        </div>
      </dl>

      <button
        onClick={() => setExpanded(!expanded)}
        className="mt-3 flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        {expanded ? "Hide reasoning" : "Why this matches"}
      </button>
      {expanded && (
        <div className="mt-2 rounded-md bg-slate-50 border border-slate-100 p-3 text-xs text-slate-600 leading-relaxed">
          {opp.fitReason}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <Link
          href={`/sam-gov/${opp.id}`}
          className="inline-flex flex-1 items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          View Details
        </Link>
        {opp.link && opp.link !== "#" && (
          <a
            href={opp.link}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center rounded-md border border-slate-300 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            SAM.gov →
          </a>
        )}
      </div>
    </article>
  );
}

function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
          <Skeleton className="h-5 w-3/4 mb-3" />
          <Skeleton className="h-4 w-1/2 mb-2" />
          <Skeleton className="h-4 w-2/3 mb-2" />
          <Skeleton className="h-4 w-1/2 mb-2" />
          <Skeleton className="h-4 w-3/4 mb-4" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  );
}

function SuggestionsLoadingSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-indigo-100 bg-indigo-50/50 p-4">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
        <div>
          <p className="text-sm font-medium text-indigo-900">Analyzing opportunities with AI...</p>
          <p className="text-xs text-indigo-600 mt-0.5">Scoring each opportunity against your company profile</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-slate-200 bg-white p-4">
            <Skeleton className="h-5 w-20 mb-3 rounded-full" />
            <Skeleton className="h-5 w-3/4 mb-3" />
            <Skeleton className="h-4 w-1/2 mb-2" />
            <Skeleton className="h-4 w-2/3 mb-2" />
            <Skeleton className="h-4 w-1/2 mb-2" />
            <Skeleton className="h-4 w-3/4 mb-4" />
            <Skeleton className="h-8 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SamGovPage() {
  const [allOpportunities, setAllOpportunities] = useState<SamGovOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("opportunities");

  // Search & Filters (for Opportunities tab)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<SearchMode>(DEFAULT_SEARCH_MODE);
  const [selectedOrg, setSelectedOrg] = useState("all");
  const [selectedResponseDate, setSelectedResponseDate] = useState<DateRangeKey>(DEFAULT_RESPONSE_DATE);
  const [selectedDateRange, setSelectedDateRange] = useState<DateRangeKey>(DEFAULT_DATE_RANGE);
  const [selectedNoticeTypes, setSelectedNoticeTypes] = useState<string[]>(DEFAULT_NOTICE_TYPES);
  const [selectedPsc, setSelectedPsc] = useState("all");
  const [selectedSetAside, setSelectedSetAside] = useState("all");
  const [zipCode, setZipCode] = useState("");
  const [selectedState, setSelectedState] = useState("all");
  const [selectedCountry, setSelectedCountry] = useState(DEFAULT_COUNTRY);
  const [activeOnly, setActiveOnly] = useState(DEFAULT_ACTIVE_ONLY);

  // AI Suggestions state
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [aiProfile, setAiProfile] = useState<CompanyProfile | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiStats, setAiStats] = useState<{ total_analyzed: number; total_suggestions: number; threshold: number } | null>(null);
  const [aiFetched, setAiFetched] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/sam-gov", { cache: "no-store" });
        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || `Request failed (${res.status})`);
        }
        const data: SamGovOpportunity[] = await res.json();
        setAllOpportunities(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load opportunities");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  // Load cached AI suggestions from localStorage on mount
  useEffect(() => {
    try {
      const cached = localStorage.getItem("ai-suggestions-cache");
      if (cached) {
        const data = JSON.parse(cached);
        setAiSuggestions(data.suggestions || []);
        setAiProfile(data.profile || null);
        setAiStats(data.stats || null);
        setAiFetched(true);
      }
    } catch {
      localStorage.removeItem("ai-suggestions-cache");
    }
  }, []);

  const fetchAiSuggestions = useCallback(async (forceRefresh = false) => {
    if (aiLoading || allOpportunities.length === 0) return;
    if (!forceRefresh && aiFetched) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const res = await fetch("/api/sam-gov/ai-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunities: allOpportunities }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Request failed (${res.status})`);
      }
      const data = await res.json();
      const suggestions = data.suggestions || [];
      const profile = data.profile || null;
      const stats = {
        total_analyzed: data.total_analyzed || 0,
        total_suggestions: data.total_suggestions || 0,
        threshold: data.threshold || 70,
      };
      setAiSuggestions(suggestions);
      setAiProfile(profile);
      setAiStats(stats);
      setAiFetched(true);
      localStorage.setItem("ai-suggestions-cache", JSON.stringify({ suggestions, profile, stats }));
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Failed to get AI suggestions");
    } finally {
      setAiLoading(false);
    }
  }, [aiLoading, aiFetched, allOpportunities]);

  useEffect(() => {
    if (activeTab === "suggestions" && !aiFetched && !aiLoading && !aiError && allOpportunities.length > 0) {
      fetchAiSuggestions();
    }
  }, [activeTab, aiFetched, aiLoading, aiError, allOpportunities, fetchAiSuggestions]);

  const filterOptions = useMemo(() => {
    const typeSet = new Set<string>();
    const countrySet = new Set<string>();
    const stateSet = new Set<string>();
    const orgSet = new Set<string>();
    const setAsideSet = new Set<string>();
    const pscSet = new Set<string>();

    allOpportunities.forEach((opp) => {
      if (opp.type) typeSet.add(opp.type);
      if (opp.location?.country?.name) countrySet.add(opp.location.country.name);
      if (opp.location?.state?.name) stateSet.add(opp.location.state.name);
      if (opp.department && opp.department !== "N/A") orgSet.add(opp.department);
      if (opp.setAside) setAsideSet.add(opp.setAside);
      if (opp.classificationCode) pscSet.add(opp.classificationCode);
    });

    return {
      noticeTypes: Array.from(typeSet).sort(),
      countries: Array.from(countrySet).sort(),
      states: Array.from(stateSet).sort(),
      organizations: Array.from(orgSet).sort(),
      setAsides: Array.from(setAsideSet).sort(),
      pscs: Array.from(pscSet).sort(),
    };
  }, [allOpportunities]);

  const toggleNoticeType = (type: string) => {
    setSelectedNoticeTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );
  };

  const filteredOpportunities = useMemo(() => {
    const updatedThreshold = getDateThreshold(selectedDateRange);
    const responseThreshold = getDateThreshold(selectedResponseDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return allOpportunities.filter((opp) => {
      if (!matchesSearchQuery(opp, searchQuery, searchMode)) return false;
      if (selectedOrg !== "all" && opp.department !== selectedOrg) return false;

      const closingDate = opp.closingDate ? new Date(opp.closingDate) : null;
      if (responseThreshold && (!closingDate || closingDate < responseThreshold)) return false;

      const postedDate = opp.postedDate ? new Date(opp.postedDate) : null;
      if (updatedThreshold && postedDate && postedDate < updatedThreshold) return false;

      if (selectedNoticeTypes.length > 0 && !selectedNoticeTypes.includes(opp.type)) return false;
      if (selectedPsc !== "all" && opp.classificationCode !== selectedPsc) return false;
      if (selectedSetAside !== "all" && opp.setAside !== selectedSetAside) return false;
      if (zipCode.trim() && opp.location?.zip !== zipCode.trim()) return false;
      if (selectedState !== "all" && opp.location?.state?.name !== selectedState) return false;
      if (selectedCountry !== "all" && opp.location?.country?.name !== selectedCountry) return false;

      if (activeOnly) {
        const isActive = closingDate ? closingDate >= today : false;
        if (!isActive) return false;
      }

      return true;
    });
  }, [
    allOpportunities, searchQuery, searchMode, selectedOrg, selectedResponseDate,
    selectedDateRange, selectedNoticeTypes, selectedPsc, selectedSetAside,
    zipCode, selectedState, selectedCountry, activeOnly,
  ]);

  const resetFilters = () => {
    setSearchQuery("");
    setSearchMode(DEFAULT_SEARCH_MODE);
    setSelectedOrg("all");
    setSelectedResponseDate(DEFAULT_RESPONSE_DATE);
    setSelectedDateRange(DEFAULT_DATE_RANGE);
    setSelectedNoticeTypes(DEFAULT_NOTICE_TYPES);
    setSelectedPsc("all");
    setSelectedSetAside("all");
    setZipCode("");
    setSelectedState("all");
    setSelectedCountry(DEFAULT_COUNTRY);
    setActiveOnly(DEFAULT_ACTIVE_ONLY);
  };

  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-2xl font-bold text-slate-900">SAM.gov Contract Opportunities</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="suggestions" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            AI Suggestions
          </TabsTrigger>
        </TabsList>

        {/* ==================== OPPORTUNITIES TAB ==================== */}
        <TabsContent value="opportunities" className="mt-6">
          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
          )}

          <div className="flex gap-6">
            {/* FILTER SIDEBAR */}
            <div className="w-72 shrink-0 space-y-4 rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-lg font-semibold text-slate-900">Filters</h3>

              {/* SEARCH */}
              <div className="space-y-2">
                <div className="flex gap-1">
                  {(["any_words", "all_words", "exact_phrase"] as SearchMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => setSearchMode(mode)}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        searchMode === mode
                          ? "bg-primary text-primary-foreground"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {mode === "any_words" ? "Any Words" : mode === "all_words" ? "All Words" : "Exact Phrase"}
                    </button>
                  ))}
                </div>
                <Input
                  placeholder="e.g. W91QVN-17-R-008"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* FEDERAL ORGANIZATIONS */}
              <div>
                <Label className="mb-1.5 block text-sm font-medium">Federal Organizations</Label>
                <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                  <SelectTrigger className="text-sm">
                    <SelectValue placeholder="All Organizations" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Organizations</SelectItem>
                    {filterOptions.organizations.map((org) => (
                      <SelectItem key={org} value={org}>{org}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* DATES */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-900">Dates</p>
                <div>
                  <Label className="mb-1.5 block text-xs text-slate-600">Response/Date Offers Due</Label>
                  <Select value={selectedResponseDate} onValueChange={(v) => setSelectedResponseDate(v as DateRangeKey)}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DATE_RANGE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs text-slate-600">Updated Date</Label>
                  <Select value={selectedDateRange} onValueChange={(v) => setSelectedDateRange(v as DateRangeKey)}>
                    <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {DATE_RANGE_OPTIONS.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* NOTICE TYPE */}
              <div>
                <Label className="mb-1.5 block text-sm font-medium">Notice Type</Label>
                <div className="space-y-1.5 rounded-md border border-slate-200 p-2.5 max-h-36 overflow-y-auto">
                  {filterOptions.noticeTypes.length === 0 ? (
                    <p className="text-xs text-slate-400">Loading...</p>
                  ) : (
                    filterOptions.noticeTypes.map((type) => (
                      <label key={type} className="flex items-center gap-2 text-xs cursor-pointer">
                        <Checkbox
                          checked={selectedNoticeTypes.includes(type)}
                          onCheckedChange={() => toggleNoticeType(type)}
                        />
                        <span className="text-slate-700">{type}</span>
                      </label>
                    ))
                  )}
                </div>
              </div>

              {/* PRODUCT OR SERVICE INFORMATION */}
              <div>
                <Label className="mb-1.5 block text-sm font-medium">Product or Service Information</Label>
                <Select value={selectedPsc} onValueChange={setSelectedPsc}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="All PSC Codes" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All PSC Codes</SelectItem>
                    {filterOptions.pscs.map((psc) => (
                      <SelectItem key={psc} value={psc}>{psc}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* SET ASIDE */}
              <div>
                <Label className="mb-1.5 block text-sm font-medium">Set Aside</Label>
                <Select value={selectedSetAside} onValueChange={setSelectedSetAside}>
                  <SelectTrigger className="text-sm"><SelectValue placeholder="All Set-Asides" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Set-Asides</SelectItem>
                    {filterOptions.setAsides.map((sa) => (
                      <SelectItem key={sa} value={sa}>{sa}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* PLACE OF PERFORMANCE */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-900">Place of Performance</p>
                <div>
                  <Label className="mb-1.5 block text-xs text-slate-600">Zip Code</Label>
                  <Input placeholder="e.g. 20001" value={zipCode} onChange={(e) => setZipCode(e.target.value)} className="text-sm" />
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs text-slate-600">State / Territory</Label>
                  <Select value={selectedState} onValueChange={setSelectedState}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="Select State / Territory" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      {filterOptions.states.map((st) => (
                        <SelectItem key={st} value={st}>{st}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="mb-1.5 block text-xs text-slate-600">Country</Label>
                  <Select value={selectedCountry} onValueChange={setSelectedCountry}>
                    <SelectTrigger className="text-sm"><SelectValue placeholder="All Countries" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Countries</SelectItem>
                      {filterOptions.countries.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* STATUS */}
              <div>
                <Label className="mb-1.5 block text-sm font-medium">Status</Label>
                <div className="space-y-1.5 rounded-md border border-slate-200 p-2.5">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox checked={activeOnly} onCheckedChange={(checked) => setActiveOnly(checked === true)} />
                    <span className="text-slate-700">Active</span>
                  </label>
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox checked={!activeOnly} onCheckedChange={(checked) => setActiveOnly(checked !== true)} />
                    <span className="text-slate-700">Inactive</span>
                  </label>
                </div>
              </div>

              <Button variant="outline" size="sm" className="w-full" onClick={resetFilters}>
                Reset Filters
              </Button>
            </div>

            {/* RESULTS */}
            <div className="flex-1 min-w-0">
              {loading ? (
                <LoadingSkeleton />
              ) : filteredOpportunities.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white py-12 text-center text-slate-500">
                  No matching opportunities. Try adjusting your filters.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {filteredOpportunities.map((opp, i) => (
                      <OpportunityCard key={opp.id || `opp-${i}`} opp={opp} />
                    ))}
                  </div>
                  <p className="mt-4 text-center text-sm text-slate-500">
                    Showing {filteredOpportunities.length} of {allOpportunities.length} opportunities
                  </p>
                </>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ==================== AI SUGGESTIONS TAB ==================== */}
        <TabsContent value="suggestions" className="mt-6">
          {/* Profile banner */}
          {aiProfile && (
            <div className="mb-6 rounded-lg border border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 p-4">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-lg bg-indigo-100 p-2">
                  <Sparkles className="h-5 w-5 text-indigo-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-indigo-900">
                    AI-powered suggestions for {aiProfile.company_name}
                  </p>
                  <p className="mt-1 text-xs text-indigo-700 leading-relaxed">
                    Based on:{" "}
                    <span className="font-medium">{aiProfile.capabilities.slice(0, 4).join(", ")}</span>
                    {" | NAICS: "}
                    <span className="font-medium">{aiProfile.naics_codes.join(", ")}</span>
                    {" | Set-Aside: "}
                    <span className="font-medium">{aiProfile.set_aside_qualifications.join(", ")}</span>
                  </p>
                  {aiStats && (
                    <p className="mt-1.5 text-xs text-indigo-600">
                      Analyzed {aiStats.total_analyzed} opportunities — showing {aiStats.total_suggestions} with {aiStats.threshold}%+ fit score
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Error */}
          {aiError && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
              <p className="text-sm font-medium">Failed to load AI suggestions</p>
              <p className="text-xs mt-1">{aiError}</p>
              <Button variant="outline" size="sm" className="mt-2" onClick={() => { setAiFetched(false); setAiError(null); }}>
                Retry
              </Button>
            </div>
          )}

          {/* Loading */}
          {aiLoading && <SuggestionsLoadingSkeleton />}

          {/* Results */}
          {!aiLoading && !aiError && aiFetched && (
            <>
              <div className="flex justify-end mb-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchAiSuggestions(true)}
                  disabled={aiLoading}
                  className="gap-2"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Refresh Suggestions
                </Button>
              </div>
              {aiSuggestions.length === 0 ? (
                <div className="rounded-lg border border-slate-200 bg-white py-12 text-center">
                  <Sparkles className="mx-auto h-10 w-10 text-slate-300 mb-3" />
                  <p className="text-slate-500 text-sm">No opportunities scored above the {aiStats?.threshold || 70}% threshold.</p>
                  <p className="text-slate-400 text-xs mt-1">All {aiStats?.total_analyzed || 0} opportunities were analyzed but none matched strongly enough.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {aiSuggestions.map((opp, i) => (
                      <SuggestionCard key={opp.id || `ai-${i}`} opp={opp} />
                    ))}
                  </div>
                  <p className="mt-4 text-center text-sm text-slate-500">
                    Showing {aiSuggestions.length} AI-recommended opportunities
                  </p>
                </>
              )}
            </>
          )}

          {/* Idle state (shouldn't happen normally, but just in case) */}
          {!aiLoading && !aiError && !aiFetched && !loading && allOpportunities.length > 0 && (
            <div className="rounded-lg border border-slate-200 bg-white py-12 text-center">
              <Sparkles className="mx-auto h-10 w-10 text-indigo-300 mb-3" />
              <p className="text-slate-600 text-sm font-medium">Ready to analyze opportunities</p>
              <Button className="mt-3" onClick={() => fetchAiSuggestions()}>
                <Sparkles className="h-4 w-4 mr-2" />
                Get AI Suggestions
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
