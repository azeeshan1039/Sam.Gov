import { NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend-config';

export async function GET() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/sam-gov/sessions`, {
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

