import { NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend-config';

export async function POST() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/negotiate/poll-inbox`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return NextResponse.json(
        { error: errorText || 'Failed to poll inbox' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error polling inbox:', error);
    return NextResponse.json(
      { error: 'Failed to connect to backend for inbox poll' },
      { status: 500 }
    );
  }
}
