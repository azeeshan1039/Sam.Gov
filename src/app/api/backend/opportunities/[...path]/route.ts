import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend-config";
import { backendAuthHeaders } from "@/lib/backend-auth";

type RouteParams = { params: { path: string[] } };

async function proxy(request: NextRequest, { params }: RouteParams) {
  try {
    const path = params.path.map(encodeURIComponent).join("/");
    const url = `${BACKEND_URL}/api/opportunities/${path}${request.nextUrl.search}`;
    const method = request.method;
    const response = await fetch(url, {
      method,
      headers: backendAuthHeaders(request),
      body: method === "GET" || method === "HEAD" ? undefined : await request.text(),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Opportunity request failed" },
      { status: 500 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
