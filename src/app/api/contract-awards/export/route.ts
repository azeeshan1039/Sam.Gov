import { NextResponse } from "next/server";
import {
  fetchAllPages,
  toCsv,
  ContractAwardsError,
} from "@/services/contract-awards";
import { EMPTY_FILTERS, type ContractAwardFilters } from "@/types/contract-awards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_CAP = 1_000;
const HARD_CAP = 100_000;

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

function tsStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(
    d.getMinutes()
  )}`;
}

export async function POST(request: Request) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const filters: ContractAwardFilters = { ...EMPTY_FILTERS, ...(body?.filters ?? {}) };
  const requested = Number(body?.cap ?? DEFAULT_CAP);
  const cap = Math.min(Math.max(requested || DEFAULT_CAP, 1), HARD_CAP);

  try {
    const rows = await fetchAllPages(filters, cap);
    const csv = toCsv(rows);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="contract-awards-${tsStamp()}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: any) {
    if (err instanceof ContractAwardsError) {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: mapErrorStatus(err.code) }
      );
    }
    console.error("contract-awards export error:", err);
    return NextResponse.json(
      { error: err?.message || "Unexpected error generating CSV." },
      { status: 500 }
    );
  }
}
