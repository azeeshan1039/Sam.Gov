import { NextRequest, NextResponse } from "next/server";
import { BACKEND_URL } from "@/lib/backend-config";
import { backendAuthHeaders } from "@/lib/backend-auth";

/**
 * KAN-74: Google redirects the browser here after consent (GOOGLE_OAUTH_REDIRECT_URI points at
 * this route). Forwarding with this browser's login cookie lets the backend check that the person
 * finishing the connection is the one who started it, so a connect link sent to someone else
 * cannot attach their mailbox to another account.
 */
export const dynamic = "force-dynamic";

/** Relative redirect: keeps the browser on the exact host it used (login lives in that origin's storage). */
function toSettings(params: URLSearchParams) {
  const query = params.toString();
  return new NextResponse(null, { status: 302, headers: { Location: `/settings${query ? `?${query}` : ""}` } });
}

function errorParams(message: string) {
  return new URLSearchParams({ gmail: "error", message });
}

export async function GET(request: NextRequest) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/gmail/callback${request.nextUrl.search}`, {
      method: "GET",
      headers: backendAuthHeaders(request, { json: false }),
      redirect: "manual",
      cache: "no-store",
    });
    const location = response.headers.get("location");
    if (!location) return toSettings(errorParams("Gmail could not be connected. Try again."));
    // Only the result parameters are passed on; the browser always goes back to this app's Settings.
    const result = new URL(location, "http://placeholder").searchParams;
    const params = new URLSearchParams();
    for (const key of ["gmail", "message"]) {
      const value = result.get(key);
      if (value) params.set(key, value);
    }
    return toSettings(params.has("gmail") ? params : errorParams("Gmail could not be connected. Try again."));
  } catch {
    return toSettings(errorParams("The server could not be reached. Try connecting again."));
  }
}
