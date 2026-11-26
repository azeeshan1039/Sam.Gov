import { GET } from "@/app/api/backend/analyze-solicitations/status/route";
import type { NextRequest } from "next/server";

jest.mock("next/server", () => ({
  NextResponse: {
    json: (data: unknown, init?: { headers?: Record<string, string> }) => ({
      headers: {
        get: (name: string) =>
          Object.entries(init?.headers ?? {}).find(
            ([header]) => header.toLowerCase() === name.toLowerCase(),
          )?.[1] ?? null,
      },
      json: async () => data,
    }),
  },
}));

describe("analysis status polling cache behavior", () => {
  test("bypasses the Next.js fetch cache and marks the proxy response as no-store", async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        job_id: "job-123",
        status: "completed",
        progress: "Done",
        processed_documents: 6,
        total_documents: 6,
      }),
    } as Response);
    Object.defineProperty(global, "fetch", { writable: true, value: fetchMock });

    const response = await GET({
      url: "http://localhost/api/backend/analyze-solicitations/status?job_id=job-123",
      cookies: { get: () => ({ value: "qa-session" }) },
    } as unknown as NextRequest);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/analyze-solicitations\/status\/job-123$/),
      expect.objectContaining({ cache: "no-store" }),
    );
    expect(response.headers.get("Cache-Control")).toBe(
      "no-store, no-cache, must-revalidate",
    );
    expect(fetchMock.mock.calls[0][1].headers.get("Authorization")).toBe("Bearer qa-session");
    await expect(response.json()).resolves.toMatchObject({
      job_id: "job-123",
      status: "completed",
    });
  });
});
