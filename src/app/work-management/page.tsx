'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { getStoredUser } from '@/lib/auth';
import { AdminTabs, PageBand, PageMain } from '@/components/design/PageFrame';
import { Skeleton } from '@/components/ui/skeleton';
import { opportunityDeadlinePassed } from '@/lib/eastern-date';

interface Person { id: number; full_name: string; email?: string }
interface AssignmentHistoryEvent {
  id: number;
  agent?: Person | null;
  actor?: Person | null;
  action: string;
  reason?: string | null;
  limit_override: boolean;
  started_at: string;
}
interface Opportunity {
  id: number;
  source: string;
  external_notice_id: string;
  solicitation_number?: string;
  title: string;
  expected_bid_value?: number;
  submitted_price?: number | null;
  bid_id?: number;
  submitting_agent?: Person | null;
  response_deadline?: string | null;
  state: string;
  assignee?: Person | null;
  assignment_history?: AssignmentHistoryEvent[];
}
interface Incident {
  id: number;
  solicitation_number: string;
  attempted_external_notice_id: string;
  attempted_by?: Person;
  existing_agent?: Person;
  status: string;
  attempt_count?: number;
  resolution_note?: string;
  created_at: string;
  detected_at: string;
}
interface StaleBid {
  claim_id: number;
  solicitation_number: string | null;
  title: string;
  assignee?: Person;
  last_status_at: string | null;
  href?: string;
}

export default function WorkManagementPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [staleBids, setStaleBids] = useState<StaleBid[]>([]);
  const [agents, setAgents] = useState<Person[]>([]);
  const [targetByOpportunity, setTargetByOpportunity] = useState<Record<number, string>>({});
  const [reasonByOpportunity, setReasonByOpportunity] = useState<Record<number, string>>({});
  const [resolutionByIncident, setResolutionByIncident] = useState<Record<number, string>>({});
  const [overrideByOpportunity, setOverrideByOpportunity] = useState<Record<number, boolean>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const get = async (url: string) => {
        try {
          const response = await fetch(url, { cache: 'no-store' });
          const data = await response.json().catch(() => ({}));
          return { ok: response.ok, data };
        } catch (err) {
          return { ok: false, data: { error: err instanceof Error ? err.message : 'Request failed' } };
        }
      };
      const [opportunityData, duplicateData, staleData, teamData] = await Promise.all([
        get('/api/backend/opportunities/company'),
        get('/api/backend/opportunities/duplicates'),
        get('/api/backend/opportunities/stale'),
        get('/api/backend/auth/team'),
      ]);
      if (!opportunityData.ok) throw new Error(opportunityData.data.error || 'Could not load opportunity ledger');
      if (!duplicateData.ok) throw new Error(duplicateData.data.error || 'Could not load duplicate incidents');
      if (!teamData.ok) throw new Error(teamData.data.error || 'Could not load roster');
      setOpportunities(opportunityData.data.opportunities || []);
      setIncidents(duplicateData.data.incidents || []);
      setAgents((teamData.data.members || []).filter((member: { role: string; is_active: boolean }) => member.role === 'agent' && member.is_active));
      if (!staleData.ok) {
        setStaleBids([]);
        setError(staleData.data.error || 'Could not load stale bids');
      } else {
        setStaleBids(staleData.data.bids || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load work management');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) return router.replace('/login');
    if (user.role !== 'admin') return router.replace('/my-bids?access=manager');
    void load();
  }, [load, router]);

  const clearActionControls = (opportunityId: number) => {
    setTargetByOpportunity((current) => ({ ...current, [opportunityId]: '' }));
    setReasonByOpportunity((current) => ({ ...current, [opportunityId]: '' }));
    setOverrideByOpportunity((current) => ({ ...current, [opportunityId]: false }));
  };
  useEffect(() => {
    if (loading) return;
    const id = window.location.hash.replace('#', '');
    if (id) document.getElementById(id)?.scrollIntoView();
  }, [loading]);

  const reassign = async (opportunity: Opportunity) => {
    const agentId = Number(targetByOpportunity[opportunity.id]);
    if (!agentId) return setError('Select an agent before reassigning.');
    const response = await fetch(`/api/backend/opportunities/${opportunity.id}/reassign`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        agent_user_id: agentId,
        reason: reasonByOpportunity[opportunity.id] || '',
        override_limits: Boolean(overrideByOpportunity[opportunity.id]),
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error || 'Could not reassign opportunity');
    clearActionControls(opportunity.id);
    await load();
  };

  const assignFromPool = async (opportunity: Opportunity) => {
    if (opportunityDeadlinePassed(opportunity.response_deadline)) return setError('The response deadline has passed.');
    const agentId = Number(targetByOpportunity[opportunity.id]);
    if (!agentId) return setError('Select an agent before assigning.');
    const response = await fetch('/api/backend/opportunities/assign', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
        source: opportunity.source,
        external_notice_id: opportunity.external_notice_id,
        solicitation_number: opportunity.solicitation_number,
        title: opportunity.title,
        expected_bid_value: opportunity.expected_bid_value,
        agent_user_id: agentId,
        override_limits: Boolean(overrideByOpportunity[opportunity.id]),
        override_reason: reasonByOpportunity[opportunity.id] || '',
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error || 'Could not assign opportunity');
    clearActionControls(opportunity.id);
    await load();
  };

  const release = async (opportunity: Opportunity) => {
    const response = await fetch(`/api/backend/opportunities/${opportunity.id}/release`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: reasonByOpportunity[opportunity.id] || 'Returned to pool by manager' }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error || 'Could not release opportunity');
    clearActionControls(opportunity.id);
    await load();
  };

  const resolveIncident = async (incident: Incident) => {
    const note = resolutionByIncident[incident.id]?.trim();
    if (!note) return setError('Enter a resolution note.');
    const response = await fetch(`/api/backend/opportunities/duplicates/${incident.id}/resolve`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ resolution_note: note }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) return setError(data.error || 'Could not resolve duplicate incident');
    await load();
  };

  if (loading) return <PageMain><Skeleton className="h-9 w-64" /><Skeleton className="h-80 w-full" /></PageMain>;

  const activeCount = opportunities.filter((item) => item.state === 'assigned').length;
  const stateLabel = (state: string) => state === 'assigned' ? 'Assigned' : state === 'available' ? 'In pool' : 'Closed';
  const statePill = (state: string) => state === 'assigned' ? 'cf-pill-sup' : state === 'available' ? 'cf-pill-pool' : 'cf-pill-sub';

  return <>
    <PageBand
      eyebrow="ADMIN"
      title="Work management"
      lead="Company-wide ownership, reassignment, pool returns, duplicates and stale bids"
      actions={<p className="cf-mono cf-meta" style={{ maxWidth: 380, lineHeight: 1.6 }}>SAM.GOV STAYS THE SOURCE CATALOG — THIS LEDGER KEEPS ONLY YOUR WORKFLOW STATE AND AN UNCHANGEABLE ASSIGNMENT HISTORY.</p>}
    />
    <AdminTabs current="/work-management" />
    <PageMain>
    <section className="cf-grid-kpi" aria-label="Work summary">
      <div className="cf-card cf-kpi cf-kpi-hero"><div className="cf-lbl" style={{ color: "#0E7490" }}>Assigned and active</div><div className="cf-kpi-v">{activeCount}</div></div>
      <a className="cf-card cf-kpi" href="#stale-bids" style={{ textDecoration: "none", borderColor: "rgba(251,191,36,.4)" }}><div className="cf-lbl" style={{ color: "#B45309" }}>Stale · 3+ days idle</div><div className="cf-kpi-v">{staleBids.length}</div></a>
      <a className="cf-card cf-kpi" href="#duplicates" style={{ textDecoration: "none", borderColor: "rgba(251,113,133,.4)" }}><div className="cf-lbl" style={{ color: "#BE123C" }}>Duplicate pickup flags</div><div className="cf-kpi-v">{incidents.length}</div></a>
      <div className="cf-card cf-kpi"><div className="cf-lbl">Returned to pool this week</div><div className="cf-kpi-v">—</div><div className="cf-meta">Not separated in the current ledger</div></div>
    </section>
    {error && <div role="alert" className="cf-banner cf-banner-bad">{error}</div>}

    <div style={{ display: "flex", flexWrap: "wrap", gap: 24, alignItems: "stretch" }}>
      <section id="stale-bids" className="cf-card" aria-labelledby="stale-h" style={{ flex: "3 1 560px", minWidth: 0 }}>
        <div style={{ padding: "18px 24px 12px", display: "flex", alignItems: "center", gap: 12 }}>
          <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(251,191,36,.12)", color: "#D97706", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></svg>
          </span>
          <div>
            <h2 id="stale-h" className="cf-h2">Stale bids</h2>
            <p className="cf-sub">Assigned with no status change for 3 days. Clears when the status moves.</p>
          </div>
        </div>
        {staleBids.length === 0 ? <p className="cf-meta" style={{ padding: "0 24px 18px" }}>No stale bids.</p> : (
          <ul style={{ listStyle: "none", margin: 0, padding: "0 24px 12px" }}>
            {staleBids.map((bid) => (
              <li key={bid.claim_id} id={`stale-${bid.claim_id}`} style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: "14px 0", borderTop: "1px solid var(--cf-line)" }}>
                <div style={{ flex: "1 1 260px", minWidth: 0 }}>
                  <div style={{ font: "500 16px var(--cf-display)" }}>{bid.title}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", marginTop: 4 }}>
                    <span className="cf-id">{bid.solicitation_number || "—"}</span>
                    <span className="cf-meta"> · {(bid.assignee?.full_name || "Unknown").toUpperCase()}</span>
                  </div>
                  <p className="cf-meta">No status change since {bid.last_status_at ? new Date(bid.last_status_at).toLocaleString() : "pickup"}</p>
                </div>
                {bid.href ? <Link className="cf-btn cf-btn-secondary cf-btn-sm" href={bid.href}>Open bid</Link> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section id="duplicates" className="cf-card" aria-labelledby="dupe-h" style={{ flex: "2 1 400px", minWidth: 0, borderColor: "rgba(251,113,133,.3)" }}>
        <div style={{ padding: "18px 24px 12px", display: "flex", alignItems: "center", gap: 12 }}>
          <span aria-hidden="true" style={{ width: 32, height: 32, borderRadius: 9, background: "rgba(251,113,133,.12)", color: "#E11D48", display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="13" height="13" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>
          </span>
          <div>
            <h2 id="dupe-h" className="cf-h2">Duplicate flags</h2>
            <p className="cf-sub">Every blocked pickup is kept for your review. Resolved items leave this panel.</p>
          </div>
        </div>
        {incidents.length === 0 ? <p className="cf-meta" style={{ padding: "0 24px 18px" }}>No unresolved duplicate flags.</p> : incidents.map((incident) => (
          <div key={incident.id} id={`duplicate-${incident.id}`} style={{ margin: "0 24px 20px", borderTop: "1px solid var(--cf-line)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            <div><div style={{ font: "500 16px var(--cf-display)" }}>Solicitation {incident.solicitation_number}</div></div>
            <p style={{ fontSize: 14, color: "var(--cf-text-2)", lineHeight: 1.55 }}>{incident.attempted_by?.full_name || "Unknown"} tried to pick this up. It is owned by {incident.existing_agent?.full_name || "Unknown"}. Detected {new Date(incident.detected_at || incident.created_at).toLocaleString()}. {(incident.attempt_count ?? 1) > 1 ? `${incident.attempt_count} attempts.` : ""}</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <input className="cf-input" style={{ flex: "1 1 180px" }} placeholder="Resolution note" aria-label={`Resolution note for ${incident.solicitation_number}`} value={resolutionByIncident[incident.id] || ""} onChange={(event) => setResolutionByIncident({ ...resolutionByIncident, [incident.id]: event.target.value })} />
              <button type="button" className="cf-btn cf-btn-primary cf-btn-sm" onClick={() => resolveIncident(incident)}>Resolve</button>
            </div>
          </div>
        ))}
      </section>
    </div>

    <section className="cf-card" aria-labelledby="tracked-h" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <div style={{ padding: "20px 24px 14px" }}>
        <h2 id="tracked-h" className="cf-h2">Tracked opportunities</h2>
        <p className="cf-sub">Reassign or return active work to the pool. Submitted work is closed and its history kept.</p>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table className="cf-table">
          <thead><tr><th>Opportunity</th><th className="cf-num">Bid amount</th><th>State</th><th>Owner</th><th>Manager action</th></tr></thead>
          <tbody>
            {opportunities.length === 0 ? <tr><td colSpan={5} style={{ textAlign: "center", color: "var(--cf-text-2)" }}>No opportunities have been picked up yet.</td></tr> : opportunities.map((item) => (
              <tr key={item.id} id={`assignment-${item.id}`}>
                <td>
                  <div style={{ fontWeight: 500 }}>{item.title}</div>
                  {item.bid_id ? <Link className="cf-id" href={`/bids/${item.bid_id}`}>{item.solicitation_number || item.external_notice_id}</Link> : <div className="cf-id">{item.solicitation_number || item.external_notice_id}</div>}
                  <details>
                    <summary className="cf-mono cf-meta" style={{ cursor: "pointer" }}>Assignment history ({item.assignment_history?.length || 0})</summary>
                    {item.assignment_history?.length ? item.assignment_history.map((event) => (
                      <div key={event.id} className="cf-meta">{new Date(event.started_at).toLocaleString()} · {event.agent?.full_name || "Unassigned"} · {event.action}{event.actor?.full_name ? ` by ${event.actor.full_name}` : ""}{event.reason ? ` — ${event.reason}` : ""}{event.limit_override ? " · Limit override" : ""}</div>
                    )) : <p className="cf-meta">No assignment events recorded.</p>}
                  </details>
                </td>
                <td className="cf-num">{item.expected_bid_value == null ? "—" : `$${item.expected_bid_value.toLocaleString()}`}</td>
                <td><span className={`cf-pill ${statePill(item.state)}`}>{stateLabel(item.state)}</span></td>
                <td>{item.submitting_agent?.full_name || item.assignee?.full_name || (item.state === "available" ? "Pool" : "?")}</td>
                <td>
                  {item.state === "assigned" || item.state === "available" ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
                      <select className="cf-select" style={{ width: 160 }} aria-label="Agent" value={targetByOpportunity[item.id] || ""} onChange={(event) => setTargetByOpportunity({ ...targetByOpportunity, [item.id]: event.target.value })}>
                        <option value="">Select agent</option>
                        {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}
                      </select>
                      <input className="cf-input" style={{ width: 180 }} aria-label="Reason for next action" placeholder="Reason (needed to override)" value={reasonByOpportunity[item.id] || ""} onChange={(event) => setReasonByOpportunity({ ...reasonByOpportunity, [item.id]: event.target.value })} />
                      <label className="cf-meta" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={Boolean(overrideByOpportunity[item.id])} onChange={(event) => setOverrideByOpportunity({ ...overrideByOpportunity, [item.id]: event.target.checked })} />Override limits</label>
                      {item.state === "assigned" ? <button type="button" className="cf-btn cf-btn-primary cf-btn-sm" onClick={() => reassign(item)}>Reassign</button> : opportunityDeadlinePassed(item.response_deadline) ? <span className="cf-meta">Deadline passed</span> : <button type="button" className="cf-btn cf-btn-primary cf-btn-sm" onClick={() => assignFromPool(item)}>Assign</button>}
                      {item.state === "assigned" ? <button type="button" className="cf-btn cf-btn-ghost cf-btn-sm" onClick={() => release(item)}>Return to pool</button> : null}
                    </div>
                  ) : <span className="cf-mono cf-meta">CLOSED WORK — HISTORY KEPT</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
    </PageMain>
  </>;
}
