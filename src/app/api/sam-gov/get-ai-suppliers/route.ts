// app/api/sam-gov/get-ai-suppliers/route.ts
import { NextRequest, NextResponse } from 'next/server';

const PYTHON_SERVER_URL = process.env.PYTHON_SERVER_URL || 'https://backendgovai.onrender.com';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // Send to Python server
    const response = await fetch(`${PYTHON_SERVER_URL}/api/sam-gov/get-ai-suppliers`, {
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

