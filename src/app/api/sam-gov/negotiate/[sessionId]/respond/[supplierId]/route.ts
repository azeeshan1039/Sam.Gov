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
      throw new Error('Failed to respond to supplier');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error responding to supplier:', error);
    return NextResponse.json(
      { error: 'Failed to respond to supplier' },
      { status: 500 }
    );
  }
}
