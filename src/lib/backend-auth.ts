import { NextRequest, NextResponse } from "next/server";

export const AUTH_COOKIE_NAME = "samgov-token";

export function backendAuthHeaders(
  request: NextRequest,
  options: { json?: boolean } = { json: true }
): Headers {
  const headers = new Headers();
  if (options.json !== false) headers.set("Content-Type", "application/json");
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
}

export function authenticatedResponse(data: unknown, token: string, status: number) {
  const response = NextResponse.json(data, { status });
  response.cookies.set(AUTH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
