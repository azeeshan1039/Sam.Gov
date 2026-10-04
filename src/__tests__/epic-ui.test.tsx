import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import DashboardPage from "@/app/page";
import MyBidsPage from "@/app/my-bids/page";
import TeamPage from "@/app/team/page";
import WorkManagementPage from "@/app/work-management/page";
import Sidebar from "@/components/Sidebar";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import UnclaimedBidsPage from "@/app/unclaimed-bids/page";
import BidDetailPage from "@/app/bids/[id]/page";
import { BID_STATUSES } from "@/lib/pipeline";
import { easternReportingRange, formatUtcDateRange } from "@/lib/eastern-date";

const replace = jest.fn();
const router = { replace, push: jest.fn(), back: jest.fn() };

jest.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => router,
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "9" }),
}));

jest.mock("next/dynamic", () => () => {
  function DynamicComponent() {
    return <div data-testid="dynamic-dashboard-widget" />;
  }
  return DynamicComponent;
});

jest.mock("@/lib/auth", () => {
  const actual = jest.requireActual("@/lib/auth");
  return {
    ...actual,
    clearStoredUser: jest.fn(),
    getStoredUser: jest.fn(),
  };
});

jest.mock("@/components/pipeline/PipelineTable", () => ({
  PipelineTable: ({ items }: { items: Array<{ id: number }> }) => (
    <div data-testid="pipeline-table">{items.length} pipeline rows</div>
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

describe("KAN-18 and KAN-19 role-specific navigation", () => {
  test("KAN-18 exposes company management navigation only to managers", async () => {
    mockedGetStoredUser.mockReturnValue(admin);
    render(<Sidebar />);

    expect(await screen.findByRole("link", { name: "Work management" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Sam.Gov" })).toHaveAttribute("href", "/sam-gov");
    expect(screen.getByRole("link", { name: "Contract Awards" })).toHaveAttribute("href", "/contract-awards");
    expect(screen.getByRole("link", { name: "Negotiations" })).toHaveAttribute("href", "/negotiations");
    expect(screen.getByRole("link", { name: "Pipeline" })).toHaveAttribute("href", "/pipeline");
    expect(screen.getByRole("link", { name: "Agent Bid Data" })).toHaveAttribute("href", "/agent-bid-data");
    expect(screen.getByRole("link", { name: "Weekly submissions" })).toHaveAttribute("href", "/weekly-submissions");
    expect(screen.getByRole("link", { name: "$100k+" })).toHaveAttribute("href", "/hundred-k");
    expect(screen.getByRole("link", { name: "Approvals" })).toHaveAttribute("href", "/approvals");
    expect(screen.getByRole("link", { name: "Stats" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Team" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "My bids" })).not.toBeInTheDocument();
  });

  test("KAN-19 exposes personal bid navigation without manager controls", async () => {
    mockedGetStoredUser.mockReturnValue(agent);
    render(<Sidebar />);

    expect(await screen.findByRole("link", { name: "My bids" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Work management" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Team" })).not.toBeInTheDocument();
  });
});

describe("KAN-18, KAN-19, and KAN-22 dashboard views", () => {
  test("manager dashboard renders company duplicate flags and pickup rules", async () => {
    mockedGetStoredUser.mockReturnValue(admin);
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes("dashboard-stats")) return response({ stats: {} });
      if (url.includes("stats/leaderboard")) return response({ leaderboard: [] });
      if (url.includes("opportunities/duplicates")) {
        return response({
          incidents: [{
            id: 7,
            solicitation_number: "SOL-100",
            attempted_by: { full_name: "Agent Two" },
            existing_agent: { full_name: "Agent One" },
            detected_at: "2026-09-26T12:00:00Z",
          }],
        });
      }
      if (url.includes("opportunities/stale")) {
        return response({
          bids: [{
            claim_id: 4,
            solicitation_number: "SOL-STALE",
            title: "Idle bid",
            assignee: { full_name: "Agent One" },
            last_status_at: "2026-09-20T12:00:00Z",
          }],
        });
      }
      if (url.includes("auth/team")) {
        return response({
          members: [{
            id: 2,
            full_name: "Agent One",
            role: "agent",
            is_active: true,
            active_bid_limit: 3,
            dollar_ceiling: 250000,
          }],
        });
      }
      if (url.includes("pipeline/activity")) return response({ items: [] });
      throw new Error(`Unexpected request: ${url}`);
    }) as jest.Mock;

    render(<DashboardPage />);

    expect(await screen.findByRole("heading", { name: "Company dashboard" })).toBeInTheDocument();
    expect(await screen.findByText("SOL-100")).toBeInTheDocument();
    expect(screen.getByText("3 active bids · $250.0K")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review all" })).toHaveAttribute("href", "/work-management");
    expect(screen.getByRole("link", { name: "View all activity" })).toHaveAttribute("href", "/activity-log");
    expect(await screen.findByText("SOL-STALE")).toBeInTheDocument();
  });

  test("agent dashboard stays personal and does not request or render admin rules", async () => {
    mockedGetStoredUser.mockReturnValue(agent);
    const fetchMock = jest.fn((input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes("dashboard-stats")) return response({ stats: {} });
      if (url.includes("stats/leaderboard")) return response({ leaderboard: [] });
      throw new Error(`Admin endpoint requested by agent dashboard: ${url}`);
    });
    global.fetch = fetchMock as jest.Mock;

    render(<DashboardPage />);

    expect(await screen.findByRole("heading", { name: "My dashboard" })).toBeInTheDocument();
    expect(screen.queryByText("Duplicate flags")).not.toBeInTheDocument();
    expect(screen.queryByText("Pickup rules")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("KAN-19 active personal work", () => {
  test("My Bids displays picked-up work before a pipeline negotiation exists", async () => {
    mockedGetStoredUser.mockReturnValue(agent);
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url.includes("pipeline/my-bids")) return response({ items: [] });
      if (url.includes("stats/my-goal")) return response({ achieved: 1, monthly: 5, left: 4 });
      if (url.includes("opportunities/mine")) {
        return response({
          opportunities: [{
            id: 8,
            external_notice_id: "NOTICE-8",
            solicitation_number: "SOL-8",
            title: "Picked-up opportunity",
            expected_bid_value: 90000,
            response_deadline: "2026-10-01T00:00:00Z",
            state: "assigned",
          }],
        });
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as jest.Mock;

    render(<MyBidsPage />);

    expect(await screen.findByText("Picked-up opportunity")).toBeInTheDocument();
    expect(screen.getByText("$90,000")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Picked-up opportunity/ })).toHaveAttribute(
      "href",
      "/sam-gov/NOTICE-8"
    );
    expect(screen.getByTestId("pipeline-table")).toHaveTextContent("0 pipeline rows");
  });
});

describe("KAN-20 through KAN-23 roster controls", () => {
  test("manager invitation submits both employee limits and identity fields", async () => {
    mockedGetStoredUser.mockReturnValue(admin);
    const team = {
      slots_remaining: 3,
      max_team_members: 5,
      company_monthly_goal: 50,
      members: [],
      pending_invites: [],
    };
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input);
      if (url.includes("auth/team") && init?.method === "POST") return response({ created: [{}], errors: [] });
      if (url.includes("auth/team")) return response(team);
      throw new Error(`Unexpected request: ${url}`);
    });
    global.fetch = fetchMock as jest.Mock;
    const user = userEvent.setup();

    render(<TeamPage />);
    await screen.findByRole("heading", { name: "Team & access" });
    await user.type(screen.getByLabelText("Full name"), "New Agent");
    await user.type(screen.getByLabelText("Email"), "new@example.com");
    await user.clear(screen.getByLabelText("Active-bid limit"));
    await user.type(screen.getByLabelText("Active-bid limit"), "4");
    await user.clear(screen.getByLabelText("Dollar ceiling"));
    await user.type(screen.getByLabelText("Dollar ceiling"), "275000");
    await user.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    expect(post).toBeDefined();
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      full_name: "New Agent",
      emails: ["new@example.com"],
      active_bid_limit: 4,
      dollar_ceiling: 275000,
    });
  });

  test("manager edits limits on the employee record and deactivates through audited PATCH calls", async () => {
    mockedGetStoredUser.mockReturnValue(admin);
    const member = {
      id: 2,
      email: "agent@example.com",
      full_name: "Agent One",
      job_title: "Capture Specialist",
      role: "agent",
      is_active: true,
      employment_start_date: "2026-09-01",
      monthly_goal: 5,
      active_bid_limit: 3,
      dollar_ceiling: 250000,
    };
    const team = {
      slots_remaining: 2,
      max_team_members: 5,
      company_monthly_goal: 50,
      members: [member],
      pending_invites: [],
    };
    const patchBodies: Array<Record<string, unknown>> = [];
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input);
      if (url.includes("auth/team/members/2") && init?.method === "PATCH") {
        const body = JSON.parse(String(init.body));
        patchBodies.push(body);
        return response({ member: { ...member, ...body }, released_opportunities: body.is_active ? 0 : 2 });
      }
      if (url.includes("auth/team")) return response(team);
      throw new Error(`Unexpected request: ${url}`);
    });
    global.fetch = fetchMock as jest.Mock;
    const user = userEvent.setup();

    render(<TeamPage />);
    await screen.findByRole("heading", { name: "Team & access" });

    await user.clear(screen.getByLabelText("Active-bid limit for Agent One"));
    await user.type(screen.getByLabelText("Active-bid limit for Agent One"), "4");
    await user.clear(screen.getByLabelText("Dollar ceiling for Agent One"));
    await user.type(screen.getByLabelText("Dollar ceiling for Agent One"), "300000");
    await user.click(screen.getByRole("button", { name: "Save Agent One" }));
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toMatchObject({
      active_bid_limit: 4,
      dollar_ceiling: 300000,
      is_active: true,
    });

    await user.click(screen.getByRole("button", { name: "Deactivate Agent One" }));
    await waitFor(() => expect(patchBodies).toHaveLength(2));
    expect(patchBodies[1]).toMatchObject({ is_active: false });
    expect(await screen.findByText("Member updated; 2 active bid(s) returned to the pool.")).toBeInTheDocument();
  });
});

describe("KAN-40 manager duplicate resolution", () => {
  test("requires a resolution note and posts it to the exact incident", async () => {
    mockedGetStoredUser.mockReturnValue(admin);
    let resolved = false;
    const fetchMock = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input);
      if (url.includes("duplicates/44/resolve") && init?.method === "PATCH") {
        resolved = true;
        return response({ id: 44, status: "resolved" });
      }
      if (url.includes("opportunities/duplicates")) {
        return response({
          incidents: resolved ? [] : [{
            id: 44,
            solicitation_number: "SOL-44",
            attempted_by: { id: 3, full_name: "Agent Two" },
            existing_agent: { id: 2, full_name: "Agent One" },
            status: "open",
            detected_at: "2026-09-26T12:00:00Z",
            created_at: "2026-09-26T12:00:00Z",
          }],
        });
      }
      if (url.includes("opportunities/company")) return response({ opportunities: [] });
      if (url.includes("auth/team")) return response({ members: [] });
      throw new Error(`Unexpected request: ${url}`);
    });
    global.fetch = fetchMock as jest.Mock;
    const user = userEvent.setup();

    render(<WorkManagementPage />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(document.body.innerHTML).toContain("SOL-44"));
    await user.click(screen.getByRole("button", { name: "Resolve" }));
    expect(await screen.findByText("Enter a resolution note.")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Resolution note"), "Original owner retains work");
    await user.click(screen.getByRole("button", { name: "Resolve" }));

    await waitFor(() => expect(screen.getByText("No unresolved duplicate flags.")).toBeInTheDocument());
    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
    expect(urlOf(patchCall?.[0] as RequestInfo)).toContain("duplicates/44/resolve");
    expect(JSON.parse(String(patchCall?.[1]?.body))).toEqual({
      resolution_note: "Original owner retains work",
    });
  });
});

describe("KAN-26 unclaimed SAM.gov pool", () => {
  test("renders only opportunities confirmed available by the batched ownership overlay", async () => {
    mockedGetStoredUser.mockReturnValue(agent);
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = urlOf(input);
      if (url === "/api/sam-gov") return response([
        { id: "OPEN-1", title: "Available SAM bid", closingDate: "2026-10-20", solicitationNumber: "SOL-OPEN" },
        { id: "TAKEN-1", title: "Claimed SAM bid", closingDate: "2026-10-21", solicitationNumber: "SOL-TAKEN" },
      ]);
      if (url.includes("opportunities/availability")) return response({ opportunities: [
        { external_notice_id: "OPEN-1", available: true },
        { external_notice_id: "TAKEN-1", available: false },
      ] });
      throw new Error(`Unexpected request: ${url}`);
    }) as jest.Mock;

    render(<UnclaimedBidsPage />);
    expect(await screen.findByText("Available SAM bid")).toBeInTheDocument();
    expect(screen.queryByText("Claimed SAM bid")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Review and pick up" })).toHaveAttribute("href", "/sam-gov/OPEN-1");
  });

  test("checks the full SAM.gov catalog in API-sized chunks", async () => {
    mockedGetStoredUser.mockReturnValue(agent);
    const catalog = Array.from({ length: 1001 }, (_, index) => ({
      id: `NOTICE-${index}`,
      title: `SAM bid ${index}`,
      closingDate: "2026-10-20",
      solicitationNumber: `SOL-${index}`,
    }));
    const chunkSizes: number[] = [];
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input);
      if (url === "/api/sam-gov") return response(catalog);
      if (url.includes("opportunities/availability")) {
        const body = JSON.parse(String(init?.body));
        chunkSizes.push(body.opportunities.length);
        return response({ opportunities: body.opportunities.map((item: { external_notice_id: string }) => ({ ...item, available: item.external_notice_id === "NOTICE-1000" })) });
      }
      throw new Error(`Unexpected request: ${url}`);
    }) as jest.Mock;

    render(<UnclaimedBidsPage />);
    expect(await screen.findByText("SAM bid 1000")).toBeInTheDocument();
    expect(chunkSizes).toEqual([1000, 1]);
  });
});

describe("KAN-48 Eastern reporting periods", () => {
  test("uses the Eastern calendar even while UTC is on the next day", () => {
    const instant = new Date("2026-03-01T04:30:00Z"); // February 28 at 11:30 PM Eastern.
    expect(easternReportingRange("today", instant)).toEqual({ from: "2026-02-28", to: "2026-02-28" });
    expect(easternReportingRange("month", instant)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(easternReportingRange("week", instant)).toEqual({ from: "2026-02-23", to: "2026-02-28" });
  });
});

describe("KAN-50 weekly labels", () => {
  test("keeps Monday-Sunday labels on UTC calendar dates for viewers west of UTC", () => {
    const previousTimezone = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try {
      expect(formatUtcDateRange(
        new Date("2026-10-05T00:00:00.000Z"),
        new Date("2026-10-11T00:00:00.000Z"),
      )).toBe("10/5/2026 – 10/11/2026");
    } finally {
      if (previousTimezone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimezone;
    }
  });
});

describe("KAN-30 and KAN-31 shared statuses and submission", () => {
  test("keeps exact labels/colors and sends supplier cost separately from submitted price", async () => {
    expect(Object.keys(BID_STATUSES)).toEqual([
      "Finding Supplier", "Bid submitted", "Waiting Approval", "Bid No Approved",
      "Approved for Submission", "Bid got removed", "Couldnt get quote",
    ]);
    expect(BID_STATUSES["Finding Supplier"]).toEqual({ color: "#8B0000", classification: "active" });
    mockedGetStoredUser.mockReturnValue(agent);
    const patchBodies: Array<Record<string, unknown>> = [];
    const bid = {
      id: 9, bid_id: "SAM-9", title: "Status bid", solicitation_number: "SOL-9",
      internal_status: "Finding Supplier", current_owner_user_id: agent.id,
      expected_submitted_price: 60000, supplier_cost: null, submitted_price: null,
      gross_profit: null, markup_percent: null, negative_profit_warning: false,
      award_outcome: "unknown", awarded_to: null, awarded_amount: null,
      outcome_notes: null, status_history: [], ownership_history: [],
    };
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = urlOf(input);
      if (init?.method === "PATCH") {
        patchBodies.push(JSON.parse(String(init.body)));
        return response({ bid: { ...bid, internal_status: "Bid submitted" }, changed: true });
      }
      if (url.includes("pipeline/bids/9")) return response({ bid });
      throw new Error(`Unexpected request: ${url}`);
    }) as jest.Mock;
    const user = userEvent.setup();

    render(<BidDetailPage />);
    await screen.findByRole("heading", { name: "Status bid" });
    await user.selectOptions(screen.getByLabelText("New status"), "Bid submitted");
    await user.type(screen.getByLabelText("Supplier cost"), "40000");
    await user.type(screen.getByLabelText("Submitted price"), "55000");
    await user.click(screen.getByRole("button", { name: "Update status" }));
    await waitFor(() => expect(patchBodies).toHaveLength(1));
    expect(patchBodies[0]).toMatchObject({ status: "Bid submitted", supplier_cost: "40000", submitted_price: "55000" });
  });
});
