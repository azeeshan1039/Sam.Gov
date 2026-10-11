import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * Full-stack KAN-12 / KAN-13 run: real Next.js + real Flask API + seeded SQLite, no stubs.
 *
 *   backendGOVAI> venv\Scripts\python.exe scripts\seed_award_scenarios.py seed  <scratch>\fullstack.db
 *   backendGOVAI> venv\Scripts\python.exe scripts\seed_award_scenarios.py serve <scratch>\fullstack.db 9100
 *   Sam.Gov>      set FULLSTACK=1&& set BACKEND_URL=http://127.0.0.1:9100&& npm run test:e2e:chromium -- e2e/fullstack
 */
test.skip(!process.env.FULLSTACK, "set FULLSTACK=1 with a seeded backend (see header)");
test.describe.configure({ mode: "serial" });

const PASSWORD = "password123";

async function login(browser: Browser, email: string): Promise<Page> {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/login");
  await page.waitForLoadState("networkidle").catch(() => undefined);  // hydrated before typing
  await expect(async () => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(PASSWORD);
    await expect(page.getByLabel("Email")).toHaveValue(email, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });  // first visit compiles the dashboard
  await page.waitForLoadState("networkidle").catch(() => undefined);
  return page;
}

test("agent sees only their submitted bids and records a lost outcome", async ({ browser }) => {
  const page = await login(browser, "qa.one@example.test");
  await page.goto("/award-tracking");
  const table = page.getByRole("table");
  await expect(table.getByText("FS-DUE-031", { exact: true })).toBeVisible();
  await expect(table.getByText("FS-SEPTA-046", { exact: true })).toBeVisible();
  await expect(table.getByText("FS-WON-120", { exact: true })).toBeVisible();
  await expect(table.getByText("FS-NEW-000", { exact: true })).toBeVisible();
  await expect(table.getByText("FS-LOST-061", { exact: true })).toHaveCount(0);   // another agent's bid
  await expect(table.getByText("FS-ACTIVE", { exact: true })).toHaveCount(0);     // not submitted
  await expect(page.getByRole("status")).toContainText("3 award check(s) need your update");

  const row = page.getByRole("row", { name: /FS-DUE-031/ });
  await expect(row).toContainText("Day 30 · Due · 0/4");
  await expect(row).toContainText("Small");
  await row.getByRole("button", { name: "Record check" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Checkpoint", { exact: true })).toHaveValue("30");
  await dialog.getByRole("radio", { name: "Lost" }).check();
  await dialog.getByLabel("Awarded to").fill("Beta Supply LLC");
  await dialog.getByLabel("Winning amount").fill("19500");
  await dialog.getByLabel("Notes").fill("Full-stack run");
  await dialog.getByRole("button", { name: "Save outcome" }).click();
  await expect(dialog.getByRole("status")).toHaveText("30-day check recorded.");
  await expect(dialog.getByText(/Pending → Lost · 30-day check · Beta Supply LLC · \$19,500.00/)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(row).toContainText("Beta Supply LLC");
  await expect(row).toContainText("$19,500.00");
  await expect(row).toContainText("Complete · 1/4");

  // A non-federal portal cannot be looked up on SAM.gov.
  await page.getByRole("row", { name: /FS-SEPTA-046/ }).getByRole("button", { name: "Record check" }).click();
  await expect(page.getByRole("dialog").getByText(/Only SAM.GOV bids can be looked up/)).toBeVisible();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Check SAM.gov now" })).toBeDisabled();
  await page.keyboard.press("Escape");

  // Live SAM.gov lookup through the real backend for a real solicitation with published awards.
  await page.getByRole("row", { name: /47QSMD20R0001/ }).getByRole("button", { name: "Record check" }).click();
  const live = page.getByRole("dialog");
  await live.getByRole("button", { name: "Check SAM.gov now" }).click();
  await expect(live.getByRole("status")).toHaveText("SAM.gov award information found.", { timeout: 60_000 });
  await expect(live.getByTestId("sam-award-info")).toContainText("Awarded to");
  await expect(live.getByRole("note")).toContainText("different companies match this solicitation");
  await expect(live.getByRole("radio", { name: "Pending" })).toBeChecked(); // nothing decided automatically
  await live.getByRole("button", { name: "Use these values" }).click();
  await live.getByRole("radio", { name: "Lost" }).check();
  await expect(live.getByLabel("Awarded to")).not.toHaveValue("");
  await live.getByRole("button", { name: "Save outcome" }).click();
  await expect(live.getByRole("status")).toHaveText("30-day check recorded.");
  await expect(live.getByText(/· from SAM.gov/)).toBeVisible();
  await page.keyboard.press("Escape");
});

test("second agent is scoped to their own bids and cannot record another agent's outcome", async ({ browser }) => {
  const page = await login(browser, "qa.two@example.test");
  await expect(page.locator("#award-flags")).toHaveCount(0);  // manager-only dashboard card
  await page.goto("/award-tracking");
  const table = page.getByRole("table");
  await expect(table.getByText("FS-LOST-061", { exact: true })).toBeVisible();
  await expect(table.getByText("FS-FLAG-091", { exact: true })).toBeVisible();
  await expect(table.getByText("FS-LEGACY-400", { exact: true })).toBeVisible();
  await expect(table.getByText("FS-DUE-031", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Employee" })).toHaveCount(0);
  await expect(page.getByRole("row", { name: /FS-FLAG-091/ })).toContainText("90-day flag");
  await page.goto("/bids/1");  // Agent One's bid
  await expect(page.getByText("You do not have access to this bid.")).toBeVisible();
  await page.goto("/agent-bid-data");
  await expect(page.getByText(/This agent's submitted bids by size bucket/)).toBeVisible();
  await expect(page.getByLabel("Agent")).toHaveCount(0);
});

test("manager clears the 90-day dashboard flag and reviews company records", async ({ browser }) => {
  const page = await login(browser, "qa.admin@example.test");
  const flags = page.locator("#award-flags");
  await expect(flags.getByRole("link", { name: /FS-FLAG-091/ })).toBeVisible();
  await expect(flags).toContainText("91 days, no award outcome logged");
  await flags.getByRole("link", { name: /FS-FLAG-091/ }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("90 days since submission");
  await expect(dialog.getByLabel("Checkpoint", { exact: true })).toHaveValue("90");
  await dialog.getByRole("radio", { name: "Unknown" }).check();
  await dialog.getByLabel("Notes").fill("Agency has not published an award yet");
  await dialog.getByRole("button", { name: "Save outcome" }).click();
  await expect(dialog.getByRole("status")).toHaveText("90-day check recorded.");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("row", { name: /FS-FLAG-091/ })).toHaveCount(0); // filtered to flagged

  await page.goto("/");
  await expect(page.locator("#award-flags")).toContainText("No submitted bids are past 90 days without an outcome.");

  await page.goto("/award-tracking");
  await expect(page.getByRole("row", { name: /FS-LEGACY-400/ })).toContainText("Before checkpoint tracking");
  await expect(page.getByRole("row", { name: /FS-LOST-061/ })).toContainText("Rival Medical Inc");
  await page.getByRole("combobox", { name: "Outcome" }).click();
  await page.getByRole("option", { name: "Lost" }).click();
  await expect(page.getByRole("row", { name: /FS-DUE-031|FS-LOST-061|47QSMD20R0001/ })).toHaveCount(3);
  await expect(page.getByText("Who we lose to")).toBeVisible();
});

test("company Bid Value vs. Size totals match the seeded submissions", async ({ browser }) => {
  const page = await login(browser, "qa.admin@example.test");
  await page.goto("/agent-bid-data");
  await page.getByLabel("Agent").selectOption("all");
  await expect(page.getByText(/Company-wide submitted bids by size bucket/)).toBeVisible();
  await page.getByLabel("From").fill("2025-01-01");
  await page.getByRole("button", { name: "Apply custom range" }).click();
  await expect(page.getByText(/Company-wide submitted bids by size bucket · 8 bids · \$1,137,999.99/)).toBeVisible();
  await expect(page.getByTestId("bucket-Small")).toContainText("4");
  await expect(page.getByTestId("bucket-Medium")).toContainText("$174,999.99");
  await expect(page.getByTestId("bucket-Large")).toContainText("$250,000.00");
  await expect(page.getByTestId("bucket-Very Large")).toContainText("$600,000.00");
  await expect(page.getByRole("table", { name: "Bid size breakdown" })).toContainText("QA Agent Two");
  await expect(page.locator(".highcharts-container")).toHaveCount(4);
});
