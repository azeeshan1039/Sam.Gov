import { NextRequest, NextResponse } from "next/server";
import { backendAuthHeaders } from "@/lib/backend-auth";
import { BACKEND_URL } from "@/lib/backend-config";
import { isProductRfq } from "@/lib/ai-suggestion-prefilter";
import { getSamGovCatalog } from "@/services/sam-gov";

async function forward(request: NextRequest, path: string, body?: string) {
  const response = await fetch(`${BACKEND_URL}/api/ai-suggestions${path}`, {
    method: request.method,
    headers: backendAuthHeaders(request),
    body,
    cache: "no-store",
  });
  return NextResponse.json(await response.json(), { status: response.status });
}

export async function POST(request: NextRequest) {
  try {
    const { force, refresh_id } = await request.json();
    const catalog = await getSamGovCatalog({});
    if (catalog.source === "unavailable") {
      return NextResponse.json({ error: "The SAM.gov catalog is temporarily unavailable." }, { status: 503 });
    }
    return await forward(request, "", JSON.stringify({
      opportunities: catalog.opportunities.filter(isProductRfq),
      force,
      refresh_id,
    }));
  } catch {
    return NextResponse.json({ error: "Could not start AI suggestions." }, { status: 502 });
  }
}

export async function GET(request: NextRequest) {
  const job = request.nextUrl.searchParams.get("job");
  if (!job || !/^[\da-f-]{36}$/i.test(job)) {
    return NextResponse.json({ error: "Invalid suggestion job." }, { status: 400 });
  }
  try {
    return await forward(request, `/${job}`);
  } catch {
    return NextResponse.json({ error: "Could not check AI suggestions." }, { status: 502 });
  }
}
