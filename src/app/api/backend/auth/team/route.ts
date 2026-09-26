import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend-config";
import { backendAuthHeaders } from "@/lib/backend-auth";

export async function GET(request: NextRequest) {
  try {
    const companyId = request.nextUrl.searchParams.get("company_id");
    const requesterUserId = request.nextUrl.searchParams.get("requester_user_id");
    const query = new URLSearchParams();
    if (companyId) query.set("company_id", companyId);
    if (requesterUserId) query.set("requester_user_id", requesterUserId);
    const suffix = query.toString() ? `?${query.toString()}` : "";

    const response = await fetch(
      `${BACKEND_URL}/api/team${suffix}`,
      {
        method: "GET",
        headers: backendAuthHeaders(request),
        cache: "no-store",
      }
    );

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error || "Failed to load team data" },
        { status: response.status }
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load team data" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const payload = {
      ...body,
      base_url: request.nextUrl.origin,
    };

    const response = await fetch(`${BACKEND_URL}/api/team/invites`, {
      method: "POST",
      headers: backendAuthHeaders(request),
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error || "Failed to create invite" },
        { status: response.status }
      );
    }

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create invite" },
      { status: 500 }
    );
  }
}
