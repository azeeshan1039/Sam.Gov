'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Handshake, Clock, CheckCircle2, AlertCircle, ArrowRight, Building2 } from 'lucide-react';
import { format } from 'date-fns';

interface NegotiationSession {
  id: number;
  opportunity_id: string;
  opportunity_title: string;
  status: string;
  created_at: string;
  target_price: number;
  suppliers: {
    id: number;
    company_name: string;
    status: string;
    negotiation_round: number;
    final_price?: number;
  }[];
}

export default function NegotiationsPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<NegotiationSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSessions = async () => {
      try {
        // Fetch from backend API
        const response = await fetch('/api/sam-gov/sessions', {
          cache: 'no-store',
        });

        if (response.ok) {
          const data = await response.json();
          console.log('Negotiations page - fetched sessions:', data.sessions?.length, data.sessions);
          if (data.sessions && data.sessions.length > 0) {
            setSessions(data.sessions);
          }
        } else {
          console.error('Failed to fetch sessions from backend');
        }
      } catch (err) {
        console.error('Error fetching negotiations:', err);
        setError('Could not load negotiations from server');
      } finally {
        setLoading(false);
      }
    };

    fetchSessions();
  }, []);

  const getStatusBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active':
      case 'negotiating':
        return <Badge className="bg-blue-100 text-blue-700 border-blue-300"><Clock className="w-3 h-3 mr-1" />Active</Badge>;
      case 'bid_submitted':
        return <Badge className="bg-purple-100 text-purple-700 border-purple-300"><CheckCircle2 className="w-3 h-3 mr-1" />Bid Submitted</Badge>;
      case 'completed':
        return <Badge className="bg-green-100 text-green-700 border-green-300"><CheckCircle2 className="w-3 h-3 mr-1" />Completed</Badge>;
      case 'cancelled':
        return <Badge className="bg-red-100 text-red-700 border-red-300"><AlertCircle className="w-3 h-3 mr-1" />Cancelled</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-300"><AlertCircle className="w-3 h-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const navigateToNegotiation = (session: NegotiationSession) => {
    router.push(`/sam-gov/${session.opportunity_id}/quotenegotiation`);
  };

  if (loading) {
    return (
      <div className="p-6 lg:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-64" />
          </div>
        </div>
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Handshake className="h-6 w-6" />
            Active Negotiations
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your ongoing vendor negotiations and RFQ processes
          </p>
        </div>
        <Button onClick={() => router.push('/sam-gov')}>
          <Building2 className="mr-2 h-4 w-4" />
          Browse Opportunities
        </Button>
      </div>

      {error && (
        <div className="rounded border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Handshake className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No Active Negotiations</h3>
            <p className="text-muted-foreground text-center mb-4">
              You have not started any vendor negotiations yet.<br />
              Browse opportunities and start negotiating with vendors.
            </p>
            <Button onClick={() => router.push('/sam-gov')}>
              Browse SAM.gov Opportunities
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Negotiation Sessions</CardTitle>
            <CardDescription>
              Click on a session to view details and continue negotiating
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Opportunity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Vendors</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow
                    key={session.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => navigateToNegotiation(session)}
                  >
                    <TableCell className="font-medium max-w-md truncate">
                      {session.opportunity_title}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(session.status)}
                    </TableCell>
                    <TableCell>
                      {session.suppliers?.length || 0} vendor(s)
                    </TableCell>
                    <TableCell>
                      {format(new Date(session.created_at), 'MMM d, yyyy')}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm">
                        View <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

