import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend-config';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; supplierId: string }> }
) {
  try {
    const { sessionId, supplierId } = await params;
    const body = await request.json();
    
    const response = await fetch(
      `${BACKEND_URL}/api/negotiate/${sessionId}/send/${supplierId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      throw new Error('Failed to send response');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error sending response:', error);
    return NextResponse.json(
      { error: 'Failed to send response' },
      { status: 500 }
    );
  }
}