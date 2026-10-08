import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend-config";
import { backendAuthHeaders } from "@/lib/backend-auth";

export const dynamic = "force-dynamic";
type RouteParams = { params: { path: string[] } };

async function proxy(request: NextRequest, { params }: RouteParams) {
  try {
    const path = params.path.map(encodeURIComponent).join("/");
    const response = await fetch(`${BACKEND_URL}/api/pipeline/${path}${request.nextUrl.search}`, {
      method: request.method,
      headers: backendAuthHeaders(request),
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.text(),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Pipeline request failed" },
      { status: 500 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
