/** KAN-75 review follow-ups on the bid page (see KAN-75_REVIEW_REPORT.md). */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import BidDetailPage from "@/app/bids/[id]/page";
import { getStoredUser, type AuthUser } from "@/lib/auth";

jest.mock("next/navigation", () => ({
  usePathname: () => "/bids/9",
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "9" }),
}));

jest.mock("@/lib/auth", () => {
  const actual = jest.requireActual("@/lib/auth");
  return { ...actual, getStoredUser: jest.fn() };
});

const agent = { id: 2, email: "agent@example.com", full_name: "Agent One", role: "agent", company_id: 10, is_active: true } as AuthUser;
(getStoredUser as jest.Mock).mockReturnValue(agent);

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[] = [];

function response(data: unknown, status = 200): Promise<Response> {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => data } as Response);
}

function vendor(overrides: Record<string, unknown> = {}) {
  return {
    id: 31, company_name: "BedCo", email: "quotes@bedco.example", notes: "old vendor note", is_manual: true, preferred: false,
    status: "pending", outreach_state: "suggested", negotiation_round: 0, rounds: [], email_sent: false, latest_price: null,
    gmail_message_count: 0, ...overrides,
  };
}

function makeBid(overrides: Record<string, unknown> = {}) {
  return {
    id: 9, bid_id: "B-9", title: "Bid nine", solicitation_number: "SOL-9", internal_status: "Finding Supplier", agent_name: "Agent Two",
    status_history: [], ownership_history: [], current_owner_user_id: 2, bid_remarks: "saved remarks", research_notes: "saved research",
    can_edit_workspace: true,
    workspace: {
      session_id: 4, negotiation_status: "active", rfq_href: null, negotiation_history: [], email_conversations: [], preferred_vendors: [],
      vendors: [vendor()],
    },
    ...overrides,
  };
}

function setup(bid: ReturnType<typeof makeBid>, extra: (call: Call) => Promise<Response> | undefined = () => undefined) {
  let current = bid;
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), method: init?.method || "GET", body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    const custom = extra(call);
    if (custom) return custom;
    if (call.method === "GET" && call.url.endsWith("/pipeline/bids/9")) return response({ bid: current });
    if (call.method === "PATCH" && call.url.endsWith("/vendors/31")) {
      current = { ...current, workspace: { ...current.workspace, vendors: [vendor({ ...current.workspace.vendors[0], ...call.body })] } };
      return response({ bid: current });
    }
    if (call.method === "PATCH" && call.url.endsWith("/notes")) {
      current = { ...current, bid_remarks: call.body?.remarks as string, research_notes: call.body?.research_notes as string };
      return response({ bid: current });
    }
    if (call.url.includes("emails/bids/9/threads")) {
      return response({ bid: { id: 9, solicitation_number: "SOL-9" }, threads: [], outbox: [], vendors: [],
        account: { status: "connected", connected: true, gmail_address: "agent@gmail.com" }, current_user_id: 2 });
    }
    if (call.url.includes("emails/unlinked")) return response({ threads: [] });
    throw new Error(`Unexpected request: ${call.method} ${call.url}`);
  }) as jest.Mock;
}

beforeEach(() => { calls = []; });

test("I-1: saving one thing never erases unsaved typing elsewhere on the page", async () => {
  setup(makeBid());
  const user = userEvent.setup();
  render(<BidDetailPage />);
  const remarks = await screen.findByLabelText("Remarks");
  await waitFor(() => expect(remarks).toHaveValue("saved remarks"));

  await user.clear(remarks);
  await user.type(remarks, "typed but not saved");
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  const note = screen.getByLabelText("Note for BedCo");
  await user.clear(note);
  await user.type(note, "new vendor note");
  await user.click(within(screen.getByRole("row", { name: /BedCo/ })).getByRole("button", { name: "Save" }));
  await screen.findByText("Vendor note saved.");
  await waitFor(() => expect(calls.filter((c) => c.method === "GET" && c.url.endsWith("/bids/9")).length).toBeGreaterThan(1));
  expect(screen.getByLabelText("Remarks")).toHaveValue("typed but not saved");
  expect(screen.getByLabelText("Note for BedCo")).toHaveValue("new vendor note");

  await user.clear(screen.getByLabelText("Note for BedCo"));
  await user.type(screen.getByLabelText("Note for BedCo"), "unsaved vendor note");
  await user.click(screen.getByRole("button", { name: "Save notes" }));
  await screen.findByText("Notes saved.");
  await waitFor(() => expect(screen.queryByText("Unsaved changes")).not.toBeInTheDocument());
  expect(screen.getByLabelText("Note for BedCo")).toHaveValue("unsaved vendor note");
  expect(screen.getByLabelText("Remarks")).toHaveValue("typed but not saved");
});

test("I-2 / I-9: plain outreach labels; Stop is offered only after the vendor was contacted", async () => {
  setup(makeBid({
    workspace: { ...makeBid().workspace, vendors: [
      vendor(),
      vendor({ id: 32, company_name: "AI Co", email: "ai@co.example", is_manual: false }),
      vendor({ id: 33, company_name: "Mailed Co", email: "m@co.example", outreach_state: "contacted", gmail_message_count: 2 }),
    ] },
  }));
  render(<BidDetailPage />);
  const bedco = await screen.findByRole("row", { name: /BedCo/ });
  expect(within(bedco).getByText("Not contacted yet")).toBeInTheDocument();
  expect(within(bedco).queryByRole("button", { name: "Stop negotiation" })).not.toBeInTheDocument();
  expect(within(screen.getByRole("row", { name: /AI Co/ })).getByText("Suggested")).toBeInTheDocument();
  const mailed = screen.getByRole("row", { name: /Mailed Co/ });
  expect(within(mailed).getByText("Contacted")).toBeInTheDocument();
  expect(within(mailed).getByText("2 Gmail messages")).toBeInTheDocument();
  expect(within(mailed).getByRole("button", { name: "Stop negotiation" })).toBeInTheDocument();
});

test("I-4: AI suggestions are listed and added as AI-suggested vendors", async () => {
  setup(makeBid(), (call) => {
    if (call.url.endsWith("/vendor-suggestions")) {
      return response({ suggestions: [{ company_name: "Medline", email: "gov@medline.example" }],
        message: "AI-suggested contacts are unverified. Check each one before you email it." });
    }
    if (call.method === "POST" && call.url.endsWith("/bids/9/vendors")) return response({ bid: makeBid() }, 201);
    return undefined;
  });
  const user = userEvent.setup();
  render(<BidDetailPage />);
  await user.click(await screen.findByRole("button", { name: "Suggest vendors with AI" }));
  const list = await screen.findByRole("region", { name: "AI vendor suggestions" });
  expect(list).toHaveTextContent("unverified");
  await user.click(within(list).getByRole("button", { name: "Add Medline" }));
  await waitFor(() => expect(calls.find((c) => c.method === "POST" && c.url.endsWith("/bids/9/vendors"))?.body)
    .toEqual({ company_name: "Medline", email: "gov@medline.example", source: "ai_suggested" }));
});

test("I-5 / I-3 / I-6: rounds grouped, Gmail messages in the vendor history, in-page navigation", async () => {
  const bid = makeBid();
  bid.workspace = {
    ...bid.workspace,
    vendors: [vendor({ outreach_state: "responded", rounds: [{ round_number: 1, price: 900, status: "received", created_at: null }] })],
    negotiation_history: [
      { supplier_id: 31, supplier_name: "BedCo", sender: "buyer", content: "Please quote", price_mentioned: null, created_at: "2026-11-01T10:00:00Z", round_number: 0, channel: "rfq" },
      { supplier_id: 31, supplier_name: "BedCo", sender: "supplier", content: "$900 each", price_mentioned: 900, created_at: "2026-11-02T10:00:00Z", round_number: 1, channel: "rfq" },
    ],
    email_conversations: [
      { supplier_id: 31, supplier_name: "BedCo", sender: "supplier", content: "We can do $36,500 including freight.", subject: "Re: RFQ",
        price_mentioned: 36500, created_at: "2026-11-03T10:00:00Z", direction: "incoming", channel: "gmail" },
    ],
  } as typeof bid.workspace;
  setup(bid);
  render(<BidDetailPage />);
  const negotiation = await screen.findByRole("region", { name: "Negotiation with BedCo" });
  expect(negotiation).toHaveTextContent("Initial RFQ");
  expect(negotiation).toHaveTextContent(/Round 1 · \$900(\.00)? · Received/);
  expect(screen.getByText("Gmail")).toBeInTheDocument();
  expect(screen.getByText(/Price mentioned: \$36,500/)).toBeInTheDocument();
  const nav = screen.getByRole("navigation", { name: "On this page" });
  expect(within(nav).getByRole("link", { name: "Remarks & notes" })).toHaveAttribute("href", "#notes");
  expect(document.getElementById("notes")).toHaveTextContent("Remarks and research notes");
});

test("I-8: a former owner sees the bid read-only", async () => {
  setup(makeBid({ can_edit_workspace: false }));
  render(<BidDetailPage />);
  expect(await screen.findByRole("note")).toHaveTextContent("Read only: this bid now belongs to Agent Two");
  expect(screen.queryByRole("button", { name: "Add vendor" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Save notes" })).not.toBeInTheDocument();
  expect(screen.getByLabelText("Remarks")).toHaveAttribute("readonly");
  expect(screen.queryByRole("button", { name: /^Email / })).not.toBeInTheDocument();
  expect(await screen.findByText(/Only this bid's current owner or an admin can send email/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "New email" })).not.toBeInTheDocument();
});

test("I-9: the Preferred tick shows at once", async () => {
  let release: () => void = () => undefined;
  setup(makeBid(), (call) => {
    if (call.method === "PATCH" && call.url.endsWith("/vendors/31") && call.body?.preferred) {
      return new Promise((resolve) => { release = () => resolve({ ok: true, status: 200, json: async () => ({}) } as Response); });
    }
    return undefined;
  });
  const user = userEvent.setup();
  render(<BidDetailPage />);
  const box = await screen.findByLabelText("Preferred BedCo");
  await user.click(box);
  expect(screen.getByLabelText("Preferred BedCo")).toBeChecked();
  release();
});
