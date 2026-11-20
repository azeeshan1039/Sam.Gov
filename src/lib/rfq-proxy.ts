import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE_NAME, backendAuthHeaders } from "@/lib/backend-auth";
import { BACKEND_URL } from "@/lib/backend-config";

export async function proxyRfqPost(request: NextRequest, path: "/api/compliance/verify" | "/api/pdf/generate-bid-package") {
  if (!request.cookies.get(AUTH_COOKIE_NAME)?.value) {
    return NextResponse.json({ error: "Sign in to continue." }, { status: 401 });
  }
  try {
    const upstream = await fetch(BACKEND_URL + path, {
      method: "POST", headers: backendAuthHeaders(request), body: await request.text(), cache: "no-store",
    });
    const headers = new Headers({ "Cache-Control": "no-store" });
    for (const name of ["content-type", "content-disposition"]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch {
    return NextResponse.json({ error: "The RFQ service is unavailable." }, { status: 502 });
  }
}
