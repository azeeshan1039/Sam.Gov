import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend-config";

type RouteParams = { params: { token: string } };

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const body = await request.json();
    const response = await fetch(`${BACKEND_URL}/api/auth/accept-invite/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error || "Failed to accept invite" },
        { status: response.status }
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to accept invite" },
      { status: 500 }
    );
  }
}
