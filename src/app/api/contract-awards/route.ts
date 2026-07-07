import { NextResponse } from "next/server";
import { fetchPage, ContractAwardsError } from "@/services/contract-awards";
import { EMPTY_FILTERS, type ContractAwardFilters } from "@/types/contract-awards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mapErrorStatus(code: ContractAwardsError["code"]): number {
  switch (code) {
    case "MISSING_KEY":
      return 500;
    case "AUTH":
      return 401;
    case "RATE_LIMIT":
      return 429;
    case "BAD_REQUEST":
      return 400;
    default:
      return 502;
  }
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const filters: ContractAwardFilters = { ...EMPTY_FILTERS, ...(body?.filters ?? {}) };
  const limit = Number(body?.limit ?? 25);
  const offset = Number(body?.offset ?? 0);

  try {
    const page = await fetchPage(filters, limit, offset);
    return NextResponse.json(page);
  } catch (err: any) {
    if (err instanceof ContractAwardsError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: mapErrorStatus(err.code) }
      );
    }
    console.error("contract-awards search error:", err);
    return NextResponse.json(
      { error: err?.message || "Unexpected error contacting GSA." },
      { status: 500 }
    );
  }
}
