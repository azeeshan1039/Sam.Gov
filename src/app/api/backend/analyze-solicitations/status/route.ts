import { NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend-config';

export const maxDuration = 60;

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const jobId = searchParams.get('job_id');

        if (!jobId) {
            return NextResponse.json({ error: 'Missing job_id parameter' }, { status: 400 });
        }

        const response = await fetch(`${BACKEND_URL}/analyze-solicitations/status/${jobId}`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
        });

        if (!response.ok) {
            const errorText = await response.text();
            return NextResponse.json(
                { error: `Backend returned ${response.status}`, details: errorText },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error: any) {
        console.error('Error polling analysis status:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to connect to backend' },
            { status: 500 }
        );
    }
}
