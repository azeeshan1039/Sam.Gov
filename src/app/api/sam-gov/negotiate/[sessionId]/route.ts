import { NextRequest, NextResponse } from 'next/server';

const PYTHON_SERVER_URL = process.env.PYTHON_SERVER_URL || 'https://backendgovai.onrender.com';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const response = await fetch(`${PYTHON_SERVER_URL}/api/negotiate/${sessionId}`, {
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