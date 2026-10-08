'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ClipboardCheck } from 'lucide-react';
import { getStoredUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
      const [opportunityResponse, duplicateResponse, staleResponse, teamResponse] = await Promise.all([
        fetch('/api/backend/opportunities/company', { cache: 'no-store' }),
        fetch('/api/backend/opportunities/duplicates', { cache: 'no-store' }),
        fetch('/api/backend/opportunities/stale', { cache: 'no-store' }),
        fetch('/api/backend/auth/team', { cache: 'no-store' }),
      ]);
      const [opportunityData, duplicateData, staleData, teamData] = await Promise.all([
        opportunityResponse.json(), duplicateResponse.json(), staleResponse.json(), teamResponse.json(),
      ]);
      if (!opportunityResponse.ok) throw new Error(opportunityData.error || 'Could not load opportunity ledger');
      if (!duplicateResponse.ok) throw new Error(duplicateData.error || 'Could not load duplicate incidents');
      if (!staleResponse.ok) throw new Error(staleData.error || 'Could not load stale bids');
      if (!teamResponse.ok) throw new Error(teamData.error || 'Could not load roster');
      setOpportunities(opportunityData.opportunities || []);
      setIncidents(duplicateData.incidents || []);
      setStaleBids(staleData.bids || []);
      setAgents((teamData.members || []).filter((member: { role: string; is_active: boolean }) => member.role === 'agent' && member.is_active));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load work management');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const user = getStoredUser();
    if (!user) return router.replace('/login');
    if (user.role !== 'admin') return router.replace('/');
    void load();
  }, [load, router]);

  const clearActionControls = (opportunityId: number) => {
    setTargetByOpportunity((current) => ({ ...current, [opportunityId]: '' }));
    setReasonByOpportunity((current) => ({ ...current, [opportunityId]: '' }));
    setOverrideByOpportunity((current) => ({ ...current, [opportunityId]: false }));
  };
  useEffect(() => {
    if (loading || window.location.hash !== '#stale-bids') return;
    document.getElementById('stale-bids')?.scrollIntoView();
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

  if (loading) return <div className="space-y-5 p-6 lg:p-8"><Skeleton className="h-9 w-64" /><Skeleton className="h-80 w-full" /></div>;

  return <div className="space-y-6 p-6 lg:p-8">
    <div><h1 className="flex items-center gap-2 text-2xl font-bold"><ClipboardCheck className="h-6 w-6" />Work management</h1><p className="mt-1 text-muted-foreground">Company-wide ownership, reassignment, pool returns, duplicate resolution, and stale bids.</p></div>
    {error && <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
    <Card><CardHeader><CardTitle>Tracked opportunities</CardTitle><CardDescription>SAM.gov stays the source catalog; this ledger stores only company workflow state and immutable assignment history.</CardDescription></CardHeader><CardContent className="overflow-x-auto">
      <Table><TableHeader><TableRow><TableHead>Opportunity</TableHead><TableHead>Value</TableHead><TableHead>State</TableHead><TableHead>Owner</TableHead><TableHead>Manager action</TableHead></TableRow></TableHeader>
        <TableBody>{opportunities.length ? opportunities.map((item) => <TableRow key={item.id}>
          <TableCell className="max-w-sm"><div className="font-medium">{item.title}</div><div className="text-xs text-muted-foreground">{item.solicitation_number || item.external_notice_id}</div>
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer font-medium text-primary">Assignment history ({item.assignment_history?.length || 0})</summary>
              <p className="mt-2 text-muted-foreground">Immutable ownership audit trail</p>
              {item.assignment_history?.length ? <ol className="mt-2 space-y-2 border-l pl-3">{item.assignment_history.map((event) => <li key={event.id}>
                <p><span className="font-medium capitalize">{event.action}</span> · Agent: {event.agent?.full_name || 'Unassigned'}</p>
                <p className="text-muted-foreground">Manager / actor: {event.actor?.full_name || 'Unknown'} · {new Date(event.started_at).toLocaleString()}</p>
                <p>Reason: {event.reason || 'No reason provided'}{event.limit_override ? ' · Limit override' : ''}</p>
              </li>)}</ol> : <p className="mt-2 text-muted-foreground">No assignment events recorded.</p>}
            </details>
          </TableCell>
          <TableCell>{item.expected_bid_value == null ? '-' : `$${item.expected_bid_value.toLocaleString()}`}</TableCell><TableCell className="capitalize">{item.state}</TableCell><TableCell>{item.assignee?.full_name || 'Pool'}</TableCell>
          <TableCell>{item.state === 'assigned' || item.state === 'available' ? <div className="flex min-w-[520px] items-end gap-2"><label className="grid gap-1 text-xs">Agent<select className="h-9 rounded-md border bg-background px-2 text-sm" value={targetByOpportunity[item.id] || ''} onChange={(event) => setTargetByOpportunity({ ...targetByOpportunity, [item.id]: event.target.value })}><option value="">Select agent</option>{agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.full_name}</option>)}</select></label><label className="grid gap-1 text-xs">Reason for next action<Input className="w-44" placeholder="Optional unless overriding" value={reasonByOpportunity[item.id] || ''} onChange={(event) => setReasonByOpportunity({ ...reasonByOpportunity, [item.id]: event.target.value })} /></label><label className="mb-2 flex items-center gap-1 text-xs"><input type="checkbox" checked={Boolean(overrideByOpportunity[item.id])} onChange={(event) => setOverrideByOpportunity({ ...overrideByOpportunity, [item.id]: event.target.checked })} />Override limits</label>{item.state === 'assigned' ? <Button size="sm" onClick={() => reassign(item)}>Reassign</Button> : <Button size="sm" onClick={() => assignFromPool(item)}>Assign</Button>}{item.state === 'assigned' && <Button size="sm" variant="outline" onClick={() => release(item)}>Return to pool</Button>}</div> : <span className="text-sm text-muted-foreground">Closed work — history retained</span>}</TableCell>
        </TableRow>) : <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground">No opportunities have been picked up yet.</TableCell></TableRow>}</TableBody>
      </Table>
    </CardContent></Card>

    <Card id="stale-bids"><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Stale bids</CardTitle><CardDescription>Assigned bids with no status change for 3 days. The list clears when the internal status changes.</CardDescription></CardHeader><CardContent className="space-y-3">{staleBids.length ? staleBids.map((bid) => <div key={bid.claim_id} className="rounded border p-3"><p className="font-medium">{bid.solicitation_number || bid.title}</p><p className="text-sm text-muted-foreground">{bid.title}</p><p className="text-xs text-muted-foreground">{bid.assignee?.full_name || 'Unknown'} · no status change since {bid.last_status_at ? new Date(bid.last_status_at).toLocaleString() : 'pickup'}</p></div>) : <p className="text-sm text-muted-foreground">No stale bids.</p>}</CardContent></Card>

    <Card><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" />Unresolved duplicate flags</CardTitle><CardDescription>Every blocked pickup is retained for manager review. Resolved items leave this panel.</CardDescription></CardHeader><CardContent className="space-y-3">{incidents.length ? incidents.map((incident) => <div key={incident.id} className="rounded border p-3"><div className="flex flex-wrap justify-between gap-2"><div><p className="font-medium">Solicitation {incident.solicitation_number}</p><p className="text-sm text-muted-foreground">Attempted by {incident.attempted_by?.full_name || 'Unknown'}; owned by {incident.existing_agent?.full_name || 'Unknown'}</p><p className="text-xs text-muted-foreground">Detected {new Date(incident.detected_at || incident.created_at).toLocaleString()}</p></div><span className="text-sm capitalize">{incident.status}</span></div><div className="mt-3 flex gap-2"><Input placeholder="Resolution note" value={resolutionByIncident[incident.id] || ''} onChange={(event) => setResolutionByIncident({ ...resolutionByIncident, [incident.id]: event.target.value })} /><Button onClick={() => resolveIncident(incident)}>Resolve</Button></div></div>) : <p className="text-sm text-muted-foreground">No unresolved duplicate flags.</p>}</CardContent></Card>
  </div>;
}
