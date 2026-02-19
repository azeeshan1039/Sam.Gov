import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend-config';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const response = await fetch(`${BACKEND_URL}/api/negotiate/${sessionId}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('Failed to fetch negotiation status');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching negotiation status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch negotiation status' },
      { status: 500 }
    );
  }
}