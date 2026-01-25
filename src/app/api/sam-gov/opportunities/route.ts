import { NextRequest, NextResponse } from "next/server";

const SAM_GOV_BASE = "https://api.sam.gov/opportunities/v2/search";

/**
 * Proxies requests to SAM.gov Get Opportunities Public API v2.
 * Keeps the API key server-side.
 * @see https://open.gsa.gov/api/get-opportunities-public-api/
 */
export async function GET(request: NextRequest) {
  const apiKey = process.env.SAM_GOV_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "SAM_GOV_API_KEY is not configured. Add it to .env.local" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const postedFrom = searchParams.get("postedFrom");
  const postedTo = searchParams.get("postedTo");

  // postedFrom and postedTo are required when using limit
  if (!postedFrom || !postedTo) {
    return NextResponse.json(
      { error: "postedFrom and postedTo (MM/dd/yyyy) are required" },
      { status: 400 }
    );
  }

  const params = new URLSearchParams({
    api_key: apiKey,
    postedFrom,
    postedTo,
    limit: searchParams.get("limit") || "25",
    offset: searchParams.get("offset") || "0",
  });

  // Optional filters (pass through if provided)
  const optional = [
    "ptype",
    "title",
    "solnum",
    "noticeid",
    "state",
    "zip",
    "ncode",
    "ccode",
    "typeOfSetAside",
    "organizationCode",
    "organizationName",
    "rdlfrom",
    "rdlto",
  ];
  for (const key of optional) {
    const v = searchParams.get(key);
    if (v != null && v !== "") params.set(key, v);
  }

  const url = `${SAM_GOV_BASE}?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    return NextResponse.json(
      { error: data?.error || data?.message || "SAM.gov API error", status: res.status },
      { status: res.status >= 400 && res.status < 600 ? res.status : 502 }
    );
  }

  return NextResponse.json(data);
}
