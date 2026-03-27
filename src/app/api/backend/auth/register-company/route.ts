import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend-config";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = {
      ...body,
      base_url: request.nextUrl.origin,
    };

    const response = await fetch(`${BACKEND_URL}/api/auth/register-company`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error || "Failed to register company" },
        { status: response.status }
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to register company" },
      { status: 500 }
    );
  }
}
