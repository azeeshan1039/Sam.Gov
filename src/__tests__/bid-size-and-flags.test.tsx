import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AgentBidDataPage from "@/app/agent-bid-data/page";
import DashboardPage from "@/app/page";
import Sidebar from "@/components/Sidebar";
import { agentChartOptions, bucketChartOptions, trendChartOptions, type SizeReport } from "@/components/bid-size/BidSizeSection";
import { getStoredUser, type AuthUser } from "@/lib/auth";

jest.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("next/dynamic", () => () => {
  function Chart({ options }: { options?: { series?: Array<{ name?: string; data?: unknown[] }> } }) {
    return <pre data-testid="chart">{JSON.stringify(options?.series?.map((s) => ({ name: s.name, data: s.data })) ?? [])}</pre>;
  }
  return Chart;
});
jest.mock("highcharts", () => ({}));
jest.mock("highcharts/modules/accessibility", () => jest.fn());

jest.mock("@/lib/auth", () => {
  const actual = jest.requireActual("@/lib/auth");
  return { ...actual, getStoredUser: jest.fn(), clearStoredUser: jest.fn() };
});

jest.mock("@/components/pipeline/PipelineTable", () => ({
  PipelineTable: ({ empty }: { empty: string }) => <div data-testid="pipeline-table">{empty}</div>,
}));

const mockedGetStoredUser = jest.mocked(getStoredUser);
const admin: AuthUser = { id: 1, email: "m@example.com", full_name: "Manager", role: "admin", company_id: 10, is_active: true };
const agent: AuthUser = { id: 2, email: "a@example.com", full_name: "Agent One", role: "agent", company_id: 10, is_active: true };

const report: SizeReport = {
  interval: "month",
  count: 4,
  total: 935000,
  buckets: [
    { name: "Small", min: 0, max: 50000, count: 1, total: 10000, count_share: 25, value_share: 1.1 },
    { name: "Medium", min: 50000, max: 100000, count: 1, total: 75000, count_share: 25, value_share: 8 },
    { name: "Large", min: 100000, max: 500000, count: 1, total: 250000, count_share: 25, value_share: 26.7 },
    { name: "Very Large", min: 500000, max: null, count: 1, total: 600000, count_share: 25, value_share: 64.2 },
  ],
  series: [
    { period_start: "2026-09-01", buckets: { Small: { count: 1, total: 10000 }, Medium: { count: 0, total: 0 }, Large: { count: 1, total: 250000 }, "Very Large": { count: 0, total: 0 } } },
    { period_start: "2026-10-01", buckets: { Small: { count: 0, total: 0 }, Medium: { count: 1, total: 75000 }, Large: { count: 0, total: 0 }, "Very Large": { count: 1, total: 600000 } } },
  ],
  by_agent: [
    { user_id: 2, name: "Agent One", is_active: true, count: 2, total: 85000, buckets: { Small: { count: 1, total: 10000 }, Medium: { count: 1, total: 75000 }, Large: { count: 0, total: 0 }, "Very Large": { count: 0, total: 0 } } },
    { user_id: 3, name: "Agent Two", is_active: false, count: 2, total: 850000, buckets: { Small: { count: 0, total: 0 }, Medium: { count: 0, total: 0 }, Large: { count: 1, total: 250000 }, "Very Large": { count: 1, total: 600000 } } },
  ],
  thresholds: [],
};

function respond(body: unknown, status = 200) {
  return Promise.resolve({ ok: status < 300, status, json: async () => body } as Response);
}

let urls: string[] = [];

function agentBidData(agentUserId: number | "all") {
  return {
    agent_user_id: agentUserId,
    employees: [{ user_id: 2, name: "Agent One", is_active: true }, { user_id: 3, name: "Agent Two", is_active: false }],
    date_from: "2026-09-01",
    date_to: "2026-10-31",
    metrics: { submitted_bid_count: 4, total_submitted_price: 935000, total_gross_profit: 1, biggest_submitted_bid: 600000, size_buckets: {} },
    size_report: agentUserId === "all" ? report : { ...report, by_agent: [] },
    active: [], historical: [], completed: [],
  };
}

beforeEach(() => {
  mockedGetStoredUser.mockReset();
  urls = [];
});

describe("KAN-60/KAN-61 Bid Value vs. Size in Agent Bid Data", () => {
  test("admins can switch to all agents; the section shows count, $ and shares and hides per-agent tables", async () => {
    mockedGetStoredUser.mockReturnValue(admin);
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      return respond(agentBidData(url.includes("agent_user_id=all") ? "all" : 2));
    }) as jest.Mock;
    const user = userEvent.setup();
    render(<AgentBidDataPage />);
    expect(await screen.findByText("Bid Value vs. Size")).toBeInTheDocument();
    expect(screen.getAllByTestId("pipeline-table")).toHaveLength(3);

    const select = screen.getByLabelText("Agent");
    expect(within(select).getByRole("option", { name: "All agents (company)" })).toBeInTheDocument();
    await user.selectOptions(select, "all");
    await waitFor(() => expect(urls[urls.length - 1]).toContain("agent_user_id=all"));
    expect(await screen.findByText(/Company-wide submitted bids by size bucket · 4 bids · \$935,000.00/)).toBeInTheDocument();
    expect(screen.queryAllByTestId("pipeline-table")).toHaveLength(0);
    expect(screen.getByText(/Choose an agent to see their individual/)).toBeInTheDocument();

    const veryLarge = screen.getByTestId("bucket-Very Large");
    expect(veryLarge).toHaveTextContent("$500k+");
    expect(veryLarge).toHaveTextContent("$600,000.00");
    expect(veryLarge).toHaveTextContent("25% of bids · 64.2% of $");
    expect(screen.getByTestId("bucket-Small")).toHaveTextContent("< $50k");
    expect(screen.getByTestId("bucket-Medium")).toHaveTextContent("$50k – < $100k");

    const charts = screen.getAllByTestId("chart");
    expect(charts).toHaveLength(4);
    expect(charts[0]).toHaveTextContent('[{"name":"Bids","data":[1,1,1,1]}]');
    expect(charts[1]).toHaveTextContent('"data":[10000,75000,250000,600000]');

    const table = screen.getByRole("table", { name: "Bid size breakdown" });
    expect(within(table).getByText("Agent Two")).toBeInTheDocument();
    expect(within(table).getByText("(inactive)")).toBeInTheDocument();
    expect(within(table).getByText("2 · $850,000.00")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Weekly" }));
    await waitFor(() => expect(urls[urls.length - 1]).toContain("interval=week"));
    expect(screen.getByRole("button", { name: "Weekly" })).toHaveAttribute("aria-pressed", "true");
  });

  test("agents see only their own breakdown, with no company option and no size control", async () => {
    mockedGetStoredUser.mockReturnValue(agent);
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      urls.push(String(input));
      return respond(agentBidData(2));
    }) as jest.Mock;
    render(<AgentBidDataPage />);
    expect(await screen.findByText(/This agent's submitted bids by size bucket/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Agent")).not.toBeInTheDocument();
    expect(urls[0]).not.toContain("agent_user_id=all");
    expect(screen.getAllByTestId("chart")).toHaveLength(3);  // no per-agent chart
    expect(screen.queryByRole("combobox", { name: /size/i })).not.toBeInTheDocument();
  });

  test("a slow earlier response cannot switch the selector back after choosing all agents", async () => {
    mockedGetStoredUser.mockReturnValue(admin);
    let releaseFirst: (() => void) | undefined;
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      urls.push(url);
      if (!url.includes("agent_user_id=all")) {
        return new Promise<Response>((resolve) => {
          releaseFirst = () => resolve({ ok: true, status: 200, json: async () => agentBidData(2) } as Response);
        });
      }
      return respond(agentBidData("all"));
    }) as jest.Mock;
    const user = userEvent.setup();
    render(<AgentBidDataPage />);
    await waitFor(() => expect(urls).toHaveLength(1));
    await user.selectOptions(screen.getByLabelText("Agent"), "all");
    expect(await screen.findByText(/Company-wide submitted bids/)).toBeInTheDocument();
    await act(async () => {
      releaseFirst?.();
      await new Promise((resolve) => setTimeout(resolve, 50));  // let the stale response settle
    });
    expect(screen.getByLabelText("Agent")).toHaveValue("all");
    expect(screen.getByText(/Company-wide submitted bids/)).toBeInTheDocument();
  });

  test("renders an empty period without charts", async () => {
    mockedGetStoredUser.mockReturnValue(agent);
    const empty = { ...report, count: 0, total: 0, buckets: report.buckets.map((b) => ({ ...b, count: 0, total: 0, count_share: 0, value_share: 0 })) };
    global.fetch = jest.fn(() => respond({ ...agentBidData(2), size_report: empty })) as jest.Mock;
    render(<AgentBidDataPage />);
    expect(await screen.findByText("No submitted bids in this period.")).toBeInTheDocument();
    expect(screen.queryAllByTestId("chart")).toHaveLength(0);
  });

  test("chart series are built from the report", () => {
    expect(bucketChartOptions(report, "count").series?.[0]).toMatchObject({ data: [1, 1, 1, 1] });
    const trend = trendChartOptions(report);
    expect((trend.xAxis as { categories: string[] }).categories).toEqual(["Sep 2026", "Oct 2026"]);
    expect(trend.series?.map((s) => (s as { data: number[] }).data)).toEqual([[1, 0], [0, 1], [1, 0], [0, 1]]);
    const weekly = trendChartOptions({ ...report, interval: "week" });
    expect((weekly.xAxis as { categories: string[] }).categories[0]).toBe("Wk of Sep 1");
    const agents = agentChartOptions(report);
    expect(agents.series?.map((s) => (s as { name: string }).name)).toEqual(["Small", "Medium", "Large", "Very Large"]);
    expect((agents.series?.[3] as { data: number[] }).data).toEqual([0, 1]);
  });
});

describe("KAN-68 dashboard 90-day award flag", () => {
  function dashboardFetch(awardFlags: () => Promise<Response>) {
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("dashboard-stats")) return respond({ stats: {} });
      if (url.includes("stats/leaderboard")) return respond({ leaderboard: [] });
      if (url.includes("opportunities/duplicates")) return respond({ incidents: [{ id: 7, solicitation_number: "SOL-DUP", detected_at: "2026-09-26T12:00:00Z" }] });
      if (url.includes("opportunities/stale")) return respond({ bids: [] });
      if (url.includes("auth/team")) return respond({ members: [] });
      if (url.includes("pipeline/activity")) return respond({ items: [] });
      if (url.includes("pipeline/award-flags")) return awardFlags();
      throw new Error(`Unexpected request: ${url}`);
    }) as jest.Mock;
  }

  test("lists bids 90 days past submission with no outcome and links to the checkpoint", async () => {
    mockedGetStoredUser.mockReturnValue(admin);
    dashboardFetch(() => respond({
      count: 1,
      flags: [{ bid_id: 12, display_bid_id: "AMF12", solicitation_number: "SOL-90", title: "Beds", agent_name: "Agent One", submitted_on: "2026-07-01", days_since_submission: 102, href: "/award-tracking?checkpoint_state=flagged&bid=12" }],
    }));
    render(<DashboardPage />);
    const card = await screen.findByText("SOL-90");
    expect(card.closest("a")).toHaveAttribute("href", "/award-tracking?checkpoint_state=flagged&bid=12");
    expect(screen.getByText(/Agent One · submitted 2026-07-01 · 102 days, no award outcome logged/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Award Tracking" })).toHaveAttribute("href", "/award-tracking?checkpoint_state=flagged");
  });

  test("an award-flag failure never hides the other flags", async () => {
    mockedGetStoredUser.mockReturnValue(admin);
    const error = jest.spyOn(console, "error").mockImplementation(() => undefined);
    dashboardFetch(() => Promise.reject(new Error("network")));
    render(<DashboardPage />);
    expect(await screen.findByText("SOL-DUP")).toBeInTheDocument();
    expect(await screen.findByText("No submitted bids are past 90 days without an outcome.")).toBeInTheDocument();
    error.mockRestore();
  });
});

describe("Award Tracking navigation", () => {
  test.each([["admin", admin], ["agent", agent]])("%s sees the Award Tracking link", async (_name, user) => {
    mockedGetStoredUser.mockReturnValue(user);
    render(<Sidebar />);
    expect(await screen.findByRole("link", { name: "Award Tracking" })).toHaveAttribute("href", "/award-tracking");
    expect(screen.getByRole("link", { name: "Contract Awards" })).toHaveAttribute("href", "/contract-awards");
  });
});
