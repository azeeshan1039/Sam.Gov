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
    members: [],
    pending_invites: [],
  });

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
      setTeamData({
        slots_remaining: data.slots_remaining ?? 0,
        max_team_members: data.max_team_members ?? 5,
        members: data.members || [],
        pending_invites: data.pending_invites || [],
      });
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
          Manage teammates and pending invitations for your company workspace.
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {teamData.members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.full_name}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell className="capitalize">{member.role}</TableCell>
                    <TableCell>{member.job_title || '-'}</TableCell>
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
