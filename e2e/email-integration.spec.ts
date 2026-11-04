import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

/**
 * KAN-74 browser checks (Chromium) with a stateful stubbed backend: connect Gmail,
 * compose from a bid, pre-send spam-risk check, held mail and admin release.
 */

const manager = { id: 1, email: "manager@example.test", full_name: "QA Manager", role: "admin", company_id: 10, is_active: true };
const agentUser = { id: 2, email: "agent@example.test", full_name: "Agent One", role: "agent", company_id: 10, is_active: true };

const bid = {
  id: 9, bid_id: "AMF9", title: "Hospital beds", solicitation_number: "SOL-9", internal_status: "Finding Supplier",
  current_owner_user_id: 2, expected_submitted_price: 60000, supplier_cost: null, submitted_price: null, gross_profit: null,
  markup_percent: null, negative_profit_warning: false, award_outcome: "unknown", status_history: [], ownership_history: [],
};

const DISCLAIMER = "This is a risk estimate based on common spam signals. It is not a guarantee of whether Gmail will deliver the message or place it in spam.";

type Msg = Record<string, unknown> & { id: number; send_status: string | null };

class EmailBackend {
  account: Record<string, unknown> = { status: "connected", connected: true, configured: true, gmail_address: "agent.one@gmail.com", last_synced_at: null };
  threads: Array<Record<string, unknown> & { id: number; messages: Msg[] }> = [];
  outbox: Msg[] = [];
  sends: Array<Record<string, unknown>> = [];
  nextId = 100;

  check(body: { subject?: string; body_text?: string }) {
    const text = `${body.subject} ${body.body_text}`;
    const findings = [];
    if (/bit\.ly/.test(text)) findings.push({ rule: "links_shortener", field: "links", weight: 35, severity: "high", message: "Uses a link shortener", suggestion: "Use the full destination URL instead of a shortened link.", matches: [] });
    if (/FREE/.test(text)) findings.push({ rule: "subject_all_caps", field: "subject", weight: 40, severity: "high", message: "Subject is mostly capital letters", suggestion: "Use normal sentence case in the subject.", matches: [] });
    const score = findings.reduce((s, f) => s + f.weight, 0);
    const level = score >= 60 ? "high" : score >= 30 ? "medium" : "low";
    return { score, level, findings, warn_threshold: 30, hold_threshold: 60, will_hold: level === "high", fingerprint: "x", disclaimer: DISCLAIMER };
  }

  message(body: Record<string, unknown>, status: string): Msg {
    return {
      id: this.nextId++, thread_id: null, bid_id: 9, reply_to_thread_id: null, direction: "outbound", from: this.account.gmail_address,
      to: body.to, cc: body.cc || [], subject: body.subject, body_text: body.body_text, body_html: null, snippet: "",
      sent_at: "2026-10-31T15:00:00Z", created_at: "2026-10-31T15:00:00Z", sent_by_user_id: 2, sent_by_name: "Agent One",
      send_status: status, send_error: null, spam_check: this.check(body), is_bounce_notice: false, mailbox: this.account.gmail_address,
      bid: { id: 9, solicitation_number: "SOL-9", title: "Hospital beds" },
    };
  }

  async handle(route: Route) {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace("/api/backend/", "");
    const method = request.method();
    const body = method === "GET" ? {} : (request.postDataJSON() || {});
    if (path === "gmail/status") return route.fulfill({ json: { account: this.account } });
    if (path === "gmail/connect") return route.fulfill({ json: { auth_url: "https://accounts.google.com/o/oauth2/auth?client_id=x&state=signed-state" } });
    if (path === "gmail/sync") return route.fulfill({ json: { summary: { mode: "full", checked: 3, stored: 1, skipped_duplicate: 0, not_bid_related: 2, unlinked: 0, bounces: 0 }, account: this.account } });
    if (path === "emails/unlinked") return route.fulfill({ json: { threads: [], bids: {} } });
    if (path === "emails/bids/9/threads") {
      return route.fulfill({ json: {
        bid: { id: 9, solicitation_number: "SOL-9", title: "Hospital beds", contact_email: "co@agency.gov", co_name: "CO" },
        threads: this.threads, outbox: this.outbox, account: this.account, current_user_id: 2,
      } });
    }
    if (path === "emails/spam-check") return route.fulfill({ json: { spam_check: this.check(body) } });
    if (path === "emails/send") {
      this.sends.push(body);
      const check = this.check(body);
      if (check.will_hold) {
        const held = this.message(body, "held");
        this.outbox.push(held);
        return route.fulfill({ status: 202, json: { held: true, message: held, spam_check: check } });
      }
      if (check.level !== "low" && !body.acknowledge_warnings) {
        return route.fulfill({ status: 422, json: { error: "Review the spam-risk warnings and confirm before sending.", requires_acknowledgement: true, spam_check: check } });
      }
      const sent = this.message(body, "sent");
      this.threads.push({
        id: 50 + this.threads.length, bid_id: 9, candidate_bid_ids: [], subject: body.subject, counterpart_emails: body.to,
        link_source: "app_initiated", manual_override: false, last_message_at: sent.sent_at, mailbox: this.account.gmail_address,
        mailbox_owner_name: "Agent One", mailbox_owner_user_id: 2, messages: [{ ...sent, thread_id: 50 }],
      });
      return route.fulfill({ json: { message: sent, spam_check: check, sent: true } });
    }
    if (path === "emails/held") return route.fulfill({ json: { messages: this.outbox.filter((m) => m.send_status === "held") } });
    const release = path.match(/^emails\/(\d+)\/release$/);
    if (release) {
      const msg = this.outbox.find((m) => m.id === Number(release[1]))!;
      msg.send_status = "sent";
      this.outbox = this.outbox.filter((m) => m !== msg);
      return route.fulfill({ json: { message: { ...msg, reviewed_by_name: "QA Manager" }, sent: true } });
    }
    if (path === "emails/deliverability-settings") {
      return route.fulfill({ json: {
        settings: { rules: { links_shortener: { enabled: true, weight: 35 } }, warn_threshold: 30, hold_threshold: 60, hold_high_risk: true, trigger_words: ["free"] },
        rules: [{ key: "links_shortener", field: "links", default_weight: 25, label: "Uses a link shortener" }],
        default_trigger_words: ["free"], disclaimer: DISCLAIMER,
      } });
    }
    return route.fulfill({ status: 404, json: { error: `unstubbed ${method} ${path}` } });
  }
}

async function authenticate(page: Page, user: Record<string, unknown>, backend: EmailBackend) {
  await page.addInitScript((stored) => {
    localStorage.setItem("samgov-auth-user", JSON.stringify(stored));
  }, user);
  await page.route("**/api/backend/notifications/agent**", (route) => route.fulfill({ json: { notifications: [], unread_count: 0 } }));
  await page.route("**/api/backend/pipeline/bids/9", (route) => route.fulfill({ json: { bid } }));
  await page.route(/\/api\/backend\/(gmail|emails)\//, (route) => backend.handle(route));
}

function monitorRuntime(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
}

async function expectAccessible(page: Page, include: string) {
  const result = await new AxeBuilder({ page }).include(include).analyze();
  const serious = result.violations
    .filter((v) => ["critical", "serious"].includes(v.impact || ""))
    .map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target.join(" ")).slice(0, 5) }));
  expect(serious).toEqual([]);
}

test("an agent sends a vendor email from a bid after reviewing spam-risk warnings", async ({ page }) => {
  const errors = monitorRuntime(page);
  const backend = new EmailBackend();
  await authenticate(page, agentUser, backend);

  await page.goto("/bids/9");
  await expect(page.getByRole("heading", { name: "Hospital beds" })).toBeVisible();
  await expect(page.getByText("Your mailbox:")).toContainText("agent.one@gmail.com");
  await expect(page.getByText("No emails for this bid yet.")).toBeVisible();

  await page.getByRole("button", { name: "New email" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Sending as agent.one@gmail.com");
  await expect(dialog.getByLabel("To")).toHaveValue("co@agency.gov");
  await dialog.getByLabel("To").fill("sales@acme.com");
  await dialog.getByLabel("Subject").fill("SOL-9: price for 40 hospital beds");
  await dialog.getByRole("textbox", { name: "Message" }).fill("Hello, please quote 40 beds. Specs: https://bit.ly/beds");

  await dialog.getByRole("button", { name: "Send" }).click();
  const risk = dialog.getByRole("region", { name: "Spam-risk check" });
  await expect(risk).toContainText("Some spam-risk warnings");
  await expect(risk).toContainText("Use the full destination URL");
  await expect(risk).toContainText("not a guarantee");
  await expect(dialog.getByRole("button", { name: "Send" })).toBeDisabled();
  await expectAccessible(page, "[role=dialog]");

  // Fix the link, re-check, and the warning goes away.
  await dialog.getByRole("textbox", { name: "Message" }).fill("Hello, please quote 40 beds. Specs: https://acme.com/beds");
  await expect(risk).toContainText("The draft changed after this check");
  await dialog.getByRole("button", { name: "Re-check spam risk" }).click();
  await expect(risk).toContainText("Low spam risk");
  await dialog.getByRole("button", { name: "Send" }).click();

  await expect(page.getByRole("status")).toContainText("Email sent");
  expect(backend.sends).toHaveLength(1);
  expect(backend.sends[0]).toMatchObject({ bid_id: 9, to: ["sales@acme.com"], body_text: "Hello, please quote 40 beds. Specs: https://acme.com/beds" });
  await page.getByRole("button", { name: /SOL-9: price for 40 hospital beds/ }).click();
  await expect(page.getByText("Sent (accepted by Gmail)").first()).toBeVisible();
  await expect(page.getByText("Sent from Contract Finder")).toBeVisible();
  expect(errors).toEqual([]);
});

test("high-risk mail is held and an admin releases it from Settings", async ({ page }) => {
  const errors = monitorRuntime(page);
  const backend = new EmailBackend();
  await authenticate(page, agentUser, backend);
  await page.goto("/bids/9");
  await page.getByRole("button", { name: "New email" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Subject").fill("FREE beds");
  await dialog.getByRole("textbox", { name: "Message" }).fill("See https://bit.ly/x");
  await dialog.getByRole("button", { name: "Send" }).click();
  await expect(dialog).toContainText("will be held until an admin reviews it");
  await dialog.getByRole("button", { name: "Submit for review" }).click();
  await expect(page.getByRole("status")).toContainText("held for admin review");
  await expect(page.getByRole("region", { name: "Unsent emails" })).toContainText("Held for review");

  const adminPage = await page.context().newPage();
  await authenticate(adminPage, manager, backend);
  await adminPage.goto("/settings");
  const held = adminPage.getByText("Emails held for review").locator("..").locator("..");
  await expect(held).toContainText("FREE beds");
  await expect(held).toContainText("agent.one@gmail.com");
  await held.getByRole("button", { name: "Approve and send" }).click();
  await expect(adminPage.getByText("Sent from agent.one@gmail.com.")).toBeVisible();
  await expect(adminPage.getByText("No emails are waiting for review.")).toBeVisible();
  await expect(adminPage.getByLabel("Hold threshold")).toHaveValue("60");
  expect(errors).toEqual([]);
});

test("expired Gmail authorization is surfaced and reconnect starts Google sign-in", async ({ page }) => {
  const backend = new EmailBackend();
  backend.account = { status: "expired", connected: false, configured: true, gmail_address: "agent.one@gmail.com", needs_reconnect: true, last_error: "Gmail authorization expired or was revoked. Reconnect Gmail in Settings." };
  await authenticate(page, agentUser, backend);
  await page.route("https://accounts.google.com/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Google sign-in stub</h1>" }));

  await page.goto("/bids/9");
  await expect(page.getByRole("alert").filter({ hasText: "Gmail authorization expired" })).toBeVisible();
  await page.getByRole("link", { name: "Reconnect Gmail" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByText(/authorization expired for agent.one@gmail.com/)).toBeVisible();
  await expectAccessible(page, "main");
  await page.getByRole("button", { name: "Reconnect Gmail" }).click();
  await expect(page).toHaveURL(/accounts\.google\.com\/o\/oauth2\/auth\?.*state=signed-state/);
});

test("Settings shows the Google callback result", async ({ page }) => {
  const backend = new EmailBackend();
  await authenticate(page, agentUser, backend);
  await page.goto("/settings?gmail=connected");
  await expect(page.getByRole("status")).toContainText("Gmail connected");
  await expect(page.getByText(/Connected as/)).toContainText("agent.one@gmail.com");
  await page.getByRole("button", { name: /Sync now/ }).click();
  await expect(page.getByRole("status")).toContainText("1 new bid email saved, 2 ignored as not bid-related");
});
