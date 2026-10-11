import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Exhaustive KAN-12 / KAN-13 flows on the real stack (fresh seed, see awards.fullstack.spec.ts header).
 * Every page is watched for page errors, console errors and 5xx responses.
 */
test.skip(!process.env.FULLSTACK, "set FULLSTACK=1 with a freshly seeded backend");
test.describe.configure({ mode: "serial", timeout: 180_000 });

const PASSWORD = "password123";
// How browsers report requests cancelled because the crawl navigated away. Not application failures.
const NAVIGATION_ABORTS = [
  /NetworkError when attempting to fetch resource/,  // Firefox
  /TypeError: Load failed/,                          // WebKit
  /Failed to fetch RSC payload .* Falling back to browser navigation/,  // Next.js prefetch abort
];
type Watched = { page: Page; problems: string[] };

function todayEt(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(now);
}

async function login(browser: Browser, email: string): Promise<Watched> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`pageerror ${page.url()}: ${error.message}`));
  page.on("console", async (message) => {
    if (message.type() !== "error") return;
    const url = page.url();
    const args = await Promise.all(message.args().map((arg) =>
      arg.evaluate((value) => (value instanceof Error ? `${value.name}: ${value.message}` :
        typeof value === "object" ? JSON.stringify(value) : String(value))).catch(() => String(arg))));
    const text = args.join(" ") || message.text();
    if (NAVIGATION_ABORTS.some((pattern) => pattern.test(text))) return;
    problems.push(`console ${url}: ${text}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 500) problems.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.goto("/login");
  await page.waitForLoadState("networkidle").catch(() => undefined);  // hydrated before typing
  await expect(async () => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await expect(page.getByLabel("Email")).toHaveValue(email, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });  // first visit compiles the dashboard
  // Let the post-login client redirect and dashboard requests settle before navigating again.
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  return { page, problems };
}

async function visit(page: Page, path: string) {
  try {
    await page.goto(path);
  } catch (error) {
    // WebKit: a late post-login redirect can interrupt the first navigation; retry once.
    if (!String(error).includes("interrupted by another navigation")) throw error;
    await page.waitForLoadState("networkidle").catch(() => undefined);
    await page.goto(path);
  }
  await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => undefined);
}

async function openBell(page: Page) {
  await page.getByRole("button", { name: /^Alerts/ }).click();
}

async function updateStatus(page: Page, status: string, costs?: { cost: string; price: string }) {
  await page.getByLabel("New status").selectOption(status);
  if (costs) {
    await page.getByLabel("Supplier cost").fill(costs.cost);
    await page.getByLabel("Submitted price").fill(costs.price);
  }
  await page.getByRole("button", { name: "Update status" }).click();
  await expect(page.getByText("Status updated.")).toBeVisible();
  // The page shows the message before it reloads the bid (finding F12); wait for the reload.
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(page.locator("span.rounded-full", { hasText: status }).first()).toBeVisible();  // current-status badge
  const select = page.getByLabel("New status");  // agents lose the editor once the bid is completed
  if (await select.count()) await expect(select).toHaveValue(status);
}

const ADMIN_ROUTES = ["/", "/sam-gov", "/contract-awards", "/negotiations", "/agent-bid-data", "/weekly-submissions",
  "/award-tracking", "/work-management", "/pipeline", "/hundred-k", "/approvals", "/bid-history", "/stats", "/team",
  "/activity-log", "/bids/1"];
const AGENT_ROUTES = ["/", "/unclaimed-bids", "/contract-awards", "/negotiations", "/my-bids", "/agent-bid-data",
  "/weekly-submissions", "/award-tracking", "/bids/1"];

test("@critical every page loads cleanly for every role", async ({ browser }) => {
  test.setTimeout(900_000);
  const report: string[] = [];
  for (const [email, routes] of [
    ["qa.admin@example.test", ADMIN_ROUTES],
    ["qa.one@example.test", AGENT_ROUTES],
    ["qa.two@example.test", AGENT_ROUTES.filter((r) => r !== "/bids/1")],
  ] as const) {
    const { page, problems } = await login(browser, email);
    for (const route of routes) {
      await visit(page, route);
      await expect(page.getByRole("heading").first()).toBeVisible();
    }
    report.push(...problems.map((p) => `${email} ${p}`));
    await page.context().close();
  }
  console.log(`[crawl] problems:\n${report.join("\n") || "none"}`);
  expect(report).toEqual([]);
});

test("@critical agent submits a bid in the UI and its checkpoints and size bucket appear", async ({ browser }) => {
  const { page, problems } = await login(browser, "qa.one@example.test");
  const mine = await (await page.request.get("/api/backend/pipeline/my-bids")).json();
  const active = mine.items.find((item: { solicitation_number: string }) => item.solicitation_number === "FS-ACTIVE");
  expect(active.size_bucket).toBe("Very Large");  // provisional, from the $510,000 expected price
  await visit(page, `/bids/${active.id}`);
  await updateStatus(page, "Waiting Approval");
  await updateStatus(page, "Bid submitted", { cost: "40000", price: "45000" });

  const timeline = page.getByRole("list", { name: "Award checkpoints" });
  await expect(timeline).toContainText(`Due ${todayEt(30)}`);
  await expect(timeline).toContainText(`Due ${todayEt(90)}`);
  await expect(page.getByText(`Day 30 on ${todayEt(30)} · 0/4`)).toBeVisible();
  const refreshed = await (await page.request.get(`/api/backend/pipeline/bids/${active.id}`)).json();
  expect(refreshed.bid.size_bucket).toBe("Small");  // recalculated from the $45,000 submitted price

  await visit(page, "/award-tracking");
  const row = page.getByRole("row", { name: /FS-ACTIVE/ });
  await expect(row).toContainText("Small");
  await expect(row).toContainText("Pending");
  await expect(row).toContainText(`Day 30 on ${todayEt(30)} · 0/4`);
  expect(problems).toEqual([]);
});

test("@critical bell alerts open the right checkpoint, even when already on Award Tracking", async ({ browser }) => {
  const { page, problems } = await login(browser, "qa.one@example.test");
  await openBell(page);
  await expect(page.getByText("Award checkpoint due").first()).toBeVisible();
  await page.getByRole("button", { name: /30-day award check due.*FS-DUE-031|FS-DUE-031.*30-day/ }).click();
  await expect(page).toHaveURL(/\/award-tracking\?bid=1$/);
  await expect(page.getByRole("dialog")).toContainText("Award check · FS-DUE-031");
  await page.keyboard.press("Escape");

  await openBell(page);
  await page.getByRole("button", { name: /FS-SEPTA-046/ }).first().click();
  await expect(page).toHaveURL(/\/award-tracking\?bid=2$/);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Award check · FS-SEPTA-046");
  await expect(dialog.getByLabel("Checkpoint", { exact: true })).toHaveValue("45");
  expect(problems).toEqual([]);
});

test("@critical agent records a Won outcome from the bid page and sees history and read-only rules", async ({ browser }) => {
  const { page, problems } = await login(browser, "qa.one@example.test");
  await visit(page, "/bids/2");  // FS-SEPTA-046, 45-day check due
  await expect(page.getByText("Only SAM.GOV bids can be looked up; other portals use manual entry.")).toBeVisible();
  await page.getByRole("radio", { name: "Won" }).check();
  await expect(page.getByLabel("Awarded to")).toHaveCount(0);
  await page.getByLabel("Award amount (optional)").fill("74000");
  await page.getByLabel("Notes").fill("Award letter received");
  await page.getByRole("button", { name: "Save outcome" }).click();
  await expect(page.getByRole("status")).toHaveText("45-day check recorded.");
  await expect(page.getByText("Award amount $74,000.00")).toBeVisible();
  const timeline = page.getByRole("list", { name: "Award checkpoints" });
  await expect(timeline).toContainText("Not needed (outcome known)");
  await expect(page.getByText(/Pending → Won · 45-day check · \$74,000.00/)).toBeVisible();

  await visit(page, "/bids/5");  // FS-WON-120, already Won
  await expect(page.getByText(/Pending → Won · 90-day check/)).toBeVisible();

  await visit(page, "/award-tracking");
  const row = page.getByRole("row", { name: /FS-SEPTA-046/ });
  await expect(row).toContainText("Won");
  await expect(row).toContainText("$74,000.00");
  await expect(row).toContainText("Complete · 1/4");  // the 30-day check was missed, the 45-day check completed
  await expect(row).not.toContainText("Rival");
  expect(problems).toEqual([]);

  const other = await login(browser, "qa.two@example.test");
  await visit(other.page, "/bids/3");  // Agent Two's own Lost bid
  await expect(other.page.getByText("Awarded to Rival Medical Inc for $240,000.00")).toBeVisible();
  await expect(other.page.getByRole("button", { name: "Save outcome" })).toBeVisible();
  expect(other.problems).toEqual([]);
});

test("@critical manager reopens and resubmits a bid; checkpoints follow the new submission", async ({ browser }) => {
  const { page, problems } = await login(browser, "qa.admin@example.test");
  const bids = await (await page.request.get("/api/backend/pipeline/award-tracking?q=FS-ACTIVE")).json();
  const id = bids.items[0].id;
  await visit(page, `/bids/${id}`);
  await updateStatus(page, "Waiting Approval");
  await expect(page.getByRole("list", { name: "Award checkpoints" })).toHaveCount(0);
  await visit(page, "/award-tracking");
  await expect(page.getByRole("row", { name: /FS-ACTIVE/ })).toHaveCount(0);

  await visit(page, `/bids/${id}`);
  await updateStatus(page, "Bid submitted", { cost: "400000", price: "520000" });
  await expect(page.getByRole("list", { name: "Award checkpoints" })).toContainText(`Due ${todayEt(30)}`);
  await visit(page, "/award-tracking");
  await expect(page.getByRole("row", { name: /FS-ACTIVE/ })).toContainText("Very Large");
  expect(problems).toEqual([]);
});

test("@critical manager filters and sorts real award records", async ({ browser }) => {
  const { page, problems } = await login(browser, "qa.admin@example.test");
  await visit(page, "/award-tracking");
  const rows = page.locator('tr[data-testid^="award-row-"]');
  await expect(rows).toHaveCount(9);

  async function choose(label: string, option: string) {
    await page.getByRole("combobox", { name: label }).click();
    await page.getByRole("option", { name: option, exact: true }).click();
    await page.waitForLoadState("networkidle").catch(() => undefined);
  }
  // Solicitation # is the first line of the second cell in each award row.
  async function names() {
    return page.locator('tr[data-testid^="award-row-"]').evaluateAll((trs) =>
      trs.map((tr) => tr.querySelectorAll("td")[1]?.querySelector("div")?.textContent?.trim() || ""));
  }
  async function expectNames(expected: string[], ordered = false) {
    await expect.poll(async () => (ordered ? await names() : (await names()).sort()), { timeout: 15_000 })
      .toEqual(ordered ? expected : [...expected].sort());
  }

  await choose("Employee", "QA Agent Two");
  await expectNames(["FS-FLAG-091", "FS-LEGACY-400", "FS-LOST-061"]);
  await choose("Employee", "All employees");
  await choose("Outcome", "Won");
  await expectNames(["FS-SEPTA-046", "FS-WON-120"]);
  await choose("Outcome", "All outcomes");
  await choose("Portal", "SEPTA");
  await expectNames(["FS-SEPTA-046"]);
  await choose("Portal", "All portals");
  await choose("Size bucket", "Very Large ($500k+)");
  await expectNames(["FS-ACTIVE", "FS-FLAG-091"]);
  await choose("Size bucket", "Medium ($50k – < $100k)");
  await expectNames(["FS-NEW-000", "FS-SEPTA-046"]);
  await choose("Size bucket", "All sizes");
  await choose("Checkpoint", "90-day flag");
  await expectNames(["FS-FLAG-091"]);
  await choose("Checkpoint", "Before checkpoint tracking");
  await expectNames(["FS-LEGACY-400"]);
  await choose("Checkpoint", "Check due");
  await expectNames(["47QSMD20R0001", "FS-DUE-031"]);
  await choose("Checkpoint", "Upcoming");
  await expectNames(["FS-ACTIVE", "FS-NEW-000"]);
  await choose("Checkpoint", "All checkpoints");

  await page.getByLabel("Submitted from").fill(todayEt(-40));
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expectNames(["47QSMD20R0001", "FS-ACTIVE", "FS-DUE-031", "FS-NEW-000"]);
  await page.getByLabel("Submitted to").fill(todayEt(-1));
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expectNames(["47QSMD20R0001", "FS-DUE-031"]);
  await page.getByLabel("Submitted from").fill("");
  await page.getByLabel("Submitted to").fill("");
  await page.getByLabel("Search award records").fill("legacy");
  await expect(rows).toHaveCount(1);
  await page.getByLabel("Search award records").fill("");
  await expect(rows).toHaveCount(9);

  await page.getByRole("button", { name: "Outcome" }).click();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  const rank: Record<string, number> = { Won: 0, Lost: 1, Pending: 2, Unknown: 3 };
  const outcomes = () => rows.evaluateAll((trs) =>
    trs.map((tr) => tr.querySelectorAll("td")[7]?.querySelector("span")?.textContent?.trim() || ""));
  await expect.poll(async () => {
    const order = (await outcomes()).map((outcome) => rank[outcome]);
    return order.length === 9 && order.every((value, index) => index === 0 || order[index - 1] <= value);
  }, { timeout: 15_000 }).toBe(true);  // Won → Lost → Pending → Unknown
  await page.getByRole("button", { name: "Awarded $" }).click();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect.poll(async () => (await names())[0]).toBe("FS-LOST-061");  // $240,000 is the largest awarded amount
  await page.getByRole("button", { name: "Submitted $" }).click();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect.poll(async () => (await names())[0]).toBe("FS-FLAG-091");  // $600,000 is the largest submitted price
  await expect(page.getByText("Who we lose to")).toBeVisible();
  expect(problems).toEqual([]);
});

test("@critical manager alerts, dashboard flag and Bid Value vs. Size presets", async ({ browser }) => {
  const { page, problems } = await login(browser, "qa.admin@example.test");
  await expect(page.locator("#award-flags")).toContainText("FS-FLAG-091");
  await openBell(page);
  await page.getByRole("button", { name: /Award outcome missing \(90 days\)/ }).first().click();
  await expect(page).toHaveURL(/checkpoint_state=flagged&bid=4/);
  await expect(page.getByRole("dialog")).toContainText("Award check · FS-FLAG-091");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Checkpoint" })).toContainText("90-day flag");  // filter synced from the link

  await visit(page, "/agent-bid-data");
  await page.getByRole("combobox", { name: "Agent", exact: true }).selectOption("all");
  await expect(page.getByText(/Company-wide submitted bids by size bucket/)).toBeVisible();
  await page.getByRole("button", { name: "Today" }).click();
  await expect(page.getByText(/Company-wide submitted bids by size bucket · 2 bids/)).toBeVisible();  // FS-NEW-000 + FS-ACTIVE
  await page.getByRole("button", { name: "This month" }).click();
  await expect(page.getByText(/Company-wide submitted bids by size bucket · \d+ bids/)).toBeVisible();
  await page.getByRole("button", { name: "Weekly" }).click();
  await expect(page.getByRole("button", { name: "Weekly" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("combobox", { name: "Agent", exact: true }).selectOption({ label: "QA Agent Two" });
  await expect(page.getByText(/This agent's submitted bids by size bucket/)).toBeVisible();
  await expect(page.getByText("Active bids", { exact: true })).toBeVisible();  // per-agent bid tables are back
  expect(problems).toEqual([]);
});
