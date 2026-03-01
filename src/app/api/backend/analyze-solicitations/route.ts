import { NextResponse } from 'next/server';
import { Agent } from 'undici';
import { BACKEND_URL } from '@/lib/backend-config';

export const maxDuration = 300;

const longTimeoutAgent = new Agent({
    headersTimeout: 300_000,
    bodyTimeout: 300_000,
    connectTimeout: 10_000,
});

/**
 * Proxy API route to forward requests to the Python backend
 * This avoids CORS issues when making requests from the browser
 */
export async function POST(request: Request) {
    try {
        const body = await request.json();

        console.log('Proxying analyze-solicitations request to:', BACKEND_URL);

        const response = await fetch(`${BACKEND_URL}/analyze-solicitations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
            // @ts-ignore — undici dispatcher not in standard fetch types
            dispatcher: longTimeoutAgent,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Backend error:', response.status, errorText);
            return NextResponse.json(
                { error: `Backend returned ${response.status}`, details: errorText },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error proxying to backend:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to connect to backend' },
            { status: 500 }
        );
    }
}
