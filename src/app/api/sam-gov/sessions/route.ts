import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend-config';

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get('company_id');
    const requesterUserId = request.nextUrl.searchParams.get('requester_user_id');
    const query = new URLSearchParams();
    if (companyId) query.set('company_id', companyId);
    if (requesterUserId) query.set('requester_user_id', requesterUserId);
    const suffix = query.toString() ? `?${query.toString()}` : '';

    const response = await fetch(`${BACKEND_URL}/api/sam-gov/sessions${suffix}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json(
        { error: `Backend error: ${error}` },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json(
      { error: 'Failed to fetch negotiation sessions' },
      { status: 500 }
    );
  }
}

