import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AwardPanel } from "@/components/awards/AwardPanel";
import type { AwardDetail } from "@/lib/awards";

function award(overrides: Partial<AwardDetail> = {}): AwardDetail {
  return {
    award_outcome: "pending",
    awarded_to: null,
    awarded_amount: null,
    outcome_notes: null,
    submitted_on: "2026-08-20",
    days_since_submission: 52,
    tracked: true,
    checkpoint_state: "due",
    current_checkpoint: { checkpoint_days: 45, due_on: "2026-10-04", state: "due" },
    checkpoints_completed: 1,
    checkpoints_total: 4,
    flagged: false,
    sam_info: null,
    checkpoints: [
      { id: 1, checkpoint_days: 30, due_on: "2026-09-19", status: "completed", state: "completed", checked_on: "2026-09-20", checked_by_name: "Agent One", award_status: "pending", awarded_to: null, awarded_amount: null, notes: null },
      { id: 2, checkpoint_days: 45, due_on: "2026-10-04", status: "open", state: "due", checked_on: null, checked_by_name: null, award_status: null, awarded_to: null, awarded_amount: null, notes: null },
      { id: 3, checkpoint_days: 60, due_on: "2026-10-19", status: "open", state: "upcoming", checked_on: null, checked_by_name: null, award_status: null, awarded_to: null, awarded_amount: null, notes: null },
      { id: 4, checkpoint_days: 90, due_on: "2026-11-18", status: "open", state: "upcoming", checked_on: null, checked_by_name: null, award_status: null, awarded_to: null, awarded_amount: null, notes: null },
    ],
    history: [],
    lookups: [],
    lookup: { enabled: true, eligible: true, reason: null, daily_budget: 10, remaining_today: 7 },
    tracking_start_date: "2026-01-01",
    can_record: true,
    ...overrides,
  };
}

const samFound = {
  id: 11, result: "found" as const, api: "contract_awards", requested_at: "2026-10-10T11:00:00Z", checkpoint_days: 45,
  error_code: null, message: null, awardee_name: "GE PRECISION HEALTHCARE LLC", awardee_uei: "JJURYE5M19G1",
  amount: 52680.8, piid: "15B61524P00000105", date_signed: "2026-10-01", solicitation_id: "SOL-1", candidates: [],
  applied: false,
};

let posts: Array<{ url: string; body: Record<string, unknown> | null }> = [];

function mockApi(initial: AwardDetail, onPost?: (url: string, body: Record<string, unknown> | null) => { status?: number; body: unknown }) {
  posts = [];
  global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (init?.method === "POST") {
      const body = init.body ? JSON.parse(String(init.body)) : null;
      posts.push({ url, body });
      const result = onPost ? onPost(url, body) : { body: { award: initial } };
      const status = result.status ?? 200;
      return Promise.resolve({ ok: status < 300, status, json: async () => result.body } as Response);
    }
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ award: initial }) } as Response);
  }) as jest.Mock;
}

describe("KAN-65 checkpoints and KAN-66 manual outcome entry", () => {
  test("shows the 30/45/60/90 timeline and records the due checkpoint", async () => {
    mockApi(award());
    const user = userEvent.setup();
    render(<AwardPanel bidId={7} />);

    const timeline = await screen.findByRole("list", { name: "Award checkpoints" });
    expect(timeline).toHaveTextContent("30-day check");
    expect(timeline).toHaveTextContent("Checked 2026-09-20 by Agent One");
    expect(timeline).toHaveTextContent("45-day checkDue now");
    expect(timeline).toHaveTextContent("Due 2026-11-18");
    expect(screen.getByText("Day 45 · Due · 1/4")).toBeInTheDocument();
    expect(screen.getByLabelText("Checkpoint")).toHaveValue("45");

    await user.click(screen.getByRole("radio", { name: "Lost" }));
    await user.type(screen.getByLabelText("Awarded to"), "Acme Supply");
    await user.type(screen.getByLabelText("Winning amount"), "58000.50");
    await user.type(screen.getByLabelText("Notes"), "Lower price");
    await user.click(screen.getByRole("button", { name: "Save outcome" }));

    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe("/api/backend/pipeline/bids/7/award-checkpoints/45");
    expect(posts[0].body).toMatchObject({
      award_outcome: "lost", awarded_to: "Acme Supply", awarded_amount: "58000.5", notes: "Lower price", lookup_id: null,
    });
    expect(await screen.findByRole("status")).toHaveTextContent("45-day check recorded.");
  });

  test("KAN-63 field rules: winner only for Lost, amount for Won/Lost, none for Pending/Unknown", async () => {
    mockApi(award());
    const user = userEvent.setup();
    render(<AwardPanel bidId={7} />);
    await screen.findByRole("radio", { name: "Pending" });
    expect(screen.queryByLabelText("Awarded to")).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/amount/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Won" }));
    expect(screen.queryByLabelText("Awarded to")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Award amount (optional)")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Unknown" }));
    expect(screen.queryByLabelText(/amount/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText("Checkpoint"), "none");
    await user.click(screen.getByRole("button", { name: "Save outcome" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].url).toBe("/api/backend/pipeline/bids/7/award-outcome");
    expect(posts[0].body).toMatchObject({ award_outcome: "unknown", awarded_to: "", awarded_amount: "" });
  });

  test("validates amounts and the checked-on date before saving, and shows server errors", async () => {
    mockApi(award(), () => ({ status: 409, body: { error: "The 60-day checkpoint is not due until 2026-10-19." } }));
    const user = userEvent.setup();
    render(<AwardPanel bidId={7} />);
    await user.click(await screen.findByRole("radio", { name: "Lost" }));
    await user.type(screen.getByLabelText("Winning amount"), "-5");
    await user.click(screen.getByRole("button", { name: "Save outcome" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Awarded amount must be a positive number.");
    expect(posts).toHaveLength(0);

    await user.clear(screen.getByLabelText("Winning amount"));
    const checkedOn = screen.getByLabelText("Checked on");
    await user.clear(checkedOn);
    await user.type(checkedOn, "2026-08-01");
    await user.click(screen.getByRole("button", { name: "Save outcome" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Checked on cannot be before the submission date.");
    await user.clear(checkedOn);
    await user.type(checkedOn, "2099-01-01");
    await user.click(screen.getByRole("button", { name: "Save outcome" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Checked on cannot be in the future.");
    expect(posts).toHaveLength(0);

    await user.clear(checkedOn);
    await user.type(checkedOn, "2026-10-05");
    await user.click(screen.getByRole("button", { name: "Save outcome" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("not due until 2026-10-19");
  });

  test("shows the 90-day flag, untracked bids and read-only access", async () => {
    mockApi(award({ flagged: true, checkpoint_state: "flagged" }));
    const { unmount } = render(<AwardPanel bidId={7} />);
    expect(await screen.findByText(/90 days since submission with no award outcome logged/)).toBeInTheDocument();
    unmount();

    mockApi(award({ tracked: false, checkpoints: [], checkpoint_state: "untracked", current_checkpoint: null, checkpoints_completed: 0, checkpoints_total: 0, tracking_start_date: "2026-10-11" }));
    const second = render(<AwardPanel bidId={7} />);
    expect(await screen.findByText(/Submitted before checkpoint tracking started \(2026-10-11\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save outcome" })).toBeInTheDocument();
    second.unmount();

    mockApi(award({ can_record: false, award_outcome: "lost", awarded_to: "Rival", awarded_amount: 10 }));
    render(<AwardPanel bidId={7} />);
    expect(await screen.findByText("Only the bid owner or a manager can record the outcome.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save outcome" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Check SAM.gov now/ })).not.toBeInTheDocument();
    expect(screen.getByText("Rival")).toBeInTheDocument();
  });

  test("lists outcome history with who, when and source", async () => {
    mockApi(award({
      history: [{
        id: 1, changed_at: "2026-10-05T15:00:00Z", changed_by_name: "Manager", checkpoint_days: 45, checked_on: "2026-10-05",
        old_outcome: "pending", new_outcome: "lost", awarded_to: "Rival", awarded_amount: 1000, notes: "Posted", source: "sam_values",
      }],
    }));
    render(<AwardPanel bidId={7} />);
    const entry = await screen.findByText(/Pending →/);
    expect(entry).toHaveTextContent("Pending → Lost · 45-day check · Rival · $1,000.00 · from SAM.gov");
  });
});

describe("KAN-69 SAM.gov award information", () => {
  test("Use these values pre-fills winner and amount; the person still chooses Won/Lost", async () => {
    mockApi(award({ sam_info: samFound }));
    const user = userEvent.setup();
    render(<AwardPanel bidId={7} />);
    const info = await screen.findByTestId("sam-award-info");
    expect(info).toHaveTextContent("Awarded to GE PRECISION HEALTHCARE LLC (UEI JJURYE5M19G1) for $52,680.80");
    expect(info).toHaveTextContent("PIID 15B61524P00000105");
    await user.click(screen.getByRole("button", { name: "Use these values" }));
    expect(screen.getByRole("status")).toHaveTextContent("Choose Won or Lost, then save.");
    expect(screen.getByRole("radio", { name: "Pending" })).toBeChecked();
    await user.click(screen.getByRole("radio", { name: "Lost" }));
    expect(screen.getByLabelText("Awarded to")).toHaveValue("GE PRECISION HEALTHCARE LLC");
    expect(screen.getByLabelText("Winning amount")).toHaveValue(52680.8);
    await user.click(screen.getByRole("button", { name: "Save outcome" }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].body).toMatchObject({ award_outcome: "lost", awarded_to: "GE PRECISION HEALTHCARE LLC", lookup_id: 11 });
  });

  test("warns when several companies were awarded under the same solicitation", async () => {
    mockApi(award({
      sam_info: {
        ...samFound,
        message: "66 awards to 41 different companies match this solicitation (likely a multiple-award or schedule contract). Review before using the values.",
        candidates: [
          { api: "contract_awards", awardee_name: "MARATHON WATCH COMPANY LTD", awardee_uei: "FK4TXZ3JKYH8", amount: 18881.4, piid: "47QSSC27F046F", date_signed: "2026-10-02 00:00:00", modification_number: "0" },
          { api: "contract_awards", awardee_name: "SANITZ ENTERPRISES, INC.", awardee_uei: "GLJ4J66A2HK3", amount: 94812.54, piid: "47QSWA27F00ED", date_signed: "2026-10-02 00:00:00", modification_number: "0" },
        ],
      },
    }));
    render(<AwardPanel bidId={7} />);
    const note = await screen.findByRole("note");
    expect(note).toHaveTextContent("66 awards to 41 different companies");
    expect(note).toHaveTextContent("SANITZ ENTERPRISES, INC. · $94,812.54 · 2026-10-02 · PIID 47QSWA27F00ED");
  });

  test("Check SAM.gov now shows the result and respects the daily budget", async () => {
    const after = award({ sam_info: { ...samFound, result: "not_found", awardee_name: null, amount: null }, lookup: { enabled: true, eligible: true, reason: null, daily_budget: 10, remaining_today: 5 } });
    mockApi(award(), () => ({ body: { award: after } }));
    const user = userEvent.setup();
    const { unmount } = render(<AwardPanel bidId={7} />);
    expect(await screen.findByText("7 of 10 SAM.gov requests left today.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Check SAM.gov now" }));
    await waitFor(() => expect(posts[0].url).toBe("/api/backend/pipeline/bids/7/award-lookup"));
    expect(await screen.findByRole("status")).toHaveTextContent("No published award found on SAM.gov yet.");
    expect(screen.getByText("5 of 10 SAM.gov requests left today.")).toBeInTheDocument();
    unmount();

    mockApi(award({ lookup: { enabled: true, eligible: true, reason: null, daily_budget: 10, remaining_today: 0 } }));
    const second = render(<AwardPanel bidId={7} />);
    expect(await screen.findByRole("button", { name: "Check SAM.gov now" })).toBeDisabled();
    second.unmount();

    mockApi(award({ lookup: { enabled: true, eligible: false, reason: "Only SAM.GOV bids can be looked up; other portals use manual entry.", daily_budget: 10, remaining_today: 10 } }));
    render(<AwardPanel bidId={7} />);
    expect(await screen.findByText(/Only SAM.GOV bids can be looked up/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check SAM.gov now" })).toBeDisabled();
  });
});
