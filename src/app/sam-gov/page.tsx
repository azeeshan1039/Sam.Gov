"use client";

import { useState, useEffect, useMemo } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import type { SamGovOpportunity } from "@/types/sam-gov";

// Default filter values for Suggestions tab
const DEFAULT_CITY = "Washington";
const DEFAULT_TYPE = "Solicitation";
const DEFAULT_DEPARTMENT = "DEPT OF DEFENSE";

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

export default function SamGovPage() {
  const [allOpportunities, setAllOpportunities] = useState<SamGovOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("opportunities");

  // Suggestion filters - empty means "All"
  const [selectedCity, setSelectedCity] = useState("");
  const [selectedType, setSelectedType] = useState("Solicitation");
  const [selectedDept, setSelectedDept] = useState("");

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

  // Extract unique values for filter dropdowns
  const { cities, types, departments } = useMemo(() => {
    const citySet = new Set<string>();
    const typeSet = new Set<string>();
    const deptCount = new Map<string, number>();

    allOpportunities.forEach((opp) => {
      if (opp.location?.city?.name) citySet.add(opp.location.city.name);
      if (opp.type) typeSet.add(opp.type);
      if (opp.department) {
        deptCount.set(opp.department, (deptCount.get(opp.department) || 0) + 1);
      }
    });

    // Sort departments by count (most common first)
    const sortedDepts = Array.from(deptCount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([dept]) => dept);

    return {
      cities: Array.from(citySet).sort(),
      types: Array.from(typeSet).sort(),
      departments: sortedDepts,
    };
  }, [allOpportunities]);

  // Filtered opportunities for Suggestions tab - filters are optional
  const suggestedOpportunities = useMemo(() => {
    return allOpportunities.filter((opp) => {
      const matchesCity = !selectedCity || selectedCity === "all" || opp.location?.city?.name === selectedCity;
      const matchesType = !selectedType || selectedType === "all" || opp.type === selectedType;
      const matchesDept = !selectedDept || selectedDept === "all" || opp.department === selectedDept;
      return matchesCity && matchesType && matchesDept;
    });
  }, [allOpportunities, selectedCity, selectedType, selectedDept]);

  const resetFilters = () => {
    setSelectedCity("");
    setSelectedType("Solicitation");
    setSelectedDept("");
  };

  return (
    <div className="p-6 lg:p-8">
      <h1 className="text-2xl font-bold text-slate-900">SAM.gov Contract Opportunities</h1>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="opportunities">Opportunities</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
        </TabsList>

        {/* OPPORTUNITIES TAB */}
        <TabsContent value="opportunities" className="mt-6">
          <p className="text-slate-600 mb-4">
            All available opportunities from SAM.gov.
          </p>

          {error && (
            <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
          )}

          {loading ? (
            <LoadingSkeleton />
          ) : allOpportunities.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white py-12 text-center text-slate-500">
              No opportunities found.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {allOpportunities.map((opp, i) => (
                  <OpportunityCard key={opp.id || `opp-${i}`} opp={opp} />
                ))}
              </div>
              <p className="mt-4 text-center text-sm text-slate-500">
                Showing {allOpportunities.length} opportunities
              </p>
            </>
          )}
        </TabsContent>

        {/* SUGGESTIONS TAB */}
        <TabsContent value="suggestions" className="mt-6">
          <div className="mb-6 rounded-lg border border-slate-200 bg-white p-4">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Filter Suggestions</h3>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="city-filter" className="mb-2 block text-sm font-medium">
                  City
                </Label>
                <Select value={selectedCity} onValueChange={setSelectedCity}>
                  <SelectTrigger id="city-filter">
                    <SelectValue placeholder="All Cities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cities</SelectItem>
                    {cities.map((city) => (
                      <SelectItem key={city} value={city}>
                        {city}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="type-filter" className="mb-2 block text-sm font-medium">
                  Type
                </Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger id="type-filter">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    {types.map((type) => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="dept-filter" className="mb-2 block text-sm font-medium">
                  Department
                </Label>
                <Select value={selectedDept} onValueChange={setSelectedDept}>
                  <SelectTrigger id="dept-filter">
                    <SelectValue placeholder="All Departments" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Departments</SelectItem>
                    {departments.slice(0, 20).map((dept) => (
                      <SelectItem key={dept} value={dept}>
                        {dept}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-4 flex justify-end">
              <Button variant="outline" size="sm" onClick={resetFilters}>
                Reset Filters
              </Button>
            </div>
          </div>

          {loading ? (
            <LoadingSkeleton />
          ) : suggestedOpportunities.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white py-12 text-center text-slate-500">
              No matching suggestions. Try adjusting your filters.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {suggestedOpportunities.map((opp, i) => (
                  <OpportunityCard key={opp.id || `sug-${i}`} opp={opp} />
                ))}
              </div>
              <p className="mt-4 text-center text-sm text-slate-500">
                Showing {suggestedOpportunities.length} matching opportunities
              </p>
            </>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
