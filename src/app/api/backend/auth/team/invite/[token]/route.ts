import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend-config";

type RouteParams = { params: { token: string } };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/auth/invite/${params.token}`, {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error || "Failed to load invite details" },
        { status: response.status }
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load invite details" },
      { status: 500 }
    );
  }
}
