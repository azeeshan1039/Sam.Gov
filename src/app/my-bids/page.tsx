"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getStoredUser, getUserDisplayName, type AuthUser } from "@/lib/auth";
import MyBidsAlerts from "@/components/notifications/MyBidsAlerts";
import { PageBand, PageMain } from "@/components/design/PageFrame";
import { Skeleton } from "@/components/ui/skeleton";
import { PipelineTable } from "@/components/pipeline/PipelineTable";
import { requesterQuery, type PipelineItem } from "@/lib/pipeline";

interface MyGoal {
  achieved: number;
  monthly: number;
  left: number;
}

interface ActiveClaim {
  id: number;
  external_notice_id: string;
  solicitation_number?: string | null;
  title: string;
  expected_bid_value?: number | null;
  response_deadline?: string | null;
  state: string;
  stale?: boolean;
}

export default function MyBidsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const bidParam = searchParams.get("bid");
  const highlightId = bidParam && /^\d+$/.test(bidParam) ? Number(bidParam) : null;
  const [user, setUser] = useState<AuthUser | null>(null);
  const [items, setItems] = useState<PipelineItem[]>([]);
  const [activeClaims, setActiveClaims] = useState<ActiveClaim[]>([]);
  const [goal, setGoal] = useState<MyGoal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const current = getStoredUser();
    if (!current) {
      router.replace("/register");
      return;
    }
    setUser(current);
  }, [router]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const query = requesterQuery(user);
      const [bidsRes, goalRes, claimsRes] = await Promise.all([
        fetch(`/api/backend/pipeline/my-bids?${query}`, { cache: "no-store" }),
        fetch(`/api/backend/stats/my-goal?${query}`, { cache: "no-store" }),
        fetch("/api/backend/opportunities/mine", { cache: "no-store" }),
      ]);
      const bidsData = await bidsRes.json().catch(() => ({}));
      const goalData = await goalRes.json().catch(() => ({}));
      const claimsData = await claimsRes.json().catch(() => ({}));
      if (!bidsRes.ok) {
        console.error("[my-bids] load failed", { status: bidsRes.status, body: bidsData });
        throw new Error(bidsData.error || `Failed to load bids (${bidsRes.status})`);
      }
      setItems(bidsData.items || []);
      if (claimsRes.ok) {
        setActiveClaims(
          (claimsData.opportunities || []).filter(
            (claim: ActiveClaim) => claim.state === "assigned"
          )
        );
      } else {
        console.error("[my-bids] active claims load failed", {
          status: claimsRes.status,
          body: claimsData,
        });
        setActiveClaims([]);
      }
      if (goalRes.ok) {
        setGoal({
          achieved: Number(goalData.achieved || 0),
          monthly: Number(goalData.monthly || 0),
          left: Number(goalData.left || 0),
        });
      } else {
        console.error("[my-bids] goal load failed", { status: goalRes.status, body: goalData });
        setGoal(null);
      }
    } catch (err) {
      console.error("[my-bids] page error", err);
      setError(err instanceof Error ? err.message : "Failed to load bids");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  useEffect(() => {
    if (!highlightId || loading) return;
    document.getElementById(`pipeline-row-${highlightId}`)?.scrollIntoView({ block: "center" });
  }, [highlightId, loading, items]);

  if (!user) {
    return (
      <PageMain>
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </PageMain>
    );
  }

  const goalPct = goal && goal.monthly > 0 ? Math.min(100, Math.round((goal.achieved / goal.monthly) * 100)) : 0;

  return (
    <>
      <PageBand
        eyebrow={`${items.length} BIDS · ${activeClaims.length} ACTIVE`}
        title="My bids"
        lead="Your assigned solicitations."
        actions={<Link className="cf-btn cf-btn-primary" href="/opportunities">Find opportunities</Link>}
      />
      <PageMain>
        <MyBidsAlerts />
        {error && (
          <div role="alert" style={{ border: "1px solid rgba(251,113,133,.45)", background: "rgba(251,113,133,.1)", color: "#BE123C", borderRadius: 12, padding: "12px 16px" }}>
            {error}
          </div>
        )}
        <section className="cf-split">
          <div className="cf-card cf-split-main" style={{ padding: "20px 24px" }}>
            <div className="cf-lbl">Submitted</div>
            <div className="cf-kpi-v" style={{ fontSize: 34, marginTop: 6 }}>{loading ? "—" : goal ? goal.achieved : "—"}</div>
            <div className="cf-bar" style={{ marginTop: 12 }}><span style={{ width: `${goalPct}%` }} /></div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }} className="cf-mono">
              <span>{goalPct}% done</span>
              <span>Monthly goal {loading ? "—" : goal ? goal.monthly : "—"} · Still to go {loading ? "—" : goal ? goal.left : "—"}</span>
            </div>
          </div>
          <aside className="cf-card cf-split-side" style={{ padding: "20px 24px", borderColor: "rgba(251,191,36,.45)" }}>
            <h2 className="cf-h2">Award checks</h2>
            <p className="cf-sub">Open award tracking to record outcomes. This feed does not include a personal due count.</p>
            <Link className="cf-link" href="/award-tracking" style={{ marginTop: 12 }}>Record outcomes</Link>
          </aside>
        </section>
        <section className="cf-card">
          <div className="cf-card-hd">
            <div>
              <h2 className="cf-h2">Active picked-up bids</h2>
              <p className="cf-sub">Work currently reserved for you, including bids that have not entered negotiation yet.</p>
            </div>
          </div>
          <div style={{ padding: "0 24px 16px" }}>
            {loading ? (
              <Skeleton className="h-28 w-full" />
            ) : activeClaims.length ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(280px, 100%), 1fr))", gap: 16 }}>
                {activeClaims.map((claim) => (
                  <Link
                    key={claim.id}
                    href={`/sam-gov/${encodeURIComponent(claim.external_notice_id)}`}
                    className="cf-card"
                    style={{ padding: 16, textDecoration: "none", color: "inherit" }}
                  >
                    <div className="cf-mono" style={{ fontSize: 12 }}>{claim.solicitation_number || claim.external_notice_id}</div>
                    <p style={{ font: "500 19px/1.3 var(--cf-display)", marginTop: 6 }}>{claim.title}</p>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, marginTop: 12 }}>
                      <span className="cf-meta">{claim.response_deadline ? `Due ${new Date(claim.response_deadline).toLocaleDateString()}` : "No due date"}</span>
                      <span className="cf-mono">
                        {claim.expected_bid_value == null
                          ? "Value not set"
                          : claim.expected_bid_value.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })}
                      </span>
                    </div>
                    {claim.stale ? <span className="cf-chip" style={{ marginTop: 8 }}>Stale</span> : null}
                  </Link>
                ))}
              </div>
            ) : (
              <p className="cf-meta">No active bids are assigned to you.</p>
            )}
          </div>
        </section>
        <section className="cf-card">
          <div className="cf-card-hd">
            <div>
              <h2 className="cf-h2">{getUserDisplayName(user)}</h2>
              <p className="cf-sub">{loading ? "Loading…" : `${items.length} row(s)`}</p>
            </div>
          </div>
          <div style={{ padding: "0 16px 16px", overflowX: "auto" }}>
            {loading ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <PipelineTable
                items={items}
                variant="my-bids"
                empty="No bids assigned to you yet."
                highlightId={highlightId}
              />
            )}
          </div>
        </section>
      </PageMain>
    </>
  );
}
