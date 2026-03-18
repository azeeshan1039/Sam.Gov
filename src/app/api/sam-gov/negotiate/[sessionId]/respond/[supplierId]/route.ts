import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend-config';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; supplierId: string }> }
) {
  try {
    const { sessionId, supplierId } = await params;
    const response = await fetch(
      `${BACKEND_URL}/api/negotiate/${sessionId}/respond/${supplierId}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return NextResponse.json(
        { error: errorText || 'Failed to respond to supplier' },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error responding to supplier:', error);
    return NextResponse.json(
      { error: 'Failed to respond to supplier' },
      { status: 500 }
    );
  }
}
