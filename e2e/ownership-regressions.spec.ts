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

async function authenticate(page: Page, currentUser = manager) {
  await page.addInitScript((user) => {
    localStorage.setItem("samgov-auth-user", JSON.stringify(user));
  }, currentUser);
  await page.route("**/api/backend/notifications/agent**", (route) => route.fulfill({
    contentType: "application/json",
    body: JSON.stringify({ notifications: [], unread_count: 0 }),
  }));
  await page.route("**/api/backend/health", (route) => route.fulfill({ json: { status: "ok" } }));
  await page.route("**/api/backend/opportunities/stale", (route) => route.fulfill({ json: { bids: [] } }));
}

test("an assigned agent can find attachments and start the original solicitation analysis", async ({ page }) => {
  test.setTimeout(75_000);
  const owner = { ...manager, id: 2, role: "agent" };
  await authenticate(page, owner);
  const noticeId = "NOTICE-ANALYSIS-TEST";
  const url = "https://sam.gov/example/statement-of-work.pdf";
  await page.route(`**/api/sam-gov/opportunity/${noticeId}`, (route) => route.fulfill({ json: {
    id: noticeId, solicitationNumber: "QA-SOL-1", title: "QA solicitation", type: "Solicitation",
    description: "Test procurement", resourceLinks: [url, { name: "Statement of work", link: url }],
  } }));
  await page.route("**/api/backend/opportunities/availability", (route) => route.fulfill({ json: {
    opportunities: [{ available: false, availability_state: "claimed", assignee: owner, bid_id: 96 }],
  } }));
  await page.route("**/api/backend/analyze-solicitations/start", (route) =>
    route.fulfill({ status: 503, json: { error: "Test stops before any provider call" } }));

  await page.goto(`/sam-gov/${noticeId}`);
  const attachments = page.getByRole("region", { name: "Attachments" });
  await expect(attachments.getByRole("link")).toHaveCount(1);
  await expect(attachments.getByRole("link", { name: /Statement of work/ })).toHaveAttribute("href", url);
  await expect(page.getByRole("link", { name: "Open bid workspace" })).toHaveAttribute("href", "/bids/96");
  const analysisRequest = page.waitForRequest((request) => request.url().endsWith("/api/backend/analyze-solicitations/start"));
  await page.getByRole("link", { name: "Start bidding process" }).click();
  expect((await analysisRequest).postDataJSON()).toMatchObject({ urls: [url], opportunity_id: noticeId });
  await expect(page).toHaveURL(new RegExp(`/sam-gov/${noticeId}/bid-summary$`));
});

test("a description-only solicitation remains readable and refreshes on revisit", async ({ page }) => {
  const noticeId = "NOTICE-DESCRIPTION-ONLY";
  await authenticate(page, { ...manager, id: 2, role: "agent" });
  let description = "Initial procurement description";
  await page.route(`**/api/sam-gov/opportunity/${noticeId}`, (route) => route.fulfill({ json: {
    id: noticeId, title: "QA description-only solicitation", description, resourceLinks: [],
  } }));

  await page.goto(`/sam-gov/${noticeId}/bid-summary`);
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  description = "Updated procurement description";
  await page.reload();
  await expect(page.getByText(description, { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Quote Negotiation" })).toHaveAttribute(
    "href", `/sam-gov/${noticeId}/quotenegotiation`,
  );
});

function monitorRuntime(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  return errors;
}

test("@critical catalog distinguishes active claims from submitted work", async ({ page }) => {
  test.setTimeout(60_000);
  const runtimeErrors = monitorRuntime(page);
  await authenticate(page);
  await page.route("**/api/sam-gov", (route) => route.fulfill({ json: catalog }));
  await page.route("**/api/backend/opportunities/availability", (route) => route.fulfill({ json: availability }));

  await page.goto("/sam-gov");
  await expect(page).toHaveURL(/\/opportunities\?view=all$/, { timeout: 30_000 });
  await expect(page.getByText("Taken by Agent One")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Submitted by Agent Two")).toBeVisible();
  await expect(page.getByText(/Taken by Agent Two/)).toHaveCount(0);

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations.filter((violation) => ["critical", "serious"].includes(violation.impact || ""))).toEqual([]);
  expect(runtimeErrors).toEqual([]);
});

test("legacy catalog opens the revamp with the full AI suggestions workflow", async ({ page }) => {
  await authenticate(page);
  await page.route("**/api/sam-gov", (route) => route.fulfill({ json: catalog }));
  await page.route("**/api/backend/opportunities/availability", (route) => route.fulfill({ json: availability }));
  const notice = catalog[0];
  let requests = 0;
  await page.route("**/api/sam-gov/ai-suggestions", (route) => {
    requests += 1;
    if (requests === 1) return route.fulfill({ status: 503, json: { error: "Provider unavailable" } });
    if (requests === 2) return route.fulfill({ status: 202, json: { job_id: "qa-job", status: "queued" } });
    return route.fulfill({ json: { suggestions: [], total_analyzed: 2, threshold: 60 } });
  });
  await page.route(/\/api\/sam-gov\/ai-suggestions\?job=/, (route) => {
    return route.fulfill({
      json: {
        status: "completed",
        suggestions: [{ ...notice, fitScore: 94, fitReason: "Matches the requested equipment." }],
        total_analyzed: 2,
        threshold: 60,
      },
    });
  });

  await page.goto("/sam-gov");
  await expect(page).toHaveURL(/\/opportunities\?view=all$/);
  await expect(page.getByRole("button", { name: "All SAM.gov" })).toHaveAttribute("aria-current", "page");
  await page.getByRole("button", { name: /^AI suggestions/ }).click();
  const results = page.getByRole("region", { name: "Results" });
  await expect(results.getByRole("alert")).toHaveText("Provider unavailable");
  await results.getByRole("button", { name: "Retry AI suggestions" }).click();
  await expect(results.getByText("94% AI fit")).toBeVisible();
  await expect(results.getByText("1 match from 2 sent for screening.")).toBeVisible();
  await results.getByText("Why this matches", { exact: true }).click();
  await expect(results.getByText("Matches the requested equipment.")).toBeVisible();
  await expect(results.getByRole("link", { name: notice.title })).toHaveAttribute("href", `/sam-gov/${notice.id}`);
  await results.getByRole("button", { name: "Refresh suggestions" }).click();
  await expect(results.getByText("No recommendations met the 60% fit threshold.")).toBeVisible();
  expect(requests).toBe(3);
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
