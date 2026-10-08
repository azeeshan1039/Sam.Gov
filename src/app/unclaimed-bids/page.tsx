"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Inbox, RefreshCw } from "lucide-react";
import { getStoredUser } from "@/lib/auth";
import type { SamGovOpportunity } from "@/types/sam-gov";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function UnclaimedBidsPage() {
  const router = useRouter();
  const [items, setItems] = useState<SamGovOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const catalogResponse = await fetch("/api/sam-gov", { cache: "no-store" });
      const catalog = await catalogResponse.json();
      if (!catalogResponse.ok) throw new Error(catalog.error || "Unable to load SAM.gov opportunities.");
      const catalogItems = catalog as SamGovOpportunity[];
      const availableIds = new Set<string>();
      for (let offset = 0; offset < catalogItems.length; offset += 1000) {
        const chunk = catalogItems.slice(offset, offset + 1000);
        const availabilityResponse = await fetch("/api/backend/opportunities/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            opportunities: chunk.map((item) => ({
              external_notice_id: item.id,
              solicitation_number: item.solicitationNumber || item.id,
              source: "SAM.GOV",
            })),
          }),
        });
        const availability = await availabilityResponse.json();
        if (!availabilityResponse.ok) throw new Error(availability.error || "Unable to check availability.");
        for (const item of availability.opportunities || []) {
          if (item.available) availableIds.add(item.external_notice_id);
        }
      }
      setItems(catalogItems.filter((item) => availableIds.has(item.id)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load unclaimed bids.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) return router.replace("/register");
    if (user.role === "admin") return router.replace("/sam-gov");
    load();
  }, [load, router]);

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold"><Inbox className="h-6 w-6" />Unclaimed bids</h1>
          <p className="mt-1 text-muted-foreground">Available SAM.gov opportunities with no active company claim.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>
      {error && <div className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {loading ? <p className="text-sm text-muted-foreground">Checking current availability…</p> : items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No unclaimed SAM.gov bids match the current catalog.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <Card key={item.id}>
              <CardHeader><CardTitle className="text-base">{item.title}</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p className="text-muted-foreground">{item.solicitationNumber || item.id}</p>
                <p>Due {new Date(item.closingDate).toLocaleDateString()}</p>
                <Link className="font-medium text-blue-600 underline" href={`/sam-gov/${encodeURIComponent(item.id)}`}>Review and pick up</Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
