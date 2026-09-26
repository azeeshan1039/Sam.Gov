import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';
import { BACKEND_URL } from '@/lib/backend-config';
import { backendAuthHeaders } from '@/lib/backend-auth';

export async function GET(request: NextRequest) {
    try {
        const suffix = request.nextUrl.search || '';
        const response = await fetch(`${BACKEND_URL}/api/sam-gov/dashboard-stats${suffix}`, {
            method: 'GET',
            headers: backendAuthHeaders(request),
            cache: 'no-store',
        });

        if (!response.ok) {
            const error = await response.text();
            return NextResponse.json(
                { error: `Backend error: ${error}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json(data);
    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        return NextResponse.json(
            { error: 'Failed to fetch dashboard stats' },
            { status: 500 }
        );
    }
}
