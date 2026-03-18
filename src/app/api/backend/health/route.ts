import { NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend-config';

export async function GET() {
  try {
    const res = await fetch(`${BACKEND_URL}/health`, { method: 'GET' });
    if (!res.ok) return NextResponse.json({ status: 'unhealthy' }, { status: 502 });
    return NextResponse.json({ status: 'ok' });
  } catch {
    return NextResponse.json({ status: 'unreachable' }, { status: 502 });
  }
}
