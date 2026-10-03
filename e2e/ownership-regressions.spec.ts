import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import availability from "./fixtures/v1/availability.json";
import catalog from "./fixtures/v1/sam-catalog.json";

const manager = {
  id: 1,
  email: "manager@example.test",
  full_name: "QA Manager",
  role: "admin",
  company_id: 10,
  is_active: true,
};

async function authenticate(page: Page) {
  await page.addInitScript((user) => {
    localStorage.setItem("samgov-auth-user", JSON.stringify(user));
  }, manager);
  await page.route("**/api/backend/notifications/agent**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ notifications: [], unread_count: 0 }),
  }));
}

function monitorRuntime(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test("@critical catalog distinguishes active claims from submitted work", async ({ page }) => {
  const runtimeErrors = monitorRuntime(page);
  await authenticate(page);
  await page.route("**/api/sam-gov", (route) => route.fulfill({ json: catalog }));
  await page.route("**/api/backend/opportunities/availability", (route) => route.fulfill({ json: availability }));

  await page.goto("/sam-gov");
  await expect(page.getByText("Taken by Agent One")).toBeVisible();
  await expect(page.getByText("Submitted by Agent Two")).toBeVisible();
  await expect(page.getByText(/Taken by Agent Two/)).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((violation) => ["critical", "serious"].includes(violation.impact || ""))).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test("manager sees ownership reason and successful action clears controls", async ({ page }) => {
  await authenticate(page);
  const opportunity = {
    id: 7,
    source: "SAM.GOV",
    external_notice_id: "NOTICE-ACTIVE",
    solicitation_number: "SOL-ACTIVE",
    title: "Claimed equipment opportunity",
    expected_bid_value: 50000,
    state: "assigned",
    assignee: { id: 2, full_name: "Agent One" },
    assignment_history: [{
      id: 71,
      agent: { id: 2, full_name: "Agent One" },
      actor: { id: 1, full_name: "QA Manager" },
      action: "assigned",
      reason: "Relevant medical sourcing experience",
      limit_override: false,
      started_at: "2026-10-02T12:00:00Z",
    }],
  };
  await page.route("**/api/backend/opportunities/company", (route) => route.fulfill({ json: { opportunities: [opportunity] } }));
  await page.route("**/api/backend/opportunities/duplicates", (route) => route.fulfill({ json: { incidents: [] } }));
  await page.route("**/api/backend/auth/team", (route) => route.fulfill({ json: { members: [
    { id: 2, full_name: "Agent One", role: "agent", is_active: true },
    { id: 3, full_name: "Agent Two", role: "agent", is_active: true },
  ] } }));
  await page.route("**/api/backend/opportunities/7/reassign", (route) => route.fulfill({ json: { opportunity } }));

  await page.goto("/work-management");
  await page.getByText("Assignment history (1)").click();
  await expect(page.getByText(/Relevant medical sourcing experience/)).toBeVisible();
  await page.getByLabel("Agent").selectOption("3");
  await page.getByLabel("Reason for next action").fill("Coverage handoff");
  await page.getByRole("button", { name: "Reassign" }).click();
  await expect(page.getByLabel("Agent")).toHaveValue("");
  await expect(page.getByLabel("Reason for next action")).toHaveValue("");
});

test("catalog layout does not overflow common viewport widths", async ({ page }) => {
  await authenticate(page);
  await page.route("**/api/sam-gov", (route) => route.fulfill({ json: catalog }));
  await page.route("**/api/backend/opportunities/availability", (route) => route.fulfill({ json: availability }));
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/sam-gov");
    await expect(page.getByText("Submitted by Agent Two")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow, `unexpected document overflow at ${width}px`).toBe(false);
  }
});
