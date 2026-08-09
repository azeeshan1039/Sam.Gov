import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend-config";

export async function GET(request: NextRequest) {
  try {
    const suffix = request.nextUrl.search ? request.nextUrl.search : "";
    const url = `${BACKEND_URL}/api/stats${suffix}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error("[stats] Backend GET failed", {
        url,
        status: response.status,
        body: data,
      });
      return NextResponse.json(
        { error: data?.error || "Failed to load stats" },
        { status: response.status }
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error("[stats] Proxy GET failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load stats" },
      { status: 500 }
    );
  }
}
