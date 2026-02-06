import { NextRequest, NextResponse } from 'next/server';

const PYTHON_SERVER_URL = process.env.PYTHON_SERVER_URL || 'https://backendgovai.onrender.com';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; supplierId: string }> }
) {
  try {
    const { sessionId, supplierId } = await params;
    const response = await fetch(
      `${PYTHON_SERVER_URL}/api/negotiate/${sessionId}/get-supplier-response/${supplierId}`,
      { method: 'POST' }
    );

    if (!response.ok) {
      throw new Error('Failed to get supplier response');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error getting supplier response:', error);
    return NextResponse.json(
      { error: 'Failed to get supplier response' },
      { status: 500 }
    );
  }
}