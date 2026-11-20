import { NextRequest } from "next/server";
import { proxyRfqPost } from "@/lib/rfq-proxy";

export function POST(request: NextRequest) {
  return proxyRfqPost(request, "/api/compliance/verify");
}
