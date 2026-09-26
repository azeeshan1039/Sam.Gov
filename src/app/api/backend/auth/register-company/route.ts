import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend-config";
import { authenticatedResponse } from "@/lib/backend-auth";

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

    const token = String(data?.token || "");
    if (!token) {
      return NextResponse.json({ error: "Backend did not issue a session." }, { status: 502 });
    }
    const { token: _token, ...safeData } = data;
    return authenticatedResponse(safeData, token, response.status);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to register company" },
      { status: 500 }
    );
  }
}
