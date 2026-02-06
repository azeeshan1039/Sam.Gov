import { NextRequest, NextResponse } from 'next/server';

const PYTHON_SERVER_URL = process.env.PYTHON_SERVER_URL || 'https://backendgovai.onrender.com';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; supplierId: string }> }
) {
  try {
    const { sessionId, supplierId } = await params;
    const response = await fetch(
      `${PYTHON_SERVER_URL}/api/negotiate/${sessionId}/draft/${supplierId}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      throw new Error('Failed to generate draft response');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error generating draft:', error);
    return NextResponse.json(
      { error: 'Failed to generate draft response' },
      { status: 500 }
    );
  }
}