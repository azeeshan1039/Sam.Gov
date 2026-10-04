import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ActivityLogPage from "@/app/activity-log/page";
import { getStoredUser } from "@/lib/auth";

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
}));

jest.mock("@/lib/auth", () => ({
  getStoredUser: jest.fn(),
}));

const mockedGetStoredUser = getStoredUser as jest.MockedFunction<typeof getStoredUser>;
const manager = { id: 1, company_id: 7, role: "admin" as const, email: "manager@example.test" };
const agent = { id: 2, company_id: 7, role: "agent" as const, email: "agent@example.test" };

function activityResponse(total: number, offset: number) {
  const items = offset === 0 ? [{
    id: 101,
    bid_id: 55,
    bid: "BID-55",
    solicitation_number: "SOL-55",
    title: "Office equipment",
    changed_by_name: "Agent One",
    old_status: "Finding Supplier",
    new_status: "Bid submitted",
    changed_at_eastern: "2026-10-04T10:30:00-04:00",
  }] : [];
  return { ok: true, json: async () => ({ items, total, limit: 25, offset }) };
}

describe("Status activity page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedGetStoredUser.mockReturnValue(manager);
  });

  test("shows the company activity and links to the corresponding bid history", async () => {
    global.fetch = jest.fn(async () => activityResponse(1, 0)) as jest.Mock;
    render(<ActivityLogPage />);

    expect(await screen.findByRole("heading", { name: "Status activity" })).toBeInTheDocument();
    expect(await screen.findByRole("list", { name: "Status change events" })).toHaveTextContent("Finding Supplier → Bid submitted");
    expect(screen.getByText("Changed by Agent One")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SOL-55" })).toHaveAttribute("href", "/bids/55");
    expect(screen.getByText("Showing 1–1 of 1 events")).toBeInTheDocument();
  });

  test("loads the next page using the API offset and disables paging at the end", async () => {
    const fetchMock = jest.fn(async (_input: RequestInfo | URL) => activityResponse(26, 0));
    fetchMock.mockImplementationOnce(async () => activityResponse(26, 0));
    global.fetch = fetchMock as jest.Mock;
    render(<ActivityLogPage />);

    const next = await screen.findByRole("button", { name: "Next" });
    fireEvent.click(next);

    await waitFor(() => expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/backend/pipeline/activity?limit=25&offset=25",
      { cache: "no-store" }
    ));
    expect(await screen.findByText("Page 2 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next" })).toBeDisabled();
  });

  test("shows the empty state when no status changes exist", async () => {
    global.fetch = jest.fn(async () => ({ ok: true, json: async () => ({ items: [], total: 0 }) })) as jest.Mock;
    render(<ActivityLogPage />);
    expect(await screen.findByText("No status changes have been recorded yet.")).toBeInTheDocument();
    expect(screen.getByText("Status changes will appear here as bids move through the workflow.")).toBeInTheDocument();
  });

  test("shows a recoverable error when the activity request fails", async () => {
    global.fetch = jest.fn(async () => ({ ok: false, status: 500, json: async () => ({ error: "Service unavailable" }) })) as jest.Mock;
    render(<ActivityLogPage />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Service unavailable");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });

  test("redirects agents away from the manager-only page", async () => {
    mockedGetStoredUser.mockReturnValue(agent);
    global.fetch = jest.fn() as jest.Mock;
    render(<ActivityLogPage />);
    await waitFor(() => expect(global.fetch).not.toHaveBeenCalled());
  });
});
