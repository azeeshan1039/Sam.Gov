import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * KAN-12 / KAN-13 browser checks with a stubbed backend. The award tracking stub is
 * stateful: recording an outcome changes what the list returns next.
 */

const manager = { id: 1, email: "manager@example.test", full_name: "QA Manager", role: "admin", company_id: 10, is_active: true };
const agentUser = { id: 2, email: "agent@example.test", full_name: "Agent One", role: "agent", company_id: 10, is_active: true };

type Row = Record<string, unknown> & { id: number };

function baseRow(overrides: Partial<Row> & { id: number }): Row {
  return {
    bid_id: `AMF${overrides.id}`, solicitation_number: `SOL-${overrides.id}`, title: "Hospital beds", portal: "SAM.GOV",
    agent_user_id: 2, agent_name: "Agent One", submitted_at: "2026-08-20T16:00:00Z", submitted_price: 60000,
    size_bucket: "Medium", can_record: true, award_outcome: "pending", awarded_to: null, awarded_amount: null,
    outcome_notes: null, submitted_on: "2026-08-20", days_since_submission: 52, tracked: true, checkpoint_state: "due",
    current_checkpoint: { checkpoint_days: 45, due_on: "2026-10-04", state: "due" }, checkpoints_completed: 1,
    checkpoints_total: 4, flagged: false, sam_info: null,
    ...overrides,
  };
}

function checkpoints(row: Row) {
  const resolved = row.award_outcome === "won" || row.award_outcome === "lost";
  return [30, 45, 60, 90].map((days, index) => ({
    id: row.id * 10 + index, checkpoint_days: days, due_on: ["2026-09-19", "2026-10-04", "2026-10-19", "2026-11-18"][index],
    status: days === 30 || (days === 45 && resolved) ? "completed" : resolved ? "closed_resolved" : "open",
    state: days === 30 || (days === 45 && resolved) ? "completed" : resolved ? "closed" : days === 45 ? "due" : "upcoming",
    checked_on: days === 30 ? "2026-09-20" : null, checked_by_name: days === 30 ? "Agent One" : null,
    award_status: days === 30 ? "pending" : null, awarded_to: null, awarded_amount: null, notes: null,
  }));
}

class AwardBackend {
  rows: Row[] = [
    baseRow({ id: 1 }),
    baseRow({ id: 2, solicitation_number: "SOL-LOST", award_outcome: "lost", awarded_to: "Rival Inc", awarded_amount: 140000, submitted_price: 150000, size_bucket: "Large", checkpoint_state: "complete", current_checkpoint: null, checkpoints_completed: 2, agent_name: "Agent Two", agent_user_id: 3 }),
    baseRow({ id: 3, solicitation_number: "SOL-FLAG", submitted_price: 700000, size_bucket: "Very Large", checkpoint_state: "flagged", flagged: true, current_checkpoint: { checkpoint_days: 90, due_on: "2026-07-01", state: "due" }, submitted_on: "2026-04-01", days_since_submission: 193 }),
  ];
  posts: Array<{ url: string; body: Record<string, unknown> }> = [];

  detail(row: Row) {
    return {
      ...row, checkpoints: checkpoints(row), history: [], lookups: [], can_record: true, tracking_start_date: "2026-01-01",
      lookup: { enabled: true, eligible: true, reason: null, daily_budget: 10, remaining_today: 10 },
    };
  }

  list(url: URL) {
    let items = [...this.rows];
    const outcome = url.searchParams.get("outcome");
    const size = url.searchParams.get("size");
    const state = url.searchParams.get("checkpoint_state");
    if (outcome) items = items.filter((r) => r.award_outcome === outcome);
    if (size) items = items.filter((r) => String(r.size_bucket).toLowerCase().replace(" ", "_") === size);
    if (state) items = items.filter((r) => r.checkpoint_state === state);
    const sort = url.searchParams.get("sort");
    if (sort === "awarded_amount") {
      const desc = url.searchParams.get("dir") !== "asc";
      items.sort((a, b) => (Number(b.awarded_amount ?? -1) - Number(a.awarded_amount ?? -1)) * (desc ? 1 : -1));
    }
    const count = (value: string) => this.rows.filter((r) => r.award_outcome === value).length;
    return {
      items,
      summary: {
        count: items.length, outcomes: { won: count("won"), lost: count("lost"), pending: count("pending"), unknown: count("unknown") },
        win_rate: null, won_submitted_total: 0, lost_submitted_total: 0, lost_to_competitors_total: 140000,
        flagged: items.filter((r) => r.flagged).length, due: items.filter((r) => r.checkpoint_state === "due").length,
        top_competitors: [{ name: "Rival Inc", count: 1, total: 140000 }],
      },
      agents: [{ user_id: 2, name: "Agent One" }, { user_id: 3, name: "Agent Two" }],
      portals: ["SAM.GOV", "SEPTA"], checkpoint_days: [30, 45, 60, 90], tracking_start_date: "2026-01-01",
      today: "2026-10-11", sort: sort || "submitted_at", dir: url.searchParams.get("dir") || "desc",
    };
  }

  async handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/backend/pipeline/", "");
    if (path === "award-tracking") return route.fulfill({ json: this.list(url) });
    const match = path.match(/^bids\/(\d+)\/(award-checkpoints|award-outcome)(?:\/(\d+))?$/);
    if (!match) return route.fulfill({ status: 404, json: { error: `unstubbed ${path}` } });
    const row = this.rows.find((r) => r.id === Number(match[1]))!;
    if (request.method() === "POST") {
      const body = request.postDataJSON();
      this.posts.push({ url: path, body });
      Object.assign(row, {
        award_outcome: body.award_outcome,
        awarded_to: body.award_outcome === "lost" ? body.awarded_to : null,
        awarded_amount: body.award_outcome === "lost" || body.award_outcome === "won" ? Number(body.awarded_amount) : null,
        checkpoint_state: "complete", current_checkpoint: null, checkpoints_completed: 2,
      });
    }
    return route.fulfill({ json: { bid: row, award: this.detail(row) } });
  }
}

async function authenticate(page: Page, user: Record<string, unknown>) {
  await page.addInitScript((stored) => {
    localStorage.setItem("samgov-auth-user", JSON.stringify(stored));
  }, user);
  await page.route("**/api/backend/notifications/agent**", (route) => route.fulfill({ json: { notifications: [], unread_count: 0 } }));
}

function monitorRuntime(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function expectAccessible(page: Page, include?: string) {
  const builder = new AxeBuilder({ page });
  // The pre-existing Agent Bid Data header uses the app-wide low-contrast muted token (reported
  // separately); scoping keeps this check on the new Bid Value vs. Size section.
  if (include) builder.include(include);
  const result = await builder.analyze();
  const serious = result.violations
    .filter((v) => ["critical", "serious"].includes(v.impact || ""))
    .map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target.join(" ")).slice(0, 5) }));
  expect(serious).toEqual([]);
}

test("@critical an agent records a lost outcome at the due checkpoint", async ({ page }) => {
  const errors = monitorRuntime(page);
  const backend = new AwardBackend();
  await authenticate(page, agentUser);
  await page.route("**/api/backend/pipeline/**", (route) => backend.handle(route));

  await page.goto("/award-tracking");
  const row = page.getByTestId("award-row-1");
  await expect(row.getByText("Day 45 · Due · 1/4")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("award check(s) need your update");
  await row.getByRole("button", { name: "Record check" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Award checkpoints")).toContainText("Checked 2026-09-20 by Agent One");
  await expect(dialog.getByLabel("Checkpoint", { exact: true })).toHaveValue("45");
  await dialog.getByRole("radio", { name: "Lost" }).check();
  await dialog.getByLabel("Awarded to").fill("Acme Supply");
  await dialog.getByLabel("Winning amount").fill("58000");
  await dialog.getByLabel("Notes").fill("Agency posted award");
  await expectAccessible(page);
  await dialog.getByRole("button", { name: "Save outcome" }).click();
  await expect(dialog.getByRole("status")).toHaveText("45-day check recorded.");
  expect(backend.posts[0]).toMatchObject({
    url: "bids/1/award-checkpoints/45",
    body: { award_outcome: "lost", awarded_to: "Acme Supply", awarded_amount: "58000", notes: "Agency posted award" },
  });
  await page.keyboard.press("Escape");
  await expect(row.getByText("Acme Supply")).toBeVisible();
  await expect(row.getByText("$58,000.00")).toBeVisible();
  await expect(row.getByText("Complete · 2/4")).toBeVisible();
  expect(errors).toEqual([]);
});

test("@critical a manager filters by outcome and size and sorts by award amount", async ({ page }) => {
  const backend = new AwardBackend();
  await authenticate(page, manager);
  await page.route("**/api/backend/pipeline/**", (route) => backend.handle(route));
  await page.goto("/award-tracking");
  await expect(page.getByTestId("award-row-3")).toBeVisible();

  await page.getByRole("combobox", { name: "Outcome" }).click();
  await page.getByRole("option", { name: "Lost" }).click();
  await expect(page.getByTestId(/award-row-/)).toHaveCount(1);
  await expect(page.getByTestId("award-row-2")).toContainText("Rival Inc");

  await page.getByRole("combobox", { name: "Outcome" }).click();
  await page.getByRole("option", { name: "All outcomes" }).click();
  await page.getByRole("combobox", { name: "Size bucket" }).click();
  await page.getByRole("option", { name: "Very Large ($500k+)" }).click();
  await expect(page.getByTestId(/award-row-/)).toHaveCount(1);
  await expect(page.getByTestId("award-row-3")).toBeVisible();

  await page.getByRole("combobox", { name: "Size bucket" }).click();
  await page.getByRole("option", { name: "All sizes" }).click();
  await page.getByRole("button", { name: "Awarded $" }).click();
  await expect(page.getByTestId(/award-row-/).first()).toHaveAttribute("data-testid", "award-row-2");
  await expect(page.getByText("Who we lose to")).toBeVisible();
  await expectAccessible(page);
});

test("@critical the dashboard 90-day flag opens that bid's checkpoint", async ({ page }) => {
  const backend = new AwardBackend();
  await authenticate(page, manager);
  await page.route("**/api/sam-gov/dashboard-stats**", (route) => route.fulfill({ json: { stats: {} } }));
  await page.route("**/api/backend/stats/leaderboard", (route) => route.fulfill({ json: { leaderboard: [] } }));
  await page.route("**/api/backend/opportunities/duplicates", (route) => route.fulfill({ json: { incidents: [] } }));
  await page.route("**/api/backend/opportunities/stale", (route) => route.fulfill({ json: { bids: [] } }));
  await page.route("**/api/backend/auth/team", (route) => route.fulfill({ json: { members: [] } }));
  await page.route("**/api/backend/pipeline/**", (route) => {
    const url = route.request().url();
    if (url.includes("/activity")) return route.fulfill({ json: { items: [] } });
    if (url.includes("/dashboard-pulse")) {
      return route.fulfill({ json: { periods: [
        { key: "today", label: "Today", date_from: "2026-10-13", date_to: "2026-10-13", picked_up: 0, submitted: 0 },
        { key: "week", label: "This week", date_from: "2026-10-12", date_to: "2026-10-13", picked_up: 0, submitted: 0 },
        { key: "month", label: "This month", date_from: "2026-10-01", date_to: "2026-10-13", picked_up: 0, submitted: 0 },
      ] } });
    }
    if (url.includes("/award-flags")) {
      return route.fulfill({ json: { count: 1, flags: [{ bid_id: 3, display_bid_id: "AMF3", solicitation_number: "SOL-FLAG", title: "Beds", agent_name: "Agent One", submitted_on: "2026-04-01", days_since_submission: 193, href: "/award-tracking?checkpoint_state=flagged&bid=3" }] } });
    }
    return backend.handle(route);
  });

  await page.goto("/");
  const flag = page.locator("#award-flags").getByRole("link", { name: /SOL-FLAG/ });
  await expect(flag).toBeVisible();
  await flag.click();
  await expect(page).toHaveURL(/\/award-tracking\?checkpoint_state=flagged&bid=3/);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Award check · SOL-FLAG");
  await expect(dialog.getByRole("alert")).toContainText("90 days since submission");
});

test("@critical Bid Value vs. Size shows company and agent breakdowns with charts", async ({ page }) => {
  const errors = monitorRuntime(page);
  await authenticate(page, manager);
  const report = (company: boolean) => ({
    interval: "month", count: 4, total: 935000,
    buckets: [
      { name: "Small", min: 0, max: 50000, count: 1, total: 10000, count_share: 25, value_share: 1.1 },
      { name: "Medium", min: 50000, max: 100000, count: 1, total: 75000, count_share: 25, value_share: 8 },
      { name: "Large", min: 100000, max: 500000, count: 1, total: 250000, count_share: 25, value_share: 26.7 },
      { name: "Very Large", min: 500000, max: null, count: 1, total: 600000, count_share: 25, value_share: 64.2 },
    ],
    series: [{ period_start: "2026-10-01", buckets: { Small: { count: 1, total: 10000 }, Medium: { count: 1, total: 75000 }, Large: { count: 1, total: 250000 }, "Very Large": { count: 1, total: 600000 } } }],
    by_agent: company ? [{ user_id: 2, name: "Agent One", is_active: true, count: 4, total: 935000, buckets: { Small: { count: 1, total: 10000 }, Medium: { count: 1, total: 75000 }, Large: { count: 1, total: 250000 }, "Very Large": { count: 1, total: 600000 } } }] : [],
    thresholds: [],
  });
  const requested: string[] = [];
  await page.route("**/api/backend/pipeline/agent-bid-data**", (route) => {
    const url = new URL(route.request().url());
    requested.push(url.search);
    const company = url.searchParams.get("agent_user_id") === "all";
    return route.fulfill({ json: {
      agent_user_id: company ? "all" : 2, employees: [{ user_id: 2, name: "Agent One", is_active: true }],
      date_from: "2026-10-01", date_to: "2026-10-31",
      metrics: { submitted_bid_count: 4, total_submitted_price: 935000, total_gross_profit: 1000, biggest_submitted_bid: 600000, size_buckets: {} },
      size_report: report(company), active: [], historical: [], completed: [],
    } });
  });

  await page.goto("/agent-bid-data");
  await expect(page.getByText("Bid Value vs. Size")).toBeVisible();
  await expect(page.locator(".highcharts-container")).toHaveCount(3);
  await page.getByLabel("Agent").selectOption("all");
  await expect(page.getByText(/Company-wide submitted bids by size bucket/)).toBeVisible();
  await expect(page.locator(".highcharts-container")).toHaveCount(4);
  await expect(page.getByTestId("bucket-Very Large")).toContainText("64.2% of $");
  await page.getByRole("button", { name: "This week" }).click();
  await page.getByRole("button", { name: "Weekly" }).click();
  expect(requested.some((query) => query.includes("interval=week"))).toBe(true);
  await expectAccessible(page, '[aria-labelledby="bid-size-heading"]');
  expect(errors).toEqual([]);
});

test("existing Contract Awards search and download still work", async ({ page }) => {
  await authenticate(page, manager);
  await page.route("**/api/contract-awards", (route) => route.fulfill({ json: {
    records: [{ piid: "15B61524P00000105", modificationNumber: "0", agencyId: "1540", dateSigned: "2024-03-15", dollarsObligated: "28735", totalUltimateContractValue: "52680.8", awardeeLegalName: "GE PRECISION HEALTHCARE LLC", awardeeUei: "JJURYE5M19G1", awardeeCage: "1GMR6", awardeePlace: "", placeOfPerformance: "", contractingDepartment: "JUSTICE", contractingSubtier: "", fundingDepartment: "", fundingSubtier: "", naicsCode: "339112", productOrServiceCode: "6515", productOrServiceType: "PRODUCT", typeOfSetAside: "", extentCompeted: "", typeOfContractPricing: "", description: "Beds" }],
    totalRecords: 1, limit: 25, offset: 0,
  } }));
  await page.goto("/contract-awards");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.getByText("GE PRECISION HEALTHCARE LLC")).toBeVisible();
  await expect(page.getByRole("button", { name: /Download CSV/ })).toBeEnabled();
});

test("award pages do not overflow common viewport widths", async ({ page }) => {
  const backend = new AwardBackend();
  await authenticate(page, manager);
  await page.route("**/api/backend/pipeline/**", (route) => backend.handle(route));
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/award-tracking");
    await expect(page.getByTestId("award-row-1")).toBeAttached();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, `unexpected document overflow at ${width}px`).toBe(false);
  }
});
