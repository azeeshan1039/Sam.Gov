'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { format, isValid } from 'date-fns';
import { ArrowRight, Search } from 'lucide-react';
import { getStoredUser, type AuthUser } from '@/lib/auth';
import { PageBand, PageMain } from '@/components/design/PageFrame';
import { Skeleton } from '@/components/ui/skeleton';

interface NegotiationSession {
  id: number;
  opportunity_id: string;
  opportunity_title: string;
  status: string;
  created_at: string;
  suppliers: unknown[];
}

const SESSION_STATUS = new Map([
  ['active', { label: 'Active', tone: 'sup' }],
  ['negotiating', { label: 'Active', tone: 'sup' }],
  ['bid_submitted', { label: 'Bid submitted', tone: 'sub' }],
  ['completed', { label: 'Completed', tone: 'won' }],
  ['cancelled', { label: 'Cancelled', tone: 'lost' }],
  ['pending', { label: 'Pending', tone: 'app' }],
]);

export default function NegotiationsPage() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessions, setSessions] = useState<NegotiationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const currentUser = getStoredUser();
    if (!currentUser) {
      router.replace('/register');
      return;
    }
    setUser(currentUser);
  }, [router]);

  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    const fetchSessions = async () => {
      try {
        const response = await fetch(
          '/api/sam-gov/sessions?company_id=' + user.company_id + '&requester_user_id=' + user.id,
          { cache: 'no-store', signal: controller.signal }
        );
        if (!response.ok) throw new Error('Could not load negotiations from the server.');
        const data = await response.json();
        if (!controller.signal.aborted) setSessions(data.sessions ?? []);
      } catch {
        if (!controller.signal.aborted) setError('Could not load negotiations from the server.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };
    void fetchSessions();
    return () => controller.abort();
  }, [user]);

  return (
    <>
      <PageBand
        title="Negotiations"
        lead="Review vendor outreach and continue your RFQs."
        actions={
          <Link className="cf-btn cf-btn-primary" href="/opportunities?view=all">
            <Search size={16} aria-hidden />Browse opportunities
          </Link>
        }
      />
      <PageMain>
        {error ? <div role="alert" className="cf-banner cf-banner-bad">{error}</div> : (
          <section className="cf-card overflow-hidden" aria-labelledby="negotiation-sessions">
            <div className="px-6 py-5">
              <h2 id="negotiation-sessions" className="cf-h2">Negotiation sessions</h2>
              {!loading && sessions.length > 0 ? (
                <p className="cf-sub">{sessions.length} {sessions.length === 1 ? 'session' : 'sessions'}</p>
              ) : null}
            </div>
            {loading ? (
              <div className="px-6 pb-6" role="status" aria-label="Loading negotiations">
                <Skeleton className="h-32 w-full" />
              </div>
            ) : sessions.length === 0 ? (
              <p className="cf-sub px-6 pb-6">No vendor negotiations yet.</p>
            ) : (
              <div className="cf-table-scroll" role="region" aria-label="Negotiation sessions table" tabIndex={0}>
                <table className="cf-table min-w-[570px]">
                  <thead>
                    <tr>
                      <th scope="col">Opportunity</th>
                      <th scope="col">Status</th>
                      <th scope="col">Vendors</th>
                      <th scope="col">Started</th>
                      <th scope="col" className="cf-num">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessions.map((session) => {
                      const href = '/sam-gov/' + encodeURIComponent(session.opportunity_id) + '/quotenegotiation';
                      const title = session.opportunity_title || session.opportunity_id;
                      const status = SESSION_STATUS.get(session.status.toLowerCase());
                      const started = new Date(session.created_at);
                      return (
                        <tr key={session.id}>
                          <td className="max-w-md break-words">
                            <Link className="cf-link font-medium" href={href}>{title}</Link>
                          </td>
                          <td><span className={'cf-pill cf-pill-' + (status?.tone ?? 'pool')}>{status?.label ?? session.status}</span></td>
                          <td className="cf-mono">{session.suppliers?.length ?? 0}</td>
                          <td className="whitespace-nowrap">{isValid(started) ? format(started, 'MMM d, yyyy') : '—'}</td>
                          <td className="text-right">
                            <Link className="cf-btn cf-btn-secondary cf-btn-sm" href={href} aria-label={'View negotiation for ' + title}>
                              View <ArrowRight size={14} aria-hidden />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}
      </PageMain>
    </>
  );
}
