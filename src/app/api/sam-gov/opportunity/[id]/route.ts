import { NextResponse } from 'next/server';
import { getSamGovOpportunityById } from '@/services/sam-gov';

/**
 * GET /api/sam-gov/opportunity/[id]
 * Returns a single SAM.gov opportunity by noticeId, falling back to a direct
 * SAM.gov API lookup when the opportunity isn't in the cached recent-list
 * (which only covers the last ~364 days, ptype=o,k, max ~2000 rows).
 */
export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const id = params?.id;
  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  try {
    const opp = await getSamGovOpportunityById(id);
    if (!opp) {
      return NextResponse.json({ error: 'Opportunity not found.' }, { status: 404 });
    }
    return NextResponse.json(opp);
  } catch (err: any) {
    if (err?.code === 'SAMGOV_AUTH') {
      return NextResponse.json(
        { error: 'SAM.gov API key invalid or expired. Update SAM_GOV_API_KEY in .env.local and restart the dev server.' },
        { status: 502 }
      );
    }
    if (err?.code === 'SAMGOV_RATE_LIMIT') {
      return NextResponse.json(
        { error: 'SAM.gov API rate limit hit. Try again in a minute.' },
        { status: 429 }
      );
    }
    console.error('Error in /api/sam-gov/opportunity/[id]:', err);
    return NextResponse.json(
      { error: err?.message || 'Failed to fetch opportunity.' },
      { status: 500 }
    );
  }
}
