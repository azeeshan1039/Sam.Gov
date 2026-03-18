import { NextRequest, NextResponse } from 'next/server';
import { BACKEND_URL } from '@/lib/backend-config';

export const maxDuration = 120;

const MAX_RETRIES = 2;
const RETRY_DELAY_MS = 3000;
const FETCH_TIMEOUT_MS = 60_000;

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  let lastError: string = 'Unknown error';

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      if (attempt > 0) {
        console.log(`Negotiate API retry attempt ${attempt}/${MAX_RETRIES}`);
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS * attempt));
      }

      const response = await fetchWithTimeout(
        `${BACKEND_URL}/api/sam-gov/negotiate`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
        FETCH_TIMEOUT_MS,
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        lastError = `Backend returned ${response.status}: ${errorText}`.slice(0, 500);
        if (response.status >= 500) continue;
        return NextResponse.json({ error: lastError }, { status: response.status });
      }

      const data = await response.json();
      return NextResponse.json(data);
    } catch (error: any) {
      const isTimeout = error?.name === 'AbortError';
      lastError = isTimeout
        ? 'Backend did not respond in time (server may be starting up). Please try again.'
        : (error?.message || 'Network error reaching backend');
      console.error(`Negotiate API attempt ${attempt} failed:`, lastError);
      if (!isTimeout && error?.cause?.code !== 'ECONNREFUSED') break;
    }
  }

  console.error('Negotiate API all retries exhausted:', lastError);
  return NextResponse.json({ error: lastError }, { status: 502 });
}
