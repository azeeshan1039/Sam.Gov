import { NextRequest, NextResponse } from 'next/server';

const PYTHON_SERVER_URL = process.env.PYTHON_SERVER_URL || 'https://backendgovai.onrender.com';


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; supplierId: string }> }
) {
  try {
    const { sessionId, supplierId } = await params;
    const response = await fetch(
      `${PYTHON_SERVER_URL}/api/negotiate/${sessionId}/accept/${supplierId}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      throw new Error('Failed to accept quote');
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error accepting quote:', error);
    return NextResponse.json(
      { error: 'Failed to accept quote' },
      { status: 500 }
    );
  }
}