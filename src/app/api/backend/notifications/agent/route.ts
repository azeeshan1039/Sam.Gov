import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend-config";

export async function GET(request: NextRequest) {
  try {
    const suffix = request.nextUrl.search || "";
    const url = `${BACKEND_URL}/api/notifications/agent${suffix}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[notifications] agent list failed", { url, status: response.status, body: data });
      return NextResponse.json(
        { error: data?.error || "Failed to load alerts" },
        { status: response.status }
      );
    }
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[notifications] agent list proxy failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load alerts" },
      { status: 500 }
    );
  }
}
