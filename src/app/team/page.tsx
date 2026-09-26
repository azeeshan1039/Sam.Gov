'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, UserPlus } from 'lucide-react';
import { getStoredUser, type AuthUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type Role = 'admin' | 'agent';

interface TeamMember {
  id: number;
  email: string;
  full_name: string;
  job_title?: string | null;
  role: Role;
  is_active: boolean;
  employment_start_date?: string | null;
  monthly_goal: number;
  active_bid_limit: number;
  dollar_ceiling: number;
  deactivated_at?: string | null;
}

interface TeamOverviewResponse {
  slots_remaining: number;
  max_team_members: number;
  company_monthly_goal: number;
  members: TeamMember[];
  pending_invites: Array<{ id: number; email: string; full_name?: string | null; role: Role }>;
}

type MemberDraft = Pick<TeamMember, 'role' | 'job_title' | 'employment_start_date' | 'monthly_goal' | 'active_bid_limit' | 'dollar_ceiling'>;

const emptyTeam: TeamOverviewResponse = { slots_remaining: 0, max_team_members: 5, company_monthly_goal: 0, members: [], pending_invites: [] };

export default function TeamPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [team, setTeam] = useState<TeamOverviewResponse>(emptyTeam);
  const [drafts, setDrafts] = useState<Record<number, MemberDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invite, setInvite] = useState({ full_name: '', email: '', role: 'agent' as Role, employment_start_date: '', active_bid_limit: '5', dollar_ceiling: '100000' });

  useEffect(() => {
    const current = getStoredUser();
    if (!current) return router.replace('/login');
    if (current.role !== 'admin') return router.replace('/');
    setUser(current);
  }, [router]);

  const loadTeam = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const response = await fetch('/api/backend/auth/team', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not load team data');
      const next = data as TeamOverviewResponse;
      setTeam(next);
      setDrafts(Object.fromEntries(next.members.map((member) => [member.id, {
        role: member.role,
        job_title: member.job_title || '',
        employment_start_date: member.employment_start_date || '',
        monthly_goal: member.monthly_goal,
        active_bid_limit: member.active_bid_limit,
        dollar_ceiling: member.dollar_ceiling,
      }])));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load team data');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void loadTeam(); }, [loadTeam]);

  const sendInvite = async () => {
    if (!invite.email.trim()) return;
    setError(null);
    setNotice(null);
    const response = await fetch('/api/backend/auth/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ full_name: invite.full_name.trim(), emails: [invite.email.trim()], role: invite.role, employment_start_date: invite.employment_start_date || null, active_bid_limit: Number(invite.active_bid_limit), dollar_ceiling: Number(invite.dollar_ceiling) }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.errors?.length) {
      setError(data.error || data.errors?.[0]?.error || 'Could not send invite');
      return;
    }
    setInvite((current) => ({ ...current, full_name: '', email: '' }));
    setNotice('Invitation created.');
    await loadTeam();
  };

  const updateMember = async (member: TeamMember, active = member.is_active) => {
    const draft = drafts[member.id];
    if (!draft) return;
    setSavingId(member.id);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/backend/auth/team/members/${member.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, is_active: active }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Could not update team member');
      const released = Number(data.released_opportunities || 0);
      setNotice(released ? `Member updated; ${released} active bid(s) returned to the pool.` : 'Member updated.');
      await loadTeam();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update team member');
    } finally {
      setSavingId(null);
    }
  };

  if (!user || loading) return <div className="space-y-5 p-6 lg:p-8"><Skeleton className="h-9 w-52" /><Skeleton className="h-48 w-full" /><Skeleton className="h-72 w-full" /></div>;

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div><h1 className="flex items-center gap-2 text-2xl font-bold"><Users className="h-6 w-6" />Team & access</h1><p className="mt-1 text-muted-foreground">Manage admins, agents, workload limits, and employment lifecycle.</p></div>
      {error && <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
      {notice && <div className="rounded border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      <Card>
        <CardHeader><CardTitle>Invite a teammate</CardTitle><CardDescription>{team.slots_remaining} of {team.max_team_members} agent slots remaining. Admins do not consume agent slots.</CardDescription></CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-7 md:items-end">
          <div><Label htmlFor="invite-full-name">Full name</Label><Input id="invite-full-name" value={invite.full_name} onChange={(e) => setInvite({ ...invite, full_name: e.target.value })} placeholder="Employee name" /></div>
          <div className="md:col-span-2"><Label htmlFor="invite-email">Email</Label><Input id="invite-email" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="teammate@company.com" /></div>
          <div><Label htmlFor="invite-role">Role</Label><select id="invite-role" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}><option value="agent">Agent</option><option value="admin">Admin</option></select></div>
          <div><Label htmlFor="invite-start-date">Start date</Label><Input id="invite-start-date" type="date" value={invite.employment_start_date} onChange={(e) => setInvite({ ...invite, employment_start_date: e.target.value })} /></div>
          <div><Label htmlFor="invite-active-bid-limit">Active-bid limit</Label><Input id="invite-active-bid-limit" type="number" min="0" value={invite.active_bid_limit} onChange={(e) => setInvite({ ...invite, active_bid_limit: e.target.value })} disabled={invite.role === 'admin'} /></div>
          <div><Label htmlFor="invite-dollar-ceiling">Dollar ceiling</Label><Input id="invite-dollar-ceiling" type="number" min="0" value={invite.dollar_ceiling} onChange={(e) => setInvite({ ...invite, dollar_ceiling: e.target.value })} disabled={invite.role === 'admin'} /></div>
          <Button className="md:col-span-7 md:w-fit" onClick={sendInvite} disabled={!invite.full_name.trim() || !invite.email.trim() || (invite.role === 'agent' && team.slots_remaining < 1)}><UserPlus className="mr-2 h-4 w-4" />Send invite</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Roster</CardTitle><CardDescription>Company monthly goal: {team.company_monthly_goal}. Deactivation automatically returns active bids to the pool.</CardDescription></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Role</TableHead><TableHead>Title / start</TableHead><TableHead>Monthly goal</TableHead><TableHead>Active bids</TableHead><TableHead>Dollar ceiling</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
            <TableBody>{team.members.map((member) => {
              const draft = drafts[member.id];
              if (!draft) return null;
              return <TableRow key={member.id} className={!member.is_active ? 'opacity-60' : ''}>
                <TableCell><div className="font-medium">{member.full_name}</div><div className="text-xs text-muted-foreground">{member.email}</div></TableCell>
                <TableCell><select aria-label={`Role for ${member.full_name}`} className="h-9 rounded-md border bg-background px-2 text-sm" value={draft.role} onChange={(e) => setDrafts({ ...drafts, [member.id]: { ...draft, role: e.target.value as Role } })}><option value="agent">Agent</option><option value="admin">Admin</option></select></TableCell>
                <TableCell className="min-w-44 space-y-2"><Input aria-label={`Job title for ${member.full_name}`} value={draft.job_title || ''} onChange={(e) => setDrafts({ ...drafts, [member.id]: { ...draft, job_title: e.target.value } })} placeholder="Job title" /><Input aria-label={`Start date for ${member.full_name}`} type="date" value={draft.employment_start_date || ''} onChange={(e) => setDrafts({ ...drafts, [member.id]: { ...draft, employment_start_date: e.target.value } })} /></TableCell>
                <TableCell><Input aria-label={`Monthly goal for ${member.full_name}`} className="w-24" type="number" min="0" value={draft.monthly_goal} disabled={draft.role === 'admin'} onChange={(e) => setDrafts({ ...drafts, [member.id]: { ...draft, monthly_goal: Number(e.target.value) } })} /></TableCell>
                <TableCell><Input aria-label={`Active-bid limit for ${member.full_name}`} className="w-24" type="number" min="0" value={draft.active_bid_limit} disabled={draft.role === 'admin'} onChange={(e) => setDrafts({ ...drafts, [member.id]: { ...draft, active_bid_limit: Number(e.target.value) } })} /></TableCell>
                <TableCell><Input aria-label={`Dollar ceiling for ${member.full_name}`} className="w-32" type="number" min="0" value={draft.dollar_ceiling} disabled={draft.role === 'admin'} onChange={(e) => setDrafts({ ...drafts, [member.id]: { ...draft, dollar_ceiling: Number(e.target.value) } })} /></TableCell>
                <TableCell>{member.is_active ? <span className="text-emerald-700">Active</span> : <span>Inactive</span>}</TableCell>
                <TableCell className="space-y-2"><Button aria-label={`Save ${member.full_name}`} size="sm" onClick={() => updateMember(member)} disabled={savingId === member.id}>Save</Button><Button aria-label={`${member.is_active ? 'Deactivate' : 'Reactivate'} ${member.full_name}`} size="sm" variant="outline" onClick={() => updateMember(member, !member.is_active)} disabled={savingId === member.id}>{member.is_active ? 'Deactivate' : 'Reactivate'}</Button></TableCell>
              </TableRow>;
            })}</TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card><CardHeader><CardTitle>Pending invites</CardTitle></CardHeader><CardContent>{team.pending_invites.length ? team.pending_invites.map((item) => <div key={item.id} className="border-b py-2 text-sm"><span className="font-medium">{item.full_name || item.email}</span> · {item.email} <span className="text-muted-foreground">({item.role})</span></div>) : <p className="text-sm text-muted-foreground">No pending invites.</p>}</CardContent></Card>
    </div>
  );
}
