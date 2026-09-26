import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend-config";
import { backendAuthHeaders } from "@/lib/backend-auth";

type RouteParams = { params: { id: string } };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/team/members/${params.id}`, {
      method: "PATCH",
      headers: backendAuthHeaders(request),
      body: await request.text(),
    });
    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update team member" },
      { status: 500 }
    );
  }
}
