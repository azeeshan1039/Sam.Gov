import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend-config";

export async function POST(request: NextRequest) {
  try {
    const suffix = request.nextUrl.search || "";
    const body = await request.json().catch(() => ({}));
    const url = `${BACKEND_URL}/api/notifications/agent/mark-read${suffix}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[notifications] mark-read failed", { url, status: response.status, body: data });
      return NextResponse.json(
        { error: data?.error || "Failed to update alerts" },
        { status: response.status }
      );
    }
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[notifications] mark-read proxy failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update alerts" },
      { status: 500 }
    );
  }
}
