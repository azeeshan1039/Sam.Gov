import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AgentBidDataPage from "@/app/agent-bid-data/page";
import WorkManagementPage from "@/app/work-management/page";
import { ScrollableTabsList } from "@/components/negotiation/ScrollableTabsList";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import { presentOpportunityAvailability } from "@/lib/opportunity-availability";

const replace = jest.fn();
const router = { replace, push: jest.fn(), back: jest.fn() };

jest.mock("next/navigation", () => ({
  useRouter: () => router,
}));

jest.mock("@/lib/auth", () => {
  const actual = jest.requireActual("@/lib/auth");
  return { ...actual, getStoredUser: jest.fn() };
});

jest.mock("@/components/pipeline/PipelineTable", () => ({
  PipelineTable: ({ items, empty }: { items: Array<{ title?: string }>; empty: string }) => (
    <div data-testid="pipeline-table">{items.length ? items.map((item) => item.title).join(",") : empty}</div>
  ),
}));

const mockedGetStoredUser = jest.mocked(getStoredUser);
const admin: AuthUser = {
  id: 1,
  email: "manager@example.com",
  full_name: "Manager",
  role: "admin",
  company_id: 10,
  is_active: true,
};
const agent: AuthUser = {
  id: 2,
  email: "agent@example.com",
  full_name: "Agent One",
  role: "agent",
  company_id: 10,
  is_active: true,
};

function response(data: unknown, status = 200): Promise<Response> {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as Response);
}

function urlOf(input: RequestInfo | URL) {
  return typeof input === "string" ? input : input.toString();
}

beforeEach(() => {
  replace.mockReset();
  mockedGetStoredUser.mockReset();
  jest.restoreAllMocks();
});

describe("QA-001 catalog ownership labels", () => {
  test.each([
    [{ available: true, availability_state: "available", workflow_state: "available" }, "Available"],
    [{ available: false, availability_state: "claimed", workflow_state: "assigned", assignee: { id: 2, full_name: "Agent One" } }, "Taken by Agent One"],
    [{ available: false, availability_state: "terminal", workflow_state: "submitted", last_assignee: { id: 2, full_name: "Agent One" } }, "Submitted by Agent One"],
    [{ available: false, availability_state: "terminal", workflow_state: "removed", last_assignee: { id: 2, full_name: "Agent One" } }, "Removed by Agent One"],
    [{ available: false, availability_state: "terminal", workflow_state: "failed_quote", last_assignee: { id: 2, full_name: "Agent One" } }, "Quote failed by Agent One"],
  ] as const)("maps workflow state without calling terminal work taken", (availability, label) => {
    expect(presentOpportunityAvailability(availability)).toMatchObject({ label });
  });
});

describe("QA-002 ownership history", () => {
  test("shows immutable reasons and clears next-action controls after success", async () => {
    mockedGetStoredUser.mockReturnValue(admin);
    const opportunity = {
      id: 7,
      source: "SAM.GOV",
      external_notice_id: "NOTICE-7",
      solicitation_number: "SOL-7",
      title: "Audit trail bid",
      expected_bid_value: 50000,
      state: "assigned",
      assignee: { id: 2, full_name: "Agent One" },
      assignment_history: [{
        id: 70,
        agent: { id: 2, full_name: "Agent One" },
        actor: { id: 1, full_name: "Manager" },
        action: "assigned",
        reason: "Regional expertise",
        limit_override: true,
        started_at: "2026-10-02T12:00:00Z",
      }],
    };
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input);
      if (init?.method === "POST") return response({ opportunity });
      if (url.includes("opportunities/company")) return response({ opportunities: [opportunity] });
      if (url.includes("opportunities/duplicates")) return response({ incidents: [] });
      if (url.includes("auth/team")) return response({ members: [agent] });
      throw new Error(`Unexpected request: ${url}`);
    });
    global.fetch = fetchMock as jest.Mock;
    const user = userEvent.setup();

    render(<WorkManagementPage />);
    await waitFor(() => expect(document.body).toHaveTextContent("Audit trail bid"));
    expect(document.body).toHaveTextContent("Assignment history (1)");
    expect(document.body).toHaveTextContent("Regional expertise · Limit override");

    await user.selectOptions(screen.getByLabelText("Agent"), "2");
    await user.type(screen.getByLabelText("Reason for next action"), "Coverage handoff");
    await user.click(screen.getByRole("button", { name: "Reassign" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/backend/opportunities/7/reassign",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(screen.getByLabelText("Agent")).toHaveValue("");
    expect(screen.getByLabelText("Reason for next action")).toHaveValue("");
  });
});

describe("QA-003 agent reporting sections", () => {
  test("renders released work separately from active work", async () => {
    mockedGetStoredUser.mockReturnValue(agent);
    global.fetch = jest.fn(() => response({
      agent_user_id: 2,
      employees: [{ user_id: 2, name: "Agent One", is_active: true }],
      date_from: "2026-10-01",
      date_to: "2026-10-31",
      metrics: null,
      active: [],
      historical: [{ id: 9, title: "Released bid" }],
      completed: [],
    })) as jest.Mock;

    render(<AgentBidDataPage />);
    expect(await screen.findByText("Historical / released / reassigned")).toBeInTheDocument();
    expect(await screen.findByText("Released bid")).toBeInTheDocument();
    expect(screen.getByText("No active bids.")).toBeInTheDocument();
  });
});

describe("QA-004 vendor tab overflow", () => {
  test("keeps ten tabs on one scrollable row and reveals the focused tab", () => {
    const scrollIntoView = jest.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    render(
      <Tabs defaultValue="0">
        <ScrollableTabsList>
          {Array.from({ length: 10 }, (_, index) => (
            <TabsTrigger className="min-w-[132px] flex-none" key={index} value={String(index)}>
              Vendor {index + 1}
            </TabsTrigger>
          ))}
        </ScrollableTabsList>
        <TabsContent value="0">First vendor</TabsContent>
      </Tabs>,
    );

    const region = screen.getByRole("region", { name: "Vendor negotiations" });
    expect(region).toHaveClass("overflow-x-auto");
    expect(screen.getAllByRole("tab")).toHaveLength(10);
    fireEvent.focus(screen.getByRole("tab", { name: "Vendor 10" }));
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "nearest", inline: "nearest" });
  });
});
