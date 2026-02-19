// app/api/sam-gov/get-ai-suppliers/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend-config';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    const response = await fetch(`${BACKEND_URL}/api/sam-gov/get-ai-suppliers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error('Failed to get AI suppliers');
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error in get-ai-suppliers API:', error);
    return NextResponse.json(
      { error: 'Failed to get AI suppliers' },
      { status: 500 }
    );
  }
}

