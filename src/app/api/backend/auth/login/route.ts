import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend-config";
import { authenticatedResponse } from "@/lib/backend-auth";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error || "Failed to login" },
        { status: response.status }
      );
    }

    const token = String(data?.token || "");
    if (!token) {
      return NextResponse.json({ error: "Backend did not issue a session." }, { status: 502 });
    }
    return authenticatedResponse({ user: data.user }, token, response.status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to login" },
      { status: 500 }
    );
  }
}
