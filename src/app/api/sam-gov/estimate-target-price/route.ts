import { NextRequest, NextResponse } from 'next/server';
import { backendAuthHeaders } from '@/lib/backend-auth';
import { BACKEND_URL } from '@/lib/backend-config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const response = await fetch(`${BACKEND_URL}/api/sam-gov/estimate-target-price`, {
      method: 'POST',
      headers: backendAuthHeaders(request),
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      console.error('Backend estimate-target-price error:', response.status, errText);
      return NextResponse.json(
        { error: 'Failed to estimate target price' },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in estimate-target-price API:', error);
    return NextResponse.json(
      { error: 'Failed to estimate target price' },
      { status: 500 },
    );
  }
}
