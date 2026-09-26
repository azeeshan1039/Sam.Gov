import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend-config";
import { backendAuthHeaders } from "@/lib/backend-auth";

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/stats/leaderboard${request.nextUrl.search}`,
      { headers: backendAuthHeaders(request), cache: "no-store" }
    );
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load leaderboard" },
      { status: 500 }
    );
  }
}
