import { render, screen } from "@testing-library/react";
import { PipelineTable } from "@/components/pipeline/PipelineTable";
import type { PipelineItem } from "@/lib/pipeline";

describe("completed bid history navigation", () => {
  test("links a completed Agent Bid Data row to its full bid history", () => {
    const completedBid = {
      id: 42,
      bid_id: "SAM-42",
      solicitation_number: "SOL-42",
      title: "Completed bid",
      portal: "SAM.GOV",
      agent_name: "Agent One",
      internal_status: "Bid submitted",
      submitted_price: 25000,
      expected_submitted_price: null,
      assign_date: "2026-10-01",
      due_date: "2026-10-31",
      outcome: "pending",
    } as PipelineItem;

    render(<PipelineTable items={[completedBid]} variant="history" />);

    expect(screen.getByRole("link", { name: "View bid history" })).toHaveAttribute(
      "href",
      "/bids/42",
    );
  });
});
