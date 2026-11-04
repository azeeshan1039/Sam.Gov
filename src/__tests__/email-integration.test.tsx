/** KAN-74: Gmail connection, bid emails, compose with spam-risk check, admin review. */
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { BidEmailsPanel } from "@/components/emails/BidEmailsPanel";
import { GmailConnectionCard } from "@/components/emails/GmailConnectionCard";
import { SpamRiskPanel } from "@/components/emails/SpamRiskPanel";
import SettingsPage from "@/app/settings/page";
import BidDetailPage from "@/app/bids/[id]/page";
import { getStoredUser, type AuthUser } from "@/lib/auth";
import type { SpamCheckResult } from "@/lib/emails";

jest.mock("next/navigation", () => ({
  usePathname: () => "/settings",
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "9" }),
}));

jest.mock("@/lib/auth", () => {
  const actual = jest.requireActual("@/lib/auth");
  return { ...actual, getStoredUser: jest.fn() };
});

const mockedGetStoredUser = getStoredUser as jest.MockedFunction<typeof getStoredUser>;
const agent = { id: 2, email: "agent@example.com", full_name: "Agent One", role: "agent", company_id: 10, is_active: true } as AuthUser;
const admin = { ...agent, id: 1, role: "admin", full_name: "Manager" } as AuthUser;

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[] = [];

function response(data: unknown, status = 200): Promise<Response> {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => data } as Response);
}

function check(level: "low" | "medium" | "high", extra: Partial<SpamCheckResult> = {}): SpamCheckResult {
  return {
    score: level === "low" ? 0 : level === "medium" ? 40 : 90,
    level,
    findings: level === "low" ? [] : [{
      rule: "links_shortener", field: "links", weight: 25, severity: "high",
      message: "Uses a link shortener: https://bit.ly/x", suggestion: "Use the full destination URL instead of a shortened link.", matches: [],
    }],
    warn_threshold: 30, hold_threshold: 60, will_hold: level === "high", fingerprint: "f",
    disclaimer: "This is a risk estimate based on common spam signals. It is not a guarantee of whether Gmail will deliver the message or place it in spam.",
    ...extra,
  };
}

const connected = { status: "connected", connected: true, gmail_address: "agent@gmail.com", last_synced_at: null };

function threadsPayload(overrides: Record<string, unknown> = {}) {
  return {
    bid: { id: 9, solicitation_number: "SOL-9", title: "Bid nine", contact_email: "co@agency.gov", co_name: "CO" },
    threads: [{
      id: 5, bid_id: 9, candidate_bid_ids: [], subject: "RFQ SOL-9", counterpart_emails: ["sales@acme.com"],
      link_source: "app_initiated", manual_override: false, last_message_at: "2026-10-30T15:00:00Z",
      mailbox: "agent@gmail.com", mailbox_owner_name: "Agent One", mailbox_owner_user_id: 2,
      messages: [
        { id: 1, thread_id: 5, bid_id: 9, direction: "outbound", from: "agent@gmail.com", to: ["sales@acme.com"], cc: [],
          subject: "RFQ SOL-9", body_text: "Please quote 40 units.", body_html: null, snippet: "", sent_at: "2026-10-30T14:00:00Z",
          send_status: "sent", send_error: null, sent_by_user_id: 2, is_bounce_notice: false, spam_check: null },
        { id: 2, thread_id: 5, bid_id: 9, direction: "inbound", from: "sales@acme.com", to: ["agent@gmail.com"], cc: [],
          subject: "Re: RFQ SOL-9", body_text: null, body_html: "<p>We can do <b>$950</b>.</p><script>alert(1)</script>", snippet: "",
          sent_at: "2026-10-30T15:00:00Z", send_status: null, send_error: null, sent_by_user_id: null, is_bounce_notice: false, spam_check: null },
      ],
    }],
    outbox: [],
    account: connected,
    current_user_id: 2,
    ...overrides,
  };
}

function mockFetch(handler: (call: Call) => Promise<Response> | undefined) {
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const call = {
      url: typeof input === "string" ? input : input.toString(),
      method: init?.method || "GET",
      body: init?.body ? JSON.parse(String(init.body)) : null,
    };
    calls.push(call);
    const result = handler(call);
    if (!result) throw new Error(`Unexpected request: ${call.method} ${call.url}`);
    return result;
  }) as jest.Mock;
}

beforeEach(() => {
  calls = [];
  mockedGetStoredUser.mockReset();
});

describe("KAN-76/77 bid emails panel", () => {
  test("shows conversations with sanitized HTML, link source and sender mailbox", async () => {
    mockFetch(({ url }) => {
      if (url.includes("emails/bids/9/threads")) return response(threadsPayload());
      if (url.includes("emails/unlinked")) return response({ threads: [] });
      return undefined;
    });
    const user = userEvent.setup();
    const { container } = render(<BidEmailsPanel bidId={9} />);
    await screen.findByText("RFQ SOL-9");
    expect(screen.getByText(/Your mailbox:/)).toHaveTextContent("agent@gmail.com");
    expect(screen.getByText("Sent from Contract Finder")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /RFQ SOL-9/ }));
    expect(screen.getByText("Please quote 40 units.")).toBeInTheDocument();
    expect(screen.getByText("$950")).toBeInTheDocument();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getAllByText("Sent (accepted by Gmail)").length).toBeGreaterThan(0);
    expect(screen.getByText(/Mailbox: agent@gmail.com/)).toBeInTheDocument();
  });

  test("a bounce stays visible on the collapsed conversation after the bounce notice arrives", async () => {
    const base = threadsPayload().threads[0];
    const bounced = { ...base.messages[0], send_status: "bounced", send_error: "Delivery failed for nobody@bad.example." };
    const notice = { ...base.messages[1], id: 3, from: "mailer-daemon@googlemail.com", body_html: null,
      body_text: "Address not found", is_bounce_notice: true, sent_at: "2026-10-30T16:00:00Z" };
    mockFetch(({ url }) => {
      if (url.includes("emails/bids/9/threads")) return response(threadsPayload({ threads: [{ ...base, messages: [bounced, notice] }] }));
      if (url.includes("emails/unlinked")) return response({ threads: [] });
      return undefined;
    });
    render(<BidEmailsPanel bidId={9} />);
    expect(await screen.findByRole("button", { name: /RFQ SOL-9/ })).toHaveTextContent("Bounced");
  });

  test("prompts to connect Gmail and shows reconnect when authorization expired", async () => {
    mockFetch(({ url }) => {
      if (url.includes("emails/bids/9/threads")) return response(threadsPayload({ threads: [], account: { status: "expired", connected: false } }));
      if (url.includes("emails/unlinked")) return response({ threads: [] });
      return undefined;
    });
    render(<BidEmailsPanel bidId={9} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Gmail authorization expired");
    expect(screen.getByRole("link", { name: "Reconnect Gmail" })).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("button", { name: /Sync now/ })).not.toBeInTheDocument();
  });

  test("manual override, possible matches and held outbox actions", async () => {
    const suggested = { ...threadsPayload().threads[0], id: 77, bid_id: null, candidate_bid_ids: [9, 12], subject: "Two bids", link_source: "solicitation_match" };
    const held = { ...threadsPayload().threads[0].messages[0], id: 40, thread_id: null, send_status: "held", subject: "FREE!!!", sent_by_name: "Agent One", created_at: "2026-10-31T10:00:00Z" };
    mockFetch(({ url, method }) => {
      if (url.includes("emails/bids/9/threads")) return response(threadsPayload({ outbox: [held] }));
      if (url.includes("emails/unlinked")) return response({ threads: [suggested] });
      if (method === "PATCH" && url.includes("emails/threads/")) return response({ thread: {} });
      if (method === "POST" && url.endsWith("/discard")) return response({ message: { ...held, send_status: "discarded" } });
      return undefined;
    });
    const user = userEvent.setup();
    render(<BidEmailsPanel bidId={9} />);
    const outbox = await screen.findByRole("region", { name: "Unsent emails" });
    expect(within(outbox).getByText("Held for review")).toBeInTheDocument();
    await user.click(within(outbox).getByRole("button", { name: "Discard" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/emails/40/discard"))).toBe(true));

    await user.click(screen.getByRole("button", { name: /Link to this bid/ }));
    await waitFor(() => expect(calls.find((c) => c.url.includes("threads/77"))?.body).toEqual({ bid_id: 9 }));

    await user.click(screen.getByRole("button", { name: /RFQ SOL-9/ }));
    await user.click(screen.getByLabelText("I am handling this conversation manually"));
    await waitFor(() => expect(calls.find((c) => c.url.includes("threads/5"))?.body).toEqual({ manual_override: true }));
  });
});

describe("KAN-77/78 compose with pre-send spam-risk check", () => {
  function setup(sendStatus: number, sendBody: unknown, level: "low" | "medium" | "high") {
    mockFetch(({ url, method }) => {
      if (url.includes("emails/bids/9/threads")) return response(threadsPayload({ threads: [] }));
      if (url.includes("emails/unlinked")) return response({ threads: [] });
      if (url.includes("emails/spam-check")) return response({ spam_check: check(level) });
      if (method === "POST" && url.endsWith("/emails/send")) return response(sendBody, sendStatus);
      return undefined;
    });
  }

  async function openCompose(user: ReturnType<typeof userEvent.setup>) {
    render(<BidEmailsPanel bidId={9} />);
    await user.click(await screen.findByRole("button", { name: "New email" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Sending as agent@gmail.com");
    expect(within(dialog).getByLabelText("To")).toHaveValue("co@agency.gov");
    return dialog;
  }

  test("low risk sends the exact draft from the bid", async () => {
    setup(200, { message: { id: 1, send_status: "sent" } }, "low");
    const user = userEvent.setup();
    const dialog = await openCompose(user);
    await user.clear(within(dialog).getByLabelText("To"));
    await user.type(within(dialog).getByLabelText("To"), "sales@acme.com, ops@acme.com");
    await user.type(within(dialog).getByLabelText("Subject"), "price for 40 units");
    await user.type(within(dialog).getByLabelText("Message"), "Hello,  please quote.");
    await user.click(within(dialog).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith("/emails/send"))).toBe(true));
    const sent = calls.find((c) => c.url.endsWith("/emails/send"))!.body!;
    expect(sent).toMatchObject({
      bid_id: 9, to: ["sales@acme.com", "ops@acme.com"], subject: "SOL-9: price for 40 units",
      body_text: "Hello,  please quote.", acknowledge_warnings: false,
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Email sent");
  });

  test("medium risk shows suggestions and requires confirmation; edits make the check stale", async () => {
    setup(200, { message: { id: 1, send_status: "sent" } }, "medium");
    const user = userEvent.setup();
    const dialog = await openCompose(user);
    await user.type(within(dialog).getByLabelText("Message"), "See https://bit.ly/x");
    await user.click(within(dialog).getByRole("button", { name: "Send" }));
    const panel = await within(dialog).findByRole("region", { name: "Spam-risk check" });
    expect(panel).toHaveTextContent("Some spam-risk warnings");
    expect(panel).toHaveTextContent("Use the full destination URL");
    expect(panel).toHaveTextContent("not a guarantee");
    expect(calls.some((c) => c.url.endsWith("/emails/send"))).toBe(false);
    expect(within(dialog).getByRole("button", { name: "Send" })).toBeDisabled();

    await user.click(within(dialog).getByLabelText(/I reviewed these warnings/));
    await user.click(within(dialog).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith("/emails/send"))?.body).toMatchObject({ acknowledge_warnings: true }));
  });

  test("editing after a check marks it stale", async () => {
    setup(200, {}, "medium");
    const user = userEvent.setup();
    const dialog = await openCompose(user);
    await user.click(within(dialog).getByRole("button", { name: "Check spam risk" }));
    await within(dialog).findByRole("region", { name: "Spam-risk check" });
    await user.type(within(dialog).getByLabelText("Message"), " more");
    expect(within(dialog).getByText(/The draft changed after this check/)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/I reviewed these warnings/)).not.toBeInTheDocument();
  });

  test("high risk is submitted for review and reported as held", async () => {
    setup(202, { held: true, message: { id: 3, send_status: "held" }, spam_check: check("high") }, "high");
    const user = userEvent.setup();
    const dialog = await openCompose(user);
    await user.type(within(dialog).getByLabelText("Message"), "FREE GIFT!!!");
    await user.click(within(dialog).getByRole("button", { name: "Send" }));
    expect(await within(dialog).findByText(/will be held until an admin reviews it/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Submit for review" }));
    expect(await screen.findByRole("status")).toHaveTextContent("held for admin review");
  });

  test("a Gmail failure is shown clearly", async () => {
    setup(502, { message: { id: 4, send_status: "failed", send_error: "Gmail did not accept the message: quota" } }, "low");
    const user = userEvent.setup();
    const dialog = await openCompose(user);
    await user.type(within(dialog).getByLabelText("Message"), "Hello there, please quote.");
    await user.click(within(dialog).getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Gmail did not accept the message: quota")).toBeInTheDocument();
  });
});

describe("KAN-76 Gmail connection card and settings page", () => {
  test("connected account can sync and disconnect with confirmation", async () => {
    mockFetch(({ url, method }) => {
      if (url.endsWith("gmail/status")) return response({ account: { ...connected, configured: true, connected_at: "2026-10-30T10:00:00Z" } });
      if (method === "POST" && url.endsWith("gmail/sync")) {
        return response({ summary: { mode: "full", checked: 5, stored: 2, skipped_duplicate: 0, not_bid_related: 3, unlinked: 0, bounces: 0 }, account: connected });
      }
      if (method === "POST" && url.endsWith("gmail/disconnect")) return response({ account: { status: "disconnected", connected: false, gmail_address: "agent@gmail.com" } });
      return undefined;
    });
    const user = userEvent.setup();
    render(<GmailConnectionCard />);
    expect(await screen.findByText(/Connected as/)).toHaveTextContent("agent@gmail.com");
    await user.click(screen.getByRole("button", { name: /Sync now/ }));
    expect(await screen.findByRole("status")).toHaveTextContent("2 new bid emails saved, 3 ignored as not bid-related");
    await user.click(screen.getByRole("button", { name: /Disconnect/ }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Disconnect" }));
    expect(await screen.findByRole("button", { name: "Connect Gmail" })).toBeInTheDocument();
  });

  test("expired authorization offers reconnect and surfaces the callback error", async () => {
    mockFetch(({ url }) => (url.endsWith("gmail/status")
      ? response({ account: { status: "expired", connected: false, gmail_address: "agent@gmail.com", configured: true, needs_reconnect: true, last_error: "Reconnect Gmail in Settings." } })
      : undefined));
    render(<GmailConnectionCard callbackResult="error" callbackMessage="Google rejected the authorization." />);
    expect(await screen.findByRole("button", { name: "Reconnect Gmail" })).toBeInTheDocument();
    expect(screen.getByText(/authorization expired for agent@gmail.com/)).toBeInTheDocument();
    expect(screen.getByText("Google rejected the authorization.")).toBeInTheDocument();
  });

  test("agents see only their Gmail card; admins also review held mail and rules", async () => {
    mockFetch(({ url }) => {
      if (url.endsWith("gmail/status")) return response({ account: { status: "not_connected", connected: false, configured: true } });
      if (url.endsWith("emails/held")) return response({ messages: [] });
      if (url.endsWith("emails/deliverability-settings")) {
        return response({
          settings: { rules: { links_shortener: { enabled: true, weight: 25 } }, warn_threshold: 30, hold_threshold: 60, hold_high_risk: true, trigger_words: ["free"] },
          rules: [{ key: "links_shortener", field: "links", default_weight: 25, label: "Uses a link shortener" }],
          default_trigger_words: ["free"], disclaimer: "Not a guarantee.",
        });
      }
      return undefined;
    });
    mockedGetStoredUser.mockReturnValue(agent);
    const { unmount } = render(<SettingsPage />);
    expect(await screen.findByRole("button", { name: "Connect Gmail" })).toBeInTheDocument();
    expect(screen.queryByText("Emails held for review")).not.toBeInTheDocument();
    expect(calls.some((c) => c.url.includes("emails/held"))).toBe(false);
    unmount();

    mockedGetStoredUser.mockReturnValue(admin);
    render(<SettingsPage />);
    expect(await screen.findByText("No emails are waiting for review.")).toBeInTheDocument();
    expect(await screen.findByLabelText("Hold threshold")).toHaveValue(60);
  });
});

test("risk panel always carries the delivery disclaimer", () => {
  render(<SpamRiskPanel result={check("low")} />);
  expect(screen.getByText(/No common spam signals/)).toBeInTheDocument();
  expect(screen.getByText(/not a guarantee of whether Gmail will deliver/)).toBeInTheDocument();
});

describe("KAN-74 round 2: vendors from KAN-80 and the manual-handling pause", () => {
  const bedco = { id: 31, company_name: "BedCo", email: "quotes@bedco.example", status: "negotiating", negotiation_open: true, automation_paused: false };
  const otherco = { id: 32, company_name: "OtherCo", email: "sales@otherco.example", status: "pending", negotiation_open: true, automation_paused: false };

  function vendorThreads(manual: boolean) {
    const base = threadsPayload();
    return threadsPayload({
      vendors: [{ ...bedco, automation_paused: manual }, otherco],
      threads: [{ ...base.threads[0], manual_override: manual, counterpart_emails: [bedco.email], vendors: [{ ...bedco, automation_paused: manual }] }],
    });
  }

  test("a vendor conversation explains that ticking 'handling manually' pauses the automation", async () => {
    let manual = false;
    mockFetch(({ url, method, body }) => {
      if (url.includes("emails/bids/9/threads")) return response(vendorThreads(manual));
      if (url.includes("emails/unlinked")) return response({ threads: [] });
      if (method === "PATCH" && url.includes("emails/threads/5")) { manual = Boolean(body?.manual_override); return response({ thread: {} }); }
      return undefined;
    });
    const user = userEvent.setup();
    render(<BidEmailsPanel bidId={9} />);
    const thread = await screen.findByRole("button", { name: /RFQ SOL-9/ });
    expect(thread).toHaveTextContent("Vendor: BedCo");
    await user.click(thread);
    expect(screen.getByText("Ticking this pauses the automated negotiation with BedCo until you untick it.")).toBeInTheDocument();
    await user.click(screen.getByLabelText("I am handling this conversation manually"));
    expect(await screen.findByText(/Automated negotiation with BedCo is paused while this is ticked/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /RFQ SOL-9/ })).toHaveTextContent("Vendor: BedCo · automation paused");
  });

  test("the 'handling manually' tick shows at once and reverts if saving fails", async () => {
    mockFetch(({ url, method }) => {
      if (url.includes("emails/bids/9/threads")) return response(vendorThreads(false));
      if (url.includes("emails/unlinked")) return response({ threads: [] });
      if (method === "PATCH" && url.includes("emails/threads/5")) return response({ error: "You no longer have access to this bid." }, 403);
      return undefined;
    });
    const user = userEvent.setup();
    render(<BidEmailsPanel bidId={9} />);
    await user.click(await screen.findByRole("button", { name: /RFQ SOL-9/ }));
    await user.click(screen.getByLabelText("I am handling this conversation manually"));
    expect(await screen.findByRole("alert")).toHaveTextContent("You no longer have access to this bid.");
    await waitFor(() => expect(screen.getByLabelText("I am handling this conversation manually")).not.toBeChecked());
  });

  test("a compose request from a vendor row opens a draft to that vendor, with the bid's other vendors one click away", async () => {
    mockFetch(({ url }) => {
      if (url.includes("emails/bids/9/threads")) return response(vendorThreads(false));
      if (url.includes("emails/unlinked")) return response({ threads: [] });
      return undefined;
    });
    const user = userEvent.setup();
    render(<BidEmailsPanel bidId={9} composeRequest={{ to: bedco.email, name: "BedCo", nonce: 1 }} />);
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Email BedCo");
    expect(within(dialog).getByLabelText("To")).toHaveValue("quotes@bedco.example");
    expect(within(dialog).getByLabelText("Subject")).toHaveValue("SOL-9: ");
    const picks = within(dialog).getByRole("group", { name: "Vendors on this bid" });
    expect(within(picks).queryByRole("button", { name: "Add BedCo" })).not.toBeInTheDocument();
    await user.click(within(picks).getByRole("button", { name: "Add OtherCo" }));
    expect(within(dialog).getByLabelText("To")).toHaveValue("quotes@bedco.example, sales@otherco.example");
    expect(within(dialog).queryByRole("group", { name: "Vendors on this bid" })).not.toBeInTheDocument();
  });

  test("the bid page's vendor row has an Email action that opens compose in the Emails card", async () => {
    mockedGetStoredUser.mockReturnValue(agent);
    const bid = {
      id: 9, bid_id: "B-9", title: "Bid nine", solicitation_number: "SOL-9", internal_status: "Finding Supplier",
      status_history: [], ownership_history: [], current_owner_user_id: 2,
      workspace: {
        session_id: 4, negotiation_status: "active", rfq_href: null, negotiation_history: [], email_conversations: [], preferred_vendors: [],
        vendors: [{ id: 31, company_name: "BedCo", email: "Quotes@BedCo.example", notes: null, is_manual: true, preferred: false, status: "negotiating",
          outreach_state: "contacted", negotiation_round: 1, rounds: [], email_sent: true, latest_price: null }],
      },
    };
    mockFetch(({ url }) => {
      if (url.includes("pipeline/bids/9")) return response({ bid });
      if (url.includes("emails/bids/9/threads")) return response(vendorThreads(false));
      if (url.includes("emails/unlinked")) return response({ threads: [] });
      return undefined;
    });
    const user = userEvent.setup();
    render(<BidDetailPage />);
    await screen.findByText("Gmail conversations from connected mailboxes.", { exact: false });
    await screen.findByText(/Your mailbox:/);
    await user.click(screen.getByRole("button", { name: "Email BedCo" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Sending as agent@gmail.com");
    expect(within(dialog).getByLabelText("To")).toHaveValue("quotes@bedco.example");
  });
});
