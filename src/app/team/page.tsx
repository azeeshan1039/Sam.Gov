'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, UserPlus } from 'lucide-react';
import { getStoredUser, type AuthUser } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface TeamMember {
  id: number;
  email: string;
  full_name: string;
  job_title?: string | null;
  role: 'admin' | 'member';
  monthly_goal?: number;
  created_at?: string | null;
}

interface PendingInvite {
  id: number;
  email: string;
  token: string;
  created_at?: string | null;
}

interface TeamOverviewResponse {
  slots_remaining: number;
  max_team_members: number;
  company_monthly_goal: number;
  members: TeamMember[];
  pending_invites: PendingInvite[];
}

export default function TeamPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [teamLoading, setTeamLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLoading, setInviteLoading] = useState(false);
  const [teamData, setTeamData] = useState<TeamOverviewResponse>({
    slots_remaining: 0,
    max_team_members: 5,
    company_monthly_goal: 0,
    members: [],
    pending_invites: [],
  });
  const [goalDrafts, setGoalDrafts] = useState<Record<number, string>>({});
  const [savingGoalId, setSavingGoalId] = useState<number | null>(null);

  useEffect(() => {
    const currentUser = getStoredUser();
    if (!currentUser) {
      router.replace('/register');
      return;
    }
    if (currentUser.role !== 'admin') {
      router.replace('/negotiations');
      return;
    }
    setUser(currentUser);
    setLoading(false);
  }, [router]);

  const fetchTeamData = useCallback(async () => {
    if (!user) return;

    setTeamLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/backend/auth/team?company_id=${user.company_id}&requester_user_id=${user.id}`,
        { cache: 'no-store' }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not load team data');
      }
      const members = data.members || [];
      setTeamData({
        slots_remaining: data.slots_remaining ?? 0,
        max_team_members: data.max_team_members ?? 5,
        company_monthly_goal: data.company_monthly_goal ?? 0,
        members,
        pending_invites: data.pending_invites || [],
      });
      const drafts: Record<number, string> = {};
      for (const member of members) {
        drafts[member.id] = String(member.monthly_goal ?? 50);
      }
      setGoalDrafts(drafts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load team data');
    } finally {
      setTeamLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchTeamData();
  }, [user, fetchTeamData]);

  const sendInvite = async () => {
    if (!user || !inviteEmail.trim()) return;

    setInviteLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/backend/auth/team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: user.company_id,
          requester_user_id: user.id,
          emails: [inviteEmail.trim()],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not send invite');
      }
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        throw new Error(data.errors[0].error || 'Could not send invite');
      }
      setInviteEmail('');
      await fetchTeamData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send invite');
    } finally {
      setInviteLoading(false);
    }
  };

  const saveMemberGoal = async (memberId: number) => {
    if (!user) return;
    const raw = goalDrafts[memberId];
    const goal = Number.parseInt(String(raw ?? ''), 10);
    if (Number.isNaN(goal) || goal < 0) {
      setError('Monthly goal must be a whole number of 0 or more.');
      return;
    }
    const current = teamData.members.find((member) => member.id === memberId);
    if (current && current.monthly_goal === goal) {
      return;
    }

    setSavingGoalId(memberId);
    setError(null);
    try {
      const res = await fetch(`/api/backend/auth/team/members/${memberId}/goal`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_id: user.company_id,
          requester_user_id: user.id,
          monthly_goal: goal,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not save monthly goal');
      }
      setTeamData((prev) => ({
        ...prev,
        company_monthly_goal: data.company_monthly_goal ?? prev.company_monthly_goal,
        members: prev.members.map((member) =>
          member.id === memberId ? { ...member, monthly_goal: data.monthly_goal ?? goal } : member
        ),
      }));
      setGoalDrafts((prev) => ({ ...prev, [memberId]: String(data.monthly_goal ?? goal) }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save monthly goal');
    } finally {
      setSavingGoalId(null);
    }
  };

  if (loading || !user) {
    return (
      <div className="space-y-6 p-6 lg:p-8">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 lg:p-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <Users className="h-6 w-6" />
          Team
        </h1>
        <p className="mt-1 text-muted-foreground">
          Manage teammates, monthly bid goals, and pending invitations.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite Team Members</CardTitle>
          <CardDescription>
            {teamData.slots_remaining} of {teamData.max_team_members} member slots remaining.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row">
          <Input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="member@company.com"
          />
          <Button
            onClick={sendInvite}
            disabled={inviteLoading || !inviteEmail.trim() || teamData.slots_remaining <= 0}
          >
            <UserPlus className="mr-2 h-4 w-4" />
            {inviteLoading ? 'Sending...' : 'Send Invite'}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pending Invites</CardTitle>
        </CardHeader>
        <CardContent>
          {teamLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : teamData.pending_invites.length === 0 ? (
            <p className="text-sm text-muted-foreground">No pending invites.</p>
          ) : (
            <div className="space-y-2">
              {teamData.pending_invites.map((invite) => (
                <div key={invite.id} className="rounded border bg-slate-50 p-3 text-sm">
                  <p className="font-medium">{invite.email}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Team Members</CardTitle>
          <CardDescription>
            Company monthly goal is the sum of individual goals:{' '}
            <span className="font-medium text-foreground">{teamData.company_monthly_goal}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {teamLoading ? (
            <Skeleton className="h-10 w-full" />
          ) : teamData.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">No team members added yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-40">Monthly goal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamData.members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.full_name}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell className="capitalize">{member.role}</TableCell>
                    <TableCell>{member.job_title || '-'}</TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={0}
                        step={1}
                        className="w-24"
                        value={goalDrafts[member.id] ?? String(member.monthly_goal ?? 50)}
                        disabled={savingGoalId === member.id}
                        onChange={(e) =>
                          setGoalDrafts((prev) => ({ ...prev, [member.id]: e.target.value }))
                        }
                        onBlur={() => saveMemberGoal(member.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            (e.target as HTMLInputElement).blur();
                          }
                        }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
