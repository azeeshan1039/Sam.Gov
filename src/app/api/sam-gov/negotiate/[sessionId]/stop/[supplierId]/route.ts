import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend-config';
import { backendAuthHeaders } from '@/lib/backend-auth';


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; supplierId: string }> }
) {
  try {
    const { sessionId, supplierId } = await params;
    const body = await request.json().catch(() => ({}));
    const response = await fetch(
      `${BACKEND_URL}/api/negotiate/${sessionId}/stop/${supplierId}`,
      {
        method: 'POST',
        headers: backendAuthHeaders(request),
        body: JSON.stringify(body),
      }
    );
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Error stopping negotiation:', error);
    return NextResponse.json(
      { error: 'Failed to stop negotiation' },
      { status: 500 }
    );
  }
}
