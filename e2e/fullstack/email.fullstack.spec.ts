import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Page } from "@playwright/test";

/**
 * KAN-74 on the real stack: real Next.js proxy + real Flask app + real database, with only
 * Google's Gmail API faked. Start the backend first:
 *   cd Sam.gov-backend/backendGOVAI && venv/Scripts/python.exe tests/qa_fake_gmail_server.py 9000
 * then: set FULLSTACK_EMAIL=1&& npm run test:e2e:chromium -- e2e/fullstack/email.fullstack.spec.ts
 * The server reseeds on every start; run this file once per server start.
 */
test.skip(!process.env.FULLSTACK_EMAIL, "set FULLSTACK_EMAIL=1 with tests/qa_fake_gmail_server.py running");
test.describe.configure({ mode: "serial", timeout: 180_000 });

const BACKEND = "http://localhost:9000";
const BID_A = 1;
type Watched = { page: Page; problems: string[] };

async function login(browser: Browser, email: string): Promise<Watched> {
  const context = await browser.newContext();
  const page = await context.newPage();
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(`pageerror ${page.url()}: ${error.message}`));
  page.on("response", (response) => {
    if (response.status() >= 500) problems.push(`HTTP ${response.status()} ${response.url()}`);
  });
  await page.goto("/login");
  await page.waitForLoadState("networkidle").catch(() => undefined);
  await expect(async () => {
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("password123");
    await expect(page.getByLabel("Email")).toHaveValue(email, { timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page).toHaveURL(/\/$/, { timeout: 60_000 });
  await expect(page.getByRole("heading").first()).toBeVisible({ timeout: 60_000 });
  await page.waitForLoadState("networkidle").catch(() => undefined);
  return { page, problems };
}

function emailsCard(page: Page) {
  return page.locator("div.rounded-lg, div[class*='card']").filter({ has: page.getByRole("heading", { name: "Emails", exact: true }) }).first();
}

test("agent: sync stores only bid mail visible to them", async ({ browser }) => {
  const { page, problems } = await login(browser, "agent@qa.test");
  await page.goto("/settings");
  await expect(page.getByText(/Connected as/)).toContainText("agent.qa@gmail.com", { timeout: 60_000 });
  await page.getByRole("button", { name: /Sync now/ }).click();
  // Mailbox: a quote for the agent's bid, a newsletter, mail about agent two's bid, and a BedCo email
  // with no solicitation number (BedCo is a KAN-80 vendor on the agent's bid).
  await expect(page.getByRole("status")).toContainText("Checked 4 messages: 2 new bid emails saved, 2 ignored as not bid-related");
  await page.getByRole("button", { name: /Sync now/ }).click();
  await expect(page.getByRole("status")).toContainText("0 new bid emails saved");

  await page.goto(`/bids/${BID_A}`);
  await expect(page.getByRole("heading", { name: "QA hospital beds" })).toBeVisible({ timeout: 60_000 });
  const thread = page.getByRole("button", { name: /Quote for W912-26-Q-0101/ });
  await expect(thread).toBeVisible();
  await expect(thread).toContainText("Matched by solicitation number");
  await thread.click();
  await expect(page.getByText("our price for 40 beds is $38,000 delivered")).toBeVisible();
  await expect(page.getByText(/Mailbox: agent.qa@gmail.com/)).toBeVisible();
  const vendorThread = page.getByRole("button", { name: /^Lead time on the beds/ });
  await expect(vendorThread).toContainText("Vendor: BedCo");
  await expect(vendorThread).toContainText("Matched by contact");
  expect(problems).toEqual([]);
});

test("agent: compose, spam check, send, vendor reply syncs into the thread, reply threads", async ({ browser }) => {
  const { page, problems } = await login(browser, "agent@qa.test");
  await page.goto(`/bids/${BID_A}`);
  await page.getByRole("button", { name: "New email" }).click({ timeout: 60_000 });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Sending as agent.qa@gmail.com");
  await expect(dialog.getByLabel("To")).toHaveValue("co@agency.example.gov");
  await dialog.getByLabel("To").fill("sales@beds-vendor.example");
  await dialog.getByLabel("Subject").fill("price request — 40 hospital beds (Señor Ortíz)");
  const body = "Hello,\n\nPlease quote 40 hospital beds delivered to Fort Liberty by March 3, with lead time and freight.\n\nThank you,\nQA Agent";
  await dialog.getByRole("textbox", { name: "Message" }).fill(body);
  await dialog.getByRole("button", { name: "Check spam risk" }).click();
  await expect(dialog.getByRole("region", { name: "Spam-risk check" })).toContainText("Low spam risk");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status")).toContainText("Email sent");
  const sentThread = page.getByRole("button", { name: /^price request — 40 hospital beds \(Señor Ortíz\)/ });
  await expect(sentThread).toContainText("Sent from Contract Finder");

  // Vendor answers in Gmail; the next sync puts it in the same conversation.
  const reply = await page.request.post(`${BACKEND}/__qa/vendor-reply`, { data: { body: "We can do $36,500 including freight." } });
  expect(reply.ok()).toBeTruthy();
  await page.getByRole("button", { name: /Sync now/ }).click();
  await expect(page.getByRole("status")).toContainText("Sync complete: 1 new bid email");
  await sentThread.click();
  await expect(sentThread).toContainText("2 messages");
  await expect(page.getByText("We can do $36,500 including freight.")).toBeVisible();

  await page.getByRole("button", { name: "Reply" }).click();
  const replyDialog = page.getByRole("dialog");
  await expect(replyDialog.getByLabel("To")).toHaveValue("sales@beds-vendor.example");
  await expect(replyDialog.getByLabel("Subject")).toHaveValue(/^Re: /);
  await replyDialog.getByRole("textbox", { name: "Message" }).fill("Thanks. Please hold that price for 30 days while we finalize our submission.\n\nQA Agent");
  await replyDialog.getByRole("button", { name: "Send" }).click();
  await expect(page.getByRole("status")).toContainText("Email sent");
  await expect(sentThread).toContainText("3 messages");
  expect(problems).toEqual([]);
});

test("agent: high-risk mail is held; another agent cannot see this bid's email", async ({ browser }) => {
  const { page, problems } = await login(browser, "agent@qa.test");
  await page.goto(`/bids/${BID_A}`);
  await page.getByRole("button", { name: "New email" }).click({ timeout: 60_000 });
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("To").fill("promo@beds-vendor.example");
  await dialog.getByLabel("Subject").fill("FREE GIFT!!! ACT NOW");
  await dialog.getByRole("textbox", { name: "Message" }).fill("CLICK HERE https://bit.ly/x winner!!!!");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog).toContainText("High spam risk");
  await expect(dialog).toContainText("will be held until an admin reviews it");
  await dialog.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("status")).toContainText("held for admin review");
  await expect(page.getByRole("region", { name: "Unsent emails" })).toContainText("FREE GIFT!!! ACT NOW");

  const other = await login(browser, "agent2@qa.test");
  const denied = await other.page.request.get(`/api/backend/emails/bids/${BID_A}/threads`);
  expect(denied.status()).toBe(403);
  const unlinked = await (await other.page.request.get("/api/backend/emails/unlinked")).json();
  expect(unlinked.threads).toEqual([]);
  const notConnected = await other.page.request.post("/api/backend/emails/send", {
    data: { bid_id: 2, to: ["a@b.example"], subject: "x", body_text: "hello there" },
  });
  expect(notConnected.status()).toBe(409);
  expect(problems).toEqual([]);
  expect(other.problems).toEqual([]);
});

test("admin: releases held mail, edits rules, and Connect starts real Google sign-in", async ({ browser }) => {
  const { page, problems } = await login(browser, "admin@qa.test");
  await page.goto("/settings");
  const held = page.getByText("Emails held for review").locator("..").locator("..");
  await expect(held).toContainText("FREE GIFT!!! ACT NOW", { timeout: 60_000 });
  await expect(held).toContainText("agent.qa@gmail.com");
  await held.getByRole("button", { name: "Approve and send" }).click();
  await expect(page.getByText("Sent from agent.qa@gmail.com.")).toBeVisible();
  await expect(page.getByText("No emails are waiting for review.")).toBeVisible();

  await page.getByLabel("Warning threshold").fill("25");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Spam-check settings saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Warning threshold")).toHaveValue("25", { timeout: 60_000 });

  await page.route("https://accounts.google.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Google sign-in stub</h1>" }));
  await page.getByRole("button", { name: "Connect Gmail" }).click();
  await expect(page).toHaveURL(/accounts\.google\.com/);
  const url = new URL(page.url());
  expect(url.searchParams.get("client_id")).toBe("qa-client.apps.googleusercontent.com");
  expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:3100/api/backend/gmail/callback");
  expect(url.searchParams.get("access_type")).toBe("offline");
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/gmail.send");
  expect(url.searchParams.get("state")).toBeTruthy();

  // A forged callback (no valid state) lands back on Settings with an error, not a connection.
  await page.goto("/api/backend/gmail/callback?state=forged&code=x");
  await expect(page).toHaveURL(/\/settings\?gmail=error/);
  await expect(page.getByText("The connection link expired. Try connecting again.")).toBeVisible({ timeout: 60_000 });
  expect(problems).toEqual([]);
});

test("agent: email a vendor from its row; 'handling manually' pauses and resumes the automation; status updates", async ({ browser }) => {
  const { page, problems } = await login(browser, "agent@qa.test");
  await page.goto(`/bids/${BID_A}`);
  await page.getByRole("button", { name: "Email BedCo" }).click({ timeout: 60_000 });
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Email BedCo");
  await expect(dialog).toContainText("Sending as agent.qa@gmail.com");
  await expect(dialog.getByLabel("To")).toHaveValue("quotes@bedco.example");
  await dialog.getByRole("button", { name: "Cancel" }).click();

  const automation = async () => (await (await page.request.post(`${BACKEND}/__qa/automation`)).json()).counter_offer_sent;
  expect(await automation()).toBe(true);

  const thread = page.getByRole("button", { name: /^Lead time on the beds/ });
  await thread.click();
  await expect(page.getByText("Ticking this pauses the automated negotiation with BedCo until you untick it.")).toBeVisible();
  await page.getByLabel("I am handling this conversation manually").check();
  await expect(page.getByText(/Automated negotiation with BedCo is paused while this is ticked/)).toBeVisible();
  await expect(thread).toContainText("automation paused");
  expect(await automation()).toBe(false);
  // Accessibility of the Emails card (vendor chips, pause notice, checkbox) on the real page.
  const axe = await new AxeBuilder({ page }).include("#bid-emails").analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);

  await page.getByLabel("I am handling this conversation manually").uncheck();
  await expect(page.getByText("Ticking this pauses the automated negotiation with BedCo until you untick it.")).toBeVisible();
  await expect(thread).not.toContainText("automation paused"); // saved state reloaded from the server
  expect(await automation()).toBe(true);
  expect(problems).toEqual([]);

  // Restored route (dropped in the KAN-75 push): an admin's "Update status" works again.
  const admin = await login(browser, "admin@qa.test");
  await admin.page.goto(`/bids/${BID_A}`);
  await admin.page.getByLabel("New status").selectOption("Waiting Approval", { timeout: 60_000 });
  await admin.page.getByRole("button", { name: "Update status" }).click();
  await expect(admin.page.getByText("Status updated.")).toBeVisible();
  await expect(admin.page.getByText("Finding Supplier → Waiting Approval")).toBeVisible();
  expect(admin.problems).toEqual([]);
});

test("agent: revoked Google access is surfaced with Reconnect", async ({ browser }) => {
  const { page, problems } = await login(browser, "agent@qa.test");
  const revoke = await page.request.post(`${BACKEND}/__qa/revoke`);
  expect(revoke.ok()).toBeTruthy();
  await page.goto("/settings");
  await page.getByRole("button", { name: /Sync now/ }).click({ timeout: 60_000 });
  await expect(page.getByText(/authorization expired for agent.qa@gmail.com/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Reconnect Gmail" })).toBeVisible();
  await page.goto(`/bids/${BID_A}`);
  await expect(page.getByRole("alert").filter({ hasText: "Gmail authorization expired" })).toBeVisible({ timeout: 60_000 });
  // Synced conversations stay visible after the grant dies.
  await expect(page.getByRole("button", { name: /Quote for W912-26-Q-0101/ })).toBeVisible();
  expect(problems).toEqual([]);
});
