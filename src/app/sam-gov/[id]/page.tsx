
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { SamGovOpportunity } from '@/types/sam-gov'; // Updated import
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import Loading from '@/app/loading';
import { Icons } from '@/components/icons';
import { format, parseISO } from 'date-fns';
import { opportunityDeadlinePassed } from '@/lib/eastern-date';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { Check, FileText } from 'lucide-react';
import DOMPurify from 'dompurify';
import { getStoredUser, type AuthUser } from '@/lib/auth';
import { PageBand, PageMain } from '@/components/design/PageFrame';
import {
  presentOpportunityAvailability,
  type OpportunityAvailability,
} from '@/lib/opportunity-availability';

interface AgentOption {
  id: number;
  full_name: string;
  is_active: boolean;
  role: 'admin' | 'agent';
}

// Detect if content looks like HTML (has tags)
function looksLikeHtml(text: string): boolean {
  return /<[a-z][\s\S]*>/i.test(text);
}

function DescriptionBlock({ content, isHtml }: { content: string; isHtml?: boolean }) {
  if (!content) return <p className="text-muted-foreground">No description available.</p>;

  const shouldRenderHtml = isHtml ?? looksLikeHtml(content);

  if (shouldRenderHtml) {
    const sanitized = DOMPurify.sanitize(content, {
      ALLOWED_TAGS: ['p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'strong', 'em', 'u', 'a', 'span', 'div'],
      ALLOWED_ATTR: ['href', 'target', 'rel'],
    });
    return (
      <div
        className="text-foreground text-sm leading-relaxed break-words [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1 [&_h1]:text-lg [&_h2]:text-base [&_h3]:text-sm [&_h1]:font-bold [&_h2]:font-bold [&_h3]:font-semibold [&_a]:text-primary [&_a]:underline"
        dangerouslySetInnerHTML={{ __html: sanitized }}
      />
    );
  }

  return (
    <p className="text-foreground text-sm leading-relaxed whitespace-pre-wrap break-words">
      {content}
    </p>
  );
}

// Helper function to extract filename from URL
const getFileName = (url: string): string => {
  try {
    const urlObj = new URL(url);

    // Try to get filename from query params first (common in SAM.gov)
    const filenameParam = urlObj.searchParams.get('filename') ||
      urlObj.searchParams.get('name') ||
      urlObj.searchParams.get('file');
    if (filenameParam) {
      const decoded = decodeURIComponent(filenameParam);
      return decoded.length > 60 ? decoded.substring(0, 57) + '...' : decoded;
    }

    // Try pathname
    const pathname = urlObj.pathname;
    const segments = pathname.split('/').filter(Boolean);

    // Look for segment that looks like a filename (has extension)
    for (let i = segments.length - 1; i >= 0; i--) {
      const segment = decodeURIComponent(segments[i]);
      if (segment.includes('.') && !segment.startsWith('.')) {
        return segment.length > 60 ? segment.substring(0, 57) + '...' : segment;
      }
    }

    // Last resort: use last segment or show numbered attachment
    const lastSegment = segments[segments.length - 1];
    if (lastSegment && lastSegment !== 'download' && lastSegment !== 'get' && lastSegment.length > 3) {
      const decoded = decodeURIComponent(lastSegment);
      return decoded.length > 60 ? decoded.substring(0, 57) + '...' : decoded;
    }

    return 'Attachment';
  } catch {
    return 'Attachment';
  }
};

export default function SamGovOpportunityPage() {
  const params = useParams();
  const id = params.id as string;
  return <OpportunityDetail key={id} id={id} />;
}

function OpportunityDetail({ id }: { id: string }) {
  const router = useRouter();
  const [opportunity, setOpportunity] = useState<SamGovOpportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailedDescription, setDetailedDescription] = useState<string | null>(null);
  const [descriptionIsHtml, setDescriptionIsHtml] = useState(false);
  const [descriptionLoading, setDescriptionLoading] = useState<boolean>(false);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [availability, setAvailability] = useState<OpportunityAvailability | null>(null);
  const [availabilityFailed, setAvailabilityFailed] = useState(false);
  const [agents, setAgents] = useState<AgentOption[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [expectedBidValue, setExpectedBidValue] = useState('');
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [overrideLimits, setOverrideLimits] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');

  useEffect(() => { setCurrentUser(getStoredUser()); }, []);


  useEffect(() => {
    const fetchOpportunityDetails = async () => {
      if (!id) return;

      setLoading(true);
      setError(null);
      setDetailedDescription(null);
      setDescriptionIsHtml(false);

      try {
        // Fetch this single opportunity by id. Falls back to a direct SAM.gov
        // lookup server-side when the id isn't in the cached recent-list, so
        // archived/older solicitations also resolve here.
        const response = await fetch(`/api/sam-gov/opportunity/${encodeURIComponent(id)}`);
        if (response.status === 404) {
          setError('Opportunity not found.');
          setOpportunity(null);
          return;
        }
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const foundOpportunity: SamGovOpportunity | null = await response.json();

        if (foundOpportunity) {
          setOpportunity(foundOpportunity);
          const initialDesc = foundOpportunity.description;
          if (initialDesc && (initialDesc.startsWith('http://') || initialDesc.startsWith('https://'))) {
            setDescriptionLoading(true);
            try {
              // Use server-side proxy to avoid CORS issues
              const proxyUrl = `/api/sam-gov/proxy-description?url=${encodeURIComponent(initialDesc)}`;
              const descResponse = await fetch(proxyUrl);
              if (!descResponse.ok) {
                const errData = await descResponse.json();
                setDetailedDescription(`Failed to load description: ${errData.error || descResponse.status}`);
                setDescriptionIsHtml(false);
              } else {
                const data = await descResponse.json();
                setDetailedDescription(data.content || 'No description available.');
                setDescriptionIsHtml(data.isHtml ?? true);
              }
            } catch (descError: any) {
              console.error('Failed to fetch detailed description:', descError);
              setDetailedDescription(`Failed to load description. Error: ${descError.message}`);
            } finally {
              setDescriptionLoading(false);
            }
          } else {
            setDetailedDescription(initialDesc || 'No description available.');
            setDescriptionIsHtml(false);
          }




        } else {
          setError('Opportunity not found.');
          setOpportunity(null);
        }
      } catch (err: any) {
        console.error('Error fetching opportunity details from API route:', err);
        setError(err.message || 'Failed to load opportunity details.');
        setOpportunity(null);
      } finally {
        setLoading(false);
      }
    };

    fetchOpportunityDetails();
  }, [id]);

  const refreshAvailability = async (item: SamGovOpportunity) => {
    setAvailabilityFailed(false);
    try {
      const response = await fetch('/api/backend/opportunities/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ opportunities: [{
          external_notice_id: item.id,
          solicitation_number: item.solicitationNumber || item.id,
          source: 'SAM.GOV',
          ncode: item.ncode,
          naics_description: item.naicsDescription,
        }] }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.opportunities?.[0]) throw new Error("Availability unavailable");
      setAvailability(data.opportunities[0]);
    } catch {
      setAvailability(null);
      setAvailabilityFailed(true);
    }
  };

  useEffect(() => {
    if (!opportunity || !currentUser) return;
    void refreshAvailability(opportunity);
    if (currentUser.role === 'admin') {
      fetch('/api/backend/auth/team', { cache: 'no-store' })
        .then(async (response) => ({ ok: response.ok, data: await response.json() }))
        .then(({ ok, data }) => {
          if (ok) setAgents((data.members || []).filter((member: AgentOption) => member.role === 'agent' && member.is_active));
        })
        .catch(() => undefined);
    }
  }, [opportunity, currentUser]);

  const claimOpportunity = async () => {
    if (!opportunity || !currentUser) return;
    if (opportunityDeadlinePassed(opportunity.closingDate)) {
      setClaimError("The response deadline has passed.");
      return;
    }
    const value = Number(expectedBidValue);
    if (!Number.isFinite(value) || value < 0 || expectedBidValue.trim() === '') {
      setClaimError('Enter the expected submitted price before assigning this opportunity.');
      return;
    }
    if (currentUser.role === 'admin' && !selectedAgentId) {
      setClaimError('Select an agent.');
      return;
    }
    setClaimLoading(true);
    setClaimError(null);
    try {
      const endpoint = currentUser.role === 'admin' ? 'assign' : 'pickup';
      const response = await fetch(`/api/backend/opportunities/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'SAM.GOV',
          external_notice_id: opportunity.id,
          solicitation_number: opportunity.solicitationNumber || opportunity.id,
          title: opportunity.title,
          ncode: opportunity.ncode,
          naics_description: opportunity.naicsDescription,
          link: opportunity.link,
          response_deadline: opportunity.closingDate,
          expected_submitted_price: value,
          agent_user_id: currentUser.role === 'admin' ? Number(selectedAgentId) : undefined,
          override_limits: currentUser.role === 'admin' && overrideLimits,
          override_reason: currentUser.role === 'admin' ? overrideReason : undefined,
          raw_snapshot: opportunity,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not assign opportunity');
      await refreshAvailability(opportunity);
    } catch (err) {
      setClaimError(err instanceof Error ? err.message : 'Could not assign opportunity');
    } finally {
      setClaimLoading(false);
    }
  };

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <PageMain className="cf-workspace items-center">
        <Card className="w-full max-w-md border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{error}</p>
            <Button onClick={() => router.back()} className="mt-4">
              Go Back
            </Button>
          </CardContent>
        </Card>
      </PageMain>
    );
  }

  if (!opportunity) {
    return (
      <PageMain className="cf-workspace items-center">
        <p>Opportunity details could not be loaded.</p>
      </PageMain>
    );
  }

  const renderLocation = (loc: SamGovOpportunity['location']) => {
    if (!loc) return 'N/A';
    const parts = [
      loc.city?.name,
      loc.state?.name,
      loc.zip
    ].filter(Boolean);
    return parts.join(', ') || 'N/A';
  };

  const deadlinePassed = opportunityDeadlinePassed(opportunity.closingDate);
  const closingDate = opportunity.closingDate ? parseISO(opportunity.closingDate) : null;
  const closingDays = closingDate ? Math.ceil((closingDate.getTime() - Date.now()) / 86400000) : null;
  const formattedClosingDate = closingDate ? format(closingDate, 'MMM d, yyyy') : '—';
  const closingLabel = closingDays == null ? formattedClosingDate : `${formattedClosingDate} · ${closingDays} day${closingDays === 1 ? '' : 's'}`;
  const ownedByCurrentAgent = Boolean(
    currentUser?.role === 'agent' &&
    availability &&
    presentOpportunityAvailability(availability).state === 'claimed' &&
    availability.assignee?.id === currentUser.id
  );
  const availabilityPresentation = availability
    ? presentOpportunityAvailability(availability)
    : null;
  const niche = availability?.niche;
  const nicheOwners = niche?.owners?.map((owner) => owner.full_name).filter(Boolean).join(', ');

  return (
    <>
      <section className="cf-band">
        <div className="cf-wrap cf-band-in">
          <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: "1 1 320px", minWidth: 0 }}>
            <nav aria-label="Breadcrumb" className="cf-mono" style={{ fontSize: 12, color: "var(--cf-text-3)", display: "flex", gap: 8, letterSpacing: "0.04em" }}>
              <Link href="/opportunities">OPPORTUNITIES</Link>
              <span aria-hidden="true">/</span>
              <span>{opportunity.solicitationNumber || opportunity.id}</span>
            </nav>
            <h1 className="cf-h1" style={{ marginTop: 4, overflowWrap: "anywhere" }}>{opportunity.title || "Untitled opportunity"}</h1>
            <div className="cf-mono" style={{ fontSize: 12, color: "var(--cf-text-2)", letterSpacing: "0.03em", overflowWrap: "anywhere" }}>{opportunity.solicitationNumber || opportunity.id} · {opportunity.office || opportunity.department || "SAM.gov"} · SAM.GOV</div>
          </div>
          <div style={{ display: "flex", flexWrap: "nowrap", gap: 12, alignItems: "center", flex: "none", alignSelf: "flex-end", marginLeft: "auto" }}>
            <span className={`cf-pill ${availabilityPresentation?.state === "claimed" ? "cf-pill-sup" : availabilityPresentation?.state === "terminal" ? "cf-pill-pool" : "cf-pill-pool"}`} style={{ alignSelf: "center" }}>
              {ownedByCurrentAgent ? "Yours · finding supplier" : deadlinePassed ? "Deadline passed" : availabilityPresentation?.state === "available" ? "Unclaimed" : availabilityPresentation?.label ?? (availabilityFailed ? "Availability unavailable" : "Checking availability")}
            </span>
            {opportunity.link && opportunity.link !== "#" ? <a className="cf-btn cf-btn-secondary" href={opportunity.link} target="_blank" rel="noreferrer" style={{ minHeight: 40 }}>View on SAM.gov ↗</a> : <button type="button" className="cf-btn cf-btn-secondary" onClick={() => router.back()}>Back</button>}
          </div>
        </div>
      </section>
      <PageMain>
        <div className="cf-split" style={{ alignItems: "flex-start" }}>
          <div className="cf-split-main" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            <section className="cf-facts" aria-label="Key facts">
              <div className="cf-fact"><span className="cf-lbl">Response due</span><b style={{ color: closingDays != null && closingDays <= 11 ? "#BE123C" : "#0B1220" }}>{closingLabel}</b></div>
              <div className="cf-fact"><span className="cf-lbl">Quantity</span><b className="cf-mono">{"quantity" in opportunity && (opportunity as { quantity?: string | null }).quantity ? (opportunity as { quantity?: string | null }).quantity : "—"}</b></div>
              <div className="cf-fact"><span className="cf-lbl">Notice type</span><b>{opportunity.type || "—"}</b></div>
              <div className="cf-fact"><span className="cf-lbl">Set-aside</span><b>{opportunity.setAside || "—"}</b></div>
              <div className="cf-fact"><span className="cf-lbl">NAICS</span><b className="cf-mono">{opportunity.ncode || "—"}</b></div>
              <div className="cf-fact"><span className="cf-lbl">Delivery</span><b>{renderLocation(opportunity.location)}</b></div>
            </section>
            <section className="cf-card space-y-3 p-5" aria-labelledby="company-ownership">
              <h2 className="cf-h2" id="company-ownership">Company ownership</h2>
              {niche?.naics_code ? (
                <div>
                  <b>Niche {niche.naics_code}{niche.naics_description ? " · " + niche.naics_description : ""}</b>
                  <p>{niche.active_bid_count ? String(niche.active_bid_count) + (niche.active_bid_count === 1 ? ' active bid' : ' active bids') + ' in this niche' + (nicheOwners ? ' owned by ' + nicheOwners : '') : 'No active company owner is currently working this niche.'}</p>
                </div>
              ) : <p className="cf-meta">Company ownership information is unavailable for this notice.</p>}
              <Link className="cf-link" href="/niche-directory">Niche directory</Link>
            </section>
            <section className="cf-facts" aria-label="Agency details">
              {[["Department", opportunity.department], ["Subtier", opportunity.subtier], ["Office", opportunity.office], ["Office address", opportunity.officeAddress], ["NAICS description", opportunity.naicsDescription]].map(([label, value]) => (
                <div className="cf-fact" key={label}><span className="cf-lbl">{label}</span><b>{value || "N/A"}</b></div>
              ))}
            </section>
            <section className="cf-card" aria-labelledby="desc-h" style={{ padding: "22px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                <h2 id="desc-h" className="cf-h2">Description</h2>
                <span className="cf-mono cf-meta">FROM SAM.GOV</span>
              </div>
              {descriptionLoading ? <Skeleton className="h-16 w-full" /> : <div style={{ fontSize: 15, lineHeight: 1.65, color: "var(--cf-text-2)" }}><DescriptionBlock content={detailedDescription || "No description available."} isHtml={descriptionIsHtml} /></div>}
              {opportunity.resourceLinks && opportunity.resourceLinks.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(260px, 100%), 1fr))", gap: 10 }}>
                  {opportunity.resourceLinks.map((resourceLink, idx) => {
                    const isObject = typeof resourceLink === "object" && resourceLink !== null;
                    const linkUrl = isObject ? resourceLink.link : resourceLink;
                    const linkName = isObject ? resourceLink.name : getFileName(resourceLink);
                    return (
                      <a key={idx} className="cf-att" href={linkUrl} target="_blank" rel="noreferrer">
                        <FileText size={20} strokeWidth={1.6} color="#0891B2" />
                        <span style={{ flex: 1 }}><span style={{ display: "block", fontWeight: 500 }}>{linkName || `Attachment ${idx + 1}`}</span><span className="cf-mono cf-meta">OPENS ON SAM.GOV</span></span>
                      </a>
                    );
                  })}
                </div>
              ) : null}
            </section>
            <section className="cf-card" aria-labelledby="past-h" style={{ overflow: "hidden" }}>
              <div style={{ padding: "20px 24px 14px" }}>
                <h2 id="past-h" className="cf-h2">Your company&apos;s past bids on similar items</h2>
                <p className="cf-sub">Use these to sanity-check your price</p>
              </div>
              <table className="cf-table">
                <thead><tr><th>Solicitation</th><th>Agent</th><th className="cf-num">Price</th><th className="cf-num">Markup</th><th>Outcome</th></tr></thead>
                <tbody><tr><td colSpan={5}>Similar bids are not in this feed.</td></tr></tbody>
              </table>
            </section>
          </div>
          <aside className="cf-split-side" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <section className={`cf-card ${availabilityPresentation?.state === "terminal" ? "cf-state-bad" : availabilityPresentation?.state === "claimed" ? "cf-state-warn" : "cf-state-hero"}`} style={{ padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
              <div className="cf-lbl" style={{ color: availabilityPresentation?.state === "claimed" ? "#0E7490" : availabilityPresentation?.state === "terminal" ? "#BE123C" : "#0E7490" }}>
                {availabilityPresentation?.state === "claimed" ? "Already picked up" : availabilityPresentation?.state === "terminal" ? "Closed in the company workflow" : availabilityPresentation ? "Unclaimed · no one on your team has this" : "Company availability"}
              </div>
              <h2 className="cf-h2" style={{ fontSize: 22 }}>{availabilityPresentation?.state === "claimed" ? (ownedByCurrentAgent ? "This bid is yours" : "Someone else has this bid") : deadlinePassed || availabilityPresentation?.state === "terminal" ? "This bid is closed" : availabilityPresentation ? "Pick up this bid" : availabilityFailed ? "Availability unavailable" : "Checking availability"}</h2>
              {deadlinePassed && availabilityPresentation?.state !== "claimed" ? (
                <p className="cf-meta">The response deadline has passed.</p>
              ) : availabilityPresentation?.state === "available" ? (
                <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                  {["It's reserved for you and hidden from teammates' pickup lists.", "Next step is finding a supplier and adding their quote.", "Bids with no progress for 3 days are flagged to your manager."].map((line) => (
                    <li key={line} style={{ display: "flex", gap: 10, fontSize: 14, color: "var(--cf-text-2)", lineHeight: 1.45 }}><Check size={16} strokeWidth={2} color="#0891B2" style={{ flex: "none", marginTop: 2 }} />{line}</li>
                  ))}
                </ul>
              ) : availabilityPresentation ? (
                <p style={{ margin: 0, fontSize: 14, color: "var(--cf-text-2)" }}>{availabilityPresentation.label}. {availabilityPresentation.state === "terminal" ? "It cannot be picked up again." : "Duplicate pickup is blocked."}</p>
              ) : availabilityFailed ? (
                <button type="button" className="cf-btn cf-btn-secondary" onClick={() => refreshAvailability(opportunity)}>Retry availability</button>
              ) : null}
              {ownedByCurrentAgent ? <Link className="cf-btn cf-btn-primary" href={`/sam-gov/${id}/bid-summary`} style={{ width: "100%" }}>Continue this bid</Link> : null}
              {availabilityPresentation?.state === "available" && !deadlinePassed && currentUser ? (
                <>
                  <label className="cf-field">Expected submitted price
                    <input className="cf-input" aria-label="Expected submitted price" type="number" min="0" step="0.01" value={expectedBidValue} onChange={(event) => setExpectedBidValue(event.target.value)} placeholder="Expected bid value" />
                  </label>
                  {currentUser.role === "admin" ? (
                    <label className="cf-field">Assign to agent
                      <select className="cf-select" value={selectedAgentId} onChange={(event) => setSelectedAgentId(event.target.value)}>
                        <option value="">Select agent</option>
                        {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
                      </select>
                    </label>
                  ) : null}
                  {currentUser.role === "admin" ? (
                    <label className="cf-check"><input type="checkbox" checked={overrideLimits} onChange={(event) => setOverrideLimits(event.target.checked)} />Override agent limits</label>
                  ) : null}
                  {currentUser.role === "admin" && overrideLimits ? <input className="cf-input" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} placeholder="Required audit reason" /> : null}
                  <button className="cf-btn cf-btn-primary" type="button" onClick={claimOpportunity} disabled={claimLoading} style={{ width: "100%" }}>{claimLoading ? "Picking up…" : currentUser.role === "admin" ? "Assign this bid" : "Pick up this bid"}</button>
                </>
              ) : null}
              {!currentUser ? <p className="cf-meta">Sign in to pick up this opportunity.</p> : null}
              {claimError ? <p style={{ margin: 0, color: "#BE123C", fontSize: 13 }}>{claimError}</p> : null}
            </section>
            <section className="cf-card" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="cf-lbl">Activity</div>
              <div style={{ fontSize: 13, color: "var(--cf-text-2)", lineHeight: 1.6 }}>{opportunity.postedDate ? `Posted ${format(parseISO(opportunity.postedDate), "MMM d")}` : "Posted date is not in this feed."}</div>
            </section>
          </aside>
        </div>

      </PageMain>
    </>
  );
}
