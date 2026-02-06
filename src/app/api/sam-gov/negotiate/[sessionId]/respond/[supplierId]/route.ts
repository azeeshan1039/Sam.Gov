import { NextRequest, NextResponse } from 'next/server';

const PYTHON_SERVER_URL = process.env.PYTHON_SERVER_URL || 'https://backendgovai.onrender.com';


export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; supplierId: string }> }
) {
  try {
    const { sessionId, supplierId } = await params;
    const response = await fetch(
      `${PYTHON_SERVER_URL}/api/negotiate/${sessionId}/respond/${supplierId}`,
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
