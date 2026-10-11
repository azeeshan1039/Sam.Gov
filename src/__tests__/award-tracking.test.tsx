import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AwardTrackingPage from "@/app/award-tracking/page";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import type { AwardTrackingItem, AwardTrackingResponse } from "@/lib/awards";

const replace = jest.fn();
let searchParams = new URLSearchParams();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push: jest.fn(), back: jest.fn() }),
  useSearchParams: () => searchParams,
}));

jest.mock("@/lib/auth", () => {
  const actual = jest.requireActual("@/lib/auth");
  return { ...actual, getStoredUser: jest.fn() };
});

jest.mock("@/components/awards/AwardPanel", () => ({
  AwardPanel: ({ bidId, focusCheckpoint }: { bidId: number; focusCheckpoint?: number | null }) => (
    <div data-testid="award-panel">panel for {bidId} at {String(focusCheckpoint ?? "none")}</div>
  ),
}));

const mockedGetStoredUser = jest.mocked(getStoredUser);
const admin: AuthUser = { id: 1, email: "m@example.com", full_name: "Manager", role: "admin", company_id: 10, is_active: true };
const agent: AuthUser = { id: 2, email: "a@example.com", full_name: "Agent One", role: "agent", company_id: 10, is_active: true };

function item(overrides: Partial<AwardTrackingItem>): AwardTrackingItem {
  return {
    id: 1, bid_id: "AMF1", solicitation_number: "SOL-1", title: "Hospital beds", portal: "SAM.GOV",
    agent_user_id: 2, agent_name: "Agent One", submitted_at: "2026-09-01T16:00:00Z", submitted_price: 60000,
    size_bucket: "Medium", can_record: true, award_outcome: "pending", awarded_to: null, awarded_amount: null,
    outcome_notes: null, submitted_on: "2026-09-01", days_since_submission: 40, tracked: true,
    checkpoint_state: "due", current_checkpoint: { checkpoint_days: 30, due_on: "2026-10-01", state: "due" },
    checkpoints_completed: 0, checkpoints_total: 4, flagged: false, sam_info: null,
    ...overrides,
  };
}

function payload(items: AwardTrackingItem[], extra: Partial<AwardTrackingResponse> = {}): AwardTrackingResponse {
  return {
    items,
    summary: {
      count: items.length,
      outcomes: { won: 1, lost: 1, pending: 1, unknown: 0 },
      win_rate: 50,
      won_submitted_total: 20000,
      lost_submitted_total: 150000,
      lost_to_competitors_total: 140000,
      flagged: items.filter((i) => i.flagged).length,
      due: items.filter((i) => i.checkpoint_state === "due").length,
      top_competitors: [{ name: "Rival Inc", count: 2, total: 140000 }],
    },
    agents: [{ user_id: 2, name: "Agent One" }, { user_id: 3, name: "Agent Two" }],
    portals: ["SAM.GOV", "SEPTA"],
    checkpoint_days: [30, 45, 60, 90],
    tracking_start_date: "2026-10-11",
    today: "2026-10-11",
    sort: "submitted_at",
    dir: "desc",
    ...extra,
  };
}

const rows = [
  item({ id: 1, bid_id: "AMF1", solicitation_number: "SOL-DUE" }),
  item({
    id: 2, bid_id: "AMF2", solicitation_number: "SOL-LOST", award_outcome: "lost", awarded_to: "Rival Inc",
    awarded_amount: 140000, submitted_price: 150000, size_bucket: "Large", checkpoint_state: "complete",
    current_checkpoint: null, checkpoints_completed: 1,
  }),
  item({
    id: 3, bid_id: "AMF3", solicitation_number: "SOL-FLAG", agent_name: "Agent Two", checkpoint_state: "flagged",
    flagged: true, current_checkpoint: { checkpoint_days: 90, due_on: "2026-09-01", state: "due" }, checkpoints_completed: 2,
    sam_info: {
      id: 5, result: "found", api: "contract_awards", requested_at: "2026-10-10T11:00:00Z", checkpoint_days: 90,
      error_code: null, message: null, awardee_name: "Winner Co", awardee_uei: "ABC123DEF456", amount: 5,
      piid: "P1", date_signed: "2026-09-01", solicitation_id: "SOL-FLAG", candidates: [], applied: false,
    },
  }),
];

let requests: URL[] = [];

function mockFetch(build: (url: URL) => { status?: number; body: unknown }) {
  requests = [];
  global.fetch = jest.fn((input: RequestInfo | URL) => {
    const url = new URL(typeof input === "string" ? input : input.toString(), "http://localhost");
    requests.push(url);
    const { status = 200, body } = build(url);
    return Promise.resolve({ ok: status < 300, status, json: async () => body } as Response);
  }) as jest.Mock;
}

function lastParams() {
  return requests[requests.length - 1].searchParams;
}

beforeAll(() => {
  // Radix Select relies on pointer capture and scrollIntoView, which jsdom lacks.
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
});

beforeEach(() => {
  searchParams = new URLSearchParams();
  mockedGetStoredUser.mockReset();
  replace.mockReset();
});

describe("KAN-62/KAN-63 Award Tracking page", () => {
  test("lists every submitted bid with outcome, winner, amounts and checkpoint position", async () => {
    mockedGetStoredUser.mockReturnValue(admin);
    mockFetch(() => ({ body: payload(rows) }));
    render(<AwardTrackingPage />);

    const lostRow = await screen.findByTestId("award-row-2");
    expect(within(lostRow).getByText("SOL-LOST")).toBeInTheDocument();
    expect(within(lostRow).getByText("Lost")).toBeInTheDocument();
    expect(within(lostRow).getByText("Rival Inc")).toBeInTheDocument();
    expect(within(lostRow).getByText("$140,000.00")).toBeInTheDocument();
    expect(within(lostRow).getByText("$150,000.00")).toBeInTheDocument();
    expect(within(lostRow).getByText("Complete · 1/4")).toBeInTheDocument();

    const dueRow = screen.getByTestId("award-row-1");
    expect(within(dueRow).getByText("Pending")).toBeInTheDocument();
    expect(within(dueRow).getByText("Day 30 · Due · 0/4")).toBeInTheDocument();
    expect(within(dueRow).getByText("Agent One")).toBeInTheDocument();

    const flaggedRow = screen.getByTestId("award-row-3");
    expect(within(flaggedRow).getByText("Day 90 · 90-day flag · 2/4")).toBeInTheDocument();
    expect(within(flaggedRow).getByLabelText("SAM.gov award information available")).toBeInTheDocument();

    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Who we lose to")).toBeInTheDocument();
    expect(screen.getByText("2 bid(s) · $140,000.00")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /size/i })).not.toBeInTheDocument();
  });

  test("shows the empty state and API errors", async () => {
    mockedGetStoredUser.mockReturnValue(admin);
    mockFetch(() => ({ body: payload([]) }));
    const { unmount } = render(<AwardTrackingPage />);
    expect(await screen.findByText("No submitted bids yet.")).toBeInTheDocument();
    unmount();
    mockFetch(() => ({ status: 500, body: { error: "Backend down" } }));
    render(<AwardTrackingPage />);
    expect(await screen.findByText("Backend down")).toBeInTheDocument();
  });
});

describe("KAN-67 filters, sorting and views", () => {
  test("every filter and sort change re-queries the award records", async () => {
    mockedGetStoredUser.mockReturnValue(admin);
    mockFetch(() => ({ body: payload(rows) }));
    const user = userEvent.setup();
    render(<AwardTrackingPage />);
    await screen.findByTestId("award-row-1");
    expect(lastParams().get("sort")).toBe("submitted_at");
    expect(lastParams().get("dir")).toBe("desc");

    const choose = async (label: string, option: string) => {
      await user.click(screen.getByRole("combobox", { name: label }));
      await user.click(await screen.findByRole("option", { name: option }));
    };
    await choose("Employee", "Agent Two");
    await waitFor(() => expect(lastParams().get("agent_user_id")).toBe("3"));
    await choose("Outcome", "Lost");
    await waitFor(() => expect(lastParams().get("outcome")).toBe("lost"));
    await choose("Portal", "SEPTA");
    await waitFor(() => expect(lastParams().get("portal")).toBe("SEPTA"));
    await choose("Size bucket", "Very Large ($500k+)");
    await waitFor(() => expect(lastParams().get("size")).toBe("very_large"));
    await choose("Checkpoint", "90-day flag");
    await waitFor(() => expect(lastParams().get("checkpoint_state")).toBe("flagged"));

    await user.type(screen.getByLabelText("Submitted from"), "2026-09-01");
    await waitFor(() => expect(lastParams().get("date_from")).toBe("2026-09-01"));
    await user.type(screen.getByLabelText("Submitted to"), "2026-09-30");
    await waitFor(() => expect(lastParams().get("date_to")).toBe("2026-09-30"));
    await user.type(screen.getByLabelText("Search award records"), "beds");
    await waitFor(() => expect(lastParams().get("q")).toBe("beds"));

    await user.click(screen.getByRole("button", { name: "Outcome" }));
    await waitFor(() => expect(lastParams().get("sort")).toBe("outcome"));
    expect(lastParams().get("dir")).toBe("asc");
    await user.click(screen.getByRole("button", { name: "Outcome" }));
    await waitFor(() => expect(lastParams().get("dir")).toBe("desc"));
    await user.click(screen.getByRole("button", { name: "Awarded $" }));
    await waitFor(() => expect(lastParams().get("sort")).toBe("awarded_amount"));
    expect(lastParams().get("dir")).toBe("desc");
    expect(screen.getByRole("columnheader", { name: "Awarded $" })).toHaveAttribute("aria-sort", "descending");
    expect(await screen.findAllByTestId(/award-row-/)).toHaveLength(3);
  });

  test("agents get their own view without the employee filter and see the checks-due banner", async () => {
    mockedGetStoredUser.mockReturnValue(agent);
    mockFetch(() => ({ body: payload([rows[0]], { agents: [] }) }));
    const user = userEvent.setup();
    render(<AwardTrackingPage />);
    await screen.findByTestId("award-row-1");
    expect(screen.queryByRole("combobox", { name: "Employee" })).not.toBeInTheDocument();
    expect(screen.getByText("My submitted bids")).toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Agent" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 award check(s) need your update.");
    await user.click(screen.getByRole("button", { name: "Show checks due" }));
    await waitFor(() => expect(lastParams().get("checkpoint_state")).toBe("due"));
  });

  test("a notification or dashboard deep link opens that bid's checkpoint dialog", async () => {
    mockedGetStoredUser.mockReturnValue(admin);
    searchParams = new URLSearchParams("checkpoint_state=flagged&bid=3");
    mockFetch(() => ({ body: payload(rows) }));
    render(<AwardTrackingPage />);
    expect(await screen.findByTestId("award-panel")).toHaveTextContent("panel for 3 at 90");
    expect(requests[0].searchParams.get("checkpoint_state")).toBe("flagged");
    expect(screen.getByRole("dialog")).toHaveTextContent("Award check · SOL-FLAG");
  });

  test("a second alert link while already on the page opens the new bid and applies its filter", async () => {
    mockedGetStoredUser.mockReturnValue(admin);
    searchParams = new URLSearchParams("bid=1");
    mockFetch(() => ({ body: payload(rows) }));
    const user = userEvent.setup();
    const { rerender } = render(<AwardTrackingPage />);
    expect(await screen.findByTestId("award-panel")).toHaveTextContent("panel for 1");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByTestId("award-panel")).not.toBeInTheDocument());

    searchParams = new URLSearchParams("checkpoint_state=flagged&bid=3");
    rerender(<AwardTrackingPage />);
    expect(await screen.findByTestId("award-panel")).toHaveTextContent("panel for 3 at 90");
    await waitFor(() => expect(lastParams().get("checkpoint_state")).toBe("flagged"));

    // The same link again (e.g. re-render) does not reopen a dialog the user closed.
    await user.keyboard("{Escape}");
    rerender(<AwardTrackingPage />);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.queryByTestId("award-panel")).not.toBeInTheDocument();
  });

  test("Record check opens the dialog for that row", async () => {
    mockedGetStoredUser.mockReturnValue(admin);
    mockFetch(() => ({ body: payload(rows) }));
    const user = userEvent.setup();
    render(<AwardTrackingPage />);
    const row = await screen.findByTestId("award-row-2");
    await user.click(within(row).getByRole("button", { name: "Record check" }));
    expect(await screen.findByTestId("award-panel")).toHaveTextContent("panel for 2 at none");
  });
});
