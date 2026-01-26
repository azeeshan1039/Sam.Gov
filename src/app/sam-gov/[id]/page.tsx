
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { SamGovOpportunity } from '@/types/sam-gov'; // Updated import
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import Loading from '@/app/loading';
import { Icons } from '@/components/icons';
import { format, parseISO } from 'date-fns';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import Link from 'next/link';
import { FileText } from 'lucide-react';

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
  const router = useRouter();
  const id = params.id as string;
  const [opportunity, setOpportunity] = useState<SamGovOpportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailedDescription, setDetailedDescription] = useState<string | null>(null);
  const [descriptionLoading, setDescriptionLoading] = useState<boolean>(false);


  useEffect(() => {
    const fetchOpportunityDetails = async () => {
      if (!id) return;

      setLoading(true);
      setError(null);
      setDetailedDescription(null);

      try {
        // Fetch all opportunities from the API route
        const response = await fetch(`/api/sam-gov`);
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const allOpportunities: SamGovOpportunity[] = await response.json();
        const foundOpportunity = allOpportunities.find(opp => opp.id === id);

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
              } else {
                const data = await descResponse.json();
                setDetailedDescription(data.content || 'No description available.');
              }
            } catch (descError: any) {
              console.error('Failed to fetch detailed description:', descError);
              setDetailedDescription(`Failed to load description. Error: ${descError.message}`);
            } finally {
              setDescriptionLoading(false);
            }
          } else {
            setDetailedDescription(initialDesc || 'No description available.');
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

  if (loading) {
    return <Loading />;
  }

  if (error) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center p-6">
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
      </main>
    );
  }

  if (!opportunity) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p>Opportunity details could not be loaded.</p>
      </main>
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

  const formattedClosingDate = opportunity.closingDate
    ? format(parseISO(opportunity.closingDate), 'PPP HH:mm zzz')
    : 'N/A';

  return (
    <main className="flex-1 p-6 bg-gradient-to-br from-secondary/30 to-background animate-fadeIn">
      <div className="container mx-auto max-w-4xl">
        <Button onClick={() => router.back()} variant="outline" className="mb-6 group transition-transform hover:-translate-x-1">
          <Icons.arrowRight className="mr-2 h-4 w-4 transform rotate-180 group-hover:animate-pulse" />
          Back to Listings
        </Button>

        <Card className="shadow-xl hover:shadow-2xl transition-shadow duration-300 rounded-lg overflow-hidden border-primary/20 animate-slideUp">
          <CardHeader className="bg-primary/10 p-6 border-b border-primary/20">
            <CardTitle className="text-2xl font-bold text-primary line-clamp-3">{opportunity.title || 'N/A'}</CardTitle>
            <CardDescription className="text-sm text-muted-foreground pt-2">Notice ID: {opportunity.id}</CardDescription>
          </CardHeader>
          <CardContent className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div className="opacity-90 transition-opacity hover:opacity-100">
                <Label className="font-semibold text-primary">NAICS Code</Label>
                <p>{opportunity.ncode || 'N/A'}</p>
              </div>
              <div className="opacity-90 transition-opacity hover:opacity-100">
                <Label className="font-semibold text-primary">Department</Label>
                <p>{opportunity.department || 'N/A'}</p>
              </div>
              <div className="opacity-90 transition-opacity hover:opacity-100">
                <Label className="font-semibold text-primary">Subtier</Label>
                <p>{opportunity.subtier || 'N/A'}</p>
              </div>
              <div className="opacity-90 transition-opacity hover:opacity-100">
                <Label className="font-semibold text-primary">Office</Label>
                <p>{opportunity.office || 'N/A'}</p>
              </div>
              <div className="opacity-90 transition-opacity hover:opacity-100">
                <Label className="font-semibold text-primary">Original Link</Label>
                {opportunity.link && opportunity.link !== '#' ? (
                  <a
                    href={opportunity.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent hover:underline break-all flex items-center gap-1"
                  >
                    View on SAM.gov <Icons.externalLink className="h-3 w-3" />
                  </a>
                ) : (
                  <p>N/A</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              <div className="opacity-90 transition-opacity hover:opacity-100">
                <Label className="font-semibold text-primary">Type</Label>
                <p>{opportunity.type || 'N/A'}</p>
              </div>
              <div className="opacity-90 transition-opacity hover:opacity-100">
                <Label className="font-semibold text-primary">Execute Location</Label>
                <p>{renderLocation(opportunity.location)}</p>
              </div>
              <div className="opacity-90 transition-opacity hover:opacity-100">
                <Label className="font-semibold text-primary">Office Address</Label>
                <p>{opportunity.officeAddress || 'N/A'}</p>
              </div>
              <div className="opacity-90 transition-opacity hover:opacity-100">
                <Label className="font-semibold text-primary">Closing Date</Label>
                <p>{formattedClosingDate}</p>
              </div>
            </div>

            <div className="md:col-span-2 pt-4 border-t mt-4">
              <Label className="text-xl font-semibold text-primary mb-2 block">Description</Label>
              {descriptionLoading ? (
                <Skeleton className="h-20 w-full" />
              ) : (
                <p className="text-foreground prose prose-sm max-w-none break-words whitespace-pre-wrap">
                  {detailedDescription || 'No description available.'}
                </p>
              )}
            </div>

            {/* Attachments Section */}
            {opportunity.resourceLinks && opportunity.resourceLinks.length > 0 && (
              <div className="md:col-span-2 pt-4 border-t mt-4">
                <Label className="text-xl font-semibold text-primary mb-3 block">
                  Attachments ({opportunity.resourceLinks.length})
                </Label>
                <ul className="space-y-2">
                  {opportunity.resourceLinks.map((resourceLink, idx) => {
                    // Handle both string URLs and {name, link} objects
                    const isObject = typeof resourceLink === 'object' && resourceLink !== null;
                    const linkUrl = isObject ? resourceLink.link : resourceLink;
                    const linkName = isObject ? resourceLink.name : getFileName(resourceLink);
                    const displayName = linkName === 'Attachment' ? `Attachment ${idx + 1}` : linkName;

                    return (
                      <li key={idx} className="flex items-center">
                        <a
                          href={linkUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-accent hover:underline flex items-center gap-2 p-2 rounded-md hover:bg-accent/10 transition-colors"
                        >
                          <FileText className="h-4 w-4 flex-shrink-0" />
                          <span className="break-all">{displayName}</span>
                          <Icons.externalLink className="h-3 w-3 flex-shrink-0 ml-1" />
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            <div className="md:col-span-2 mt-6 gap-10 flex justify-end">
              <Button asChild size="lg">
                <Link href={`/sam-gov/${id}/bid-summary`}>
                  Start Bidding Process
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <style jsx global>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fadeIn {
          animation: fadeIn 0.5s ease-out forwards;
        }

        @keyframes slideUp {
          from { transform: translateY(20px); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slideUp {
          animation: slideUp 0.5s ease-out forwards;
        }
      `}</style>
    </main>
  );
}
