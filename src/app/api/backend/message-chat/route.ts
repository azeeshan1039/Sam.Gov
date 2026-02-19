import { NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend-config';

/**
 * Proxy API route for chat messages to the Python backend
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();

        console.log('Proxying message-chat request to:', BACKEND_URL);

        const response = await fetch(`${BACKEND_URL}/message-chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Backend chat error:', response.status, errorText);
            return NextResponse.json(
                { error: `Backend returned ${response.status}`, details: errorText },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error proxying chat to backend:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to connect to backend' },
            { status: 500 }
        );
    }
}
