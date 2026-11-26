'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { UserPlus } from 'lucide-react';
import { getStoredUser, type AuthUser } from '@/lib/auth';
import { AdminTabs, PageBand, PageMain } from '@/components/design/PageFrame';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';

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
    if (current.role !== 'admin') return router.replace('/my-bids?access=manager');
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

  if (!user || loading) return <PageMain><Skeleton className="h-9 w-52" /><Skeleton className="h-48 w-full" /><Skeleton className="h-72 w-full" /></PageMain>;

  return (
    <>
      <PageBand eyebrow="ADMIN" title="Team & access" lead="Admins, agents, workload limits, and who can pick up work." />
      <AdminTabs current="/team" />
      <PageMain>
      {error && <div role="alert" className="cf-banner cf-banner-bad">{error}</div>}
      {notice && <div role="status" className="cf-banner cf-banner-ok">{notice}</div>}

      <section className="cf-card" aria-labelledby="invite-h">
        <div style={{ padding: "20px 24px 0" }}>
          <h2 id="invite-h" className="cf-h2">Invite a teammate</h2>
          <p className="cf-sub">{team.slots_remaining} of {team.max_team_members} agent slots remaining. Admins do not consume agent slots.</p>
        </div>
        <div style={{ padding: "16px 24px 24px", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "flex-end" }}>
          <div className="cf-flt" style={{ flex: "1 1 160px" }}><Label htmlFor="invite-full-name">Full name</Label><Input id="invite-full-name" className="cf-input" value={invite.full_name} onChange={(e) => setInvite({ ...invite, full_name: e.target.value })} placeholder="Employee name" /></div>
          <div className="cf-flt" style={{ flex: "2 1 220px" }}><Label htmlFor="invite-email">Email</Label><Input id="invite-email" className="cf-input" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="teammate@company.com" /></div>
          <div className="cf-flt" style={{ flex: "1 1 120px" }}><Label htmlFor="invite-role">Role</Label><select id="invite-role" className="cf-select" value={invite.role} onChange={(e) => setInvite({ ...invite, role: e.target.value as Role })}><option value="agent">Agent</option><option value="admin">Admin</option></select></div>
          <div className="cf-flt" style={{ flex: "1 1 140px" }}><Label htmlFor="invite-start-date">Start date</Label><Input id="invite-start-date" className="cf-date" type="date" value={invite.employment_start_date} onChange={(e) => setInvite({ ...invite, employment_start_date: e.target.value })} /></div>
          <div className="cf-flt" style={{ flex: "1 1 120px" }}><Label htmlFor="invite-active-bid-limit">Active-bid limit</Label><Input id="invite-active-bid-limit" className="cf-input" type="number" min="0" value={invite.active_bid_limit} onChange={(e) => setInvite({ ...invite, active_bid_limit: e.target.value })} disabled={invite.role === 'admin'} /></div>
          <div className="cf-flt" style={{ flex: "1 1 140px" }}><Label htmlFor="invite-dollar-ceiling">Dollar ceiling</Label><Input id="invite-dollar-ceiling" className="cf-input" type="number" min="0" value={invite.dollar_ceiling} onChange={(e) => setInvite({ ...invite, dollar_ceiling: e.target.value })} disabled={invite.role === 'admin'} /></div>
          <button type="button" className="cf-btn cf-btn-primary" onClick={sendInvite} disabled={!invite.full_name.trim() || !invite.email.trim() || (invite.role === 'agent' && team.slots_remaining < 1)}><UserPlus size={16} />Send invite</button>
        </div>
      </section>

      <section className="cf-card" aria-labelledby="roster-h" style={{ overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 12px" }}>
          <h2 id="roster-h" className="cf-h2">Roster</h2>
          <p className="cf-sub">Company monthly goal: {team.company_monthly_goal}. Deactivation returns active bids to the pool.</p>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table className="cf-table">
            <thead><tr><th>Person</th><th>Role</th><th>Title / start</th><th>Monthly goal</th><th>Active bids</th><th>Dollar ceiling</th><th>Status</th><th></th></tr></thead>
            <tbody>{team.members.map((member) => {
              const draft = drafts[member.id];
              if (!draft) return null;
              return <tr key={member.id} style={member.is_active ? undefined : { opacity: 0.6 }}>
                <td><div style={{ fontWeight: 500 }}>{member.full_name}</div><div className="cf-meta">{member.email}</div></td>
                <td><select aria-label={`Role for ${member.full_name}`} className="cf-select" value={draft.role} onChange={(e) => setDrafts({ ...drafts, [member.id]: { ...draft, role: e.target.value as Role } })}><option value="agent">Agent</option><option value="admin">Admin</option></select></td>
                <td><div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 160 }}><Input aria-label={`Job title for ${member.full_name}`} className="cf-input" value={draft.job_title || ''} onChange={(e) => setDrafts({ ...drafts, [member.id]: { ...draft, job_title: e.target.value } })} placeholder="Job title" /><Input aria-label={`Start date for ${member.full_name}`} className="cf-date" type="date" value={draft.employment_start_date || ''} onChange={(e) => setDrafts({ ...drafts, [member.id]: { ...draft, employment_start_date: e.target.value } })} /></div></td>
                <td><Input aria-label={`Monthly goal for ${member.full_name}`} className="cf-input" style={{ width: 96 }} type="number" min="0" value={draft.monthly_goal} disabled={draft.role === 'admin'} onChange={(e) => setDrafts({ ...drafts, [member.id]: { ...draft, monthly_goal: Number(e.target.value) } })} /></td>
                <td><Input aria-label={`Active-bid limit for ${member.full_name}`} className="cf-input" style={{ width: 96 }} type="number" min="0" value={draft.active_bid_limit} disabled={draft.role === 'admin'} onChange={(e) => setDrafts({ ...drafts, [member.id]: { ...draft, active_bid_limit: Number(e.target.value) } })} /></td>
                <td><Input aria-label={`Dollar ceiling for ${member.full_name}`} className="cf-input" style={{ width: 128 }} type="number" min="0" value={draft.dollar_ceiling} disabled={draft.role === 'admin'} onChange={(e) => setDrafts({ ...drafts, [member.id]: { ...draft, dollar_ceiling: Number(e.target.value) } })} /></td>
                <td>{member.is_active ? <span className="cf-pill cf-pill-sub">Active</span> : <span className="cf-pill">Inactive</span>}</td>
                <td><div style={{ display: "flex", gap: 8 }}><button type="button" className="cf-btn cf-btn-primary cf-btn-sm" aria-label={`Save ${member.full_name}`} onClick={() => updateMember(member)} disabled={savingId === member.id}>Save</button><button type="button" className="cf-btn cf-btn-secondary cf-btn-sm" aria-label={`${member.is_active ? 'Deactivate' : 'Reactivate'} ${member.full_name}`} onClick={() => updateMember(member, !member.is_active)} disabled={savingId === member.id}>{member.is_active ? 'Deactivate' : 'Reactivate'}</button></div></td>
              </tr>;
            })}</tbody>
          </table>
        </div>
      </section>

      <section className="cf-card" aria-labelledby="pending-h">
        <div style={{ padding: "20px 24px 12px" }}><h2 id="pending-h" className="cf-h2">Pending invites</h2></div>
        <div style={{ padding: "0 24px 20px" }}>{team.pending_invites.length ? team.pending_invites.map((item) => <div key={item.id} style={{ borderTop: "1px solid var(--cf-line)", padding: "10px 0", fontSize: 14 }}><span style={{ fontWeight: 500 }}>{item.full_name || item.email}</span> · {item.email} <span className="cf-meta">({item.role})</span></div>) : <p className="cf-meta">No pending invites.</p>}</div>
      </section>
      </PageMain>
    </>
  );
}
