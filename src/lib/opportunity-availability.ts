export type OpportunityAvailabilityState = "available" | "claimed" | "terminal";

export type OpportunityWorkflowState =
  | "available"
  | "assigned"
  | "submitted"
  | "removed"
  | "failed_quote"
  | string;

export interface OpportunityAvailability {
  /** Backwards-compatible flag retained by the API. */
  available: boolean;
  tracked_opportunity_id?: number | null;
  assignee?: { id: number; full_name: string } | null;
  availability_state?: OpportunityAvailabilityState;
  workflow_state?: OpportunityWorkflowState;
  last_assignee?: { id: number; full_name: string } | null;
}

export interface AvailabilityPresentation {
  state: OpportunityAvailabilityState;
  label: string;
  className: string;
}

function personName(person: OpportunityAvailability["assignee"], fallback: string) {
  return person?.full_name?.trim() || fallback;
}

/**
 * One canonical catalog-label mapping. The fallback inference keeps older backend
 * deployments usable while new responses distinguish active ownership from terminal work.
 */
export function presentOpportunityAvailability(
  availability: OpportunityAvailability,
): AvailabilityPresentation {
  const state = availability.availability_state
    ?? (availability.available
      ? "available"
      : availability.workflow_state && availability.workflow_state !== "assigned"
        ? "terminal"
        : "claimed");

  if (state === "available") {
    return {
      state,
      label: "Available",
      className: "bg-emerald-100 text-emerald-800",
    };
  }

  if (state === "claimed") {
    return {
      state,
      label: `Taken by ${personName(availability.assignee, "company agent")}`,
      className: "bg-amber-100 text-amber-900",
    };
  }

  const lastAssignee = personName(availability.last_assignee, "company agent");
  const action = {
    submitted: "Submitted by",
    removed: "Removed by",
    failed_quote: "Quote failed by",
  }[availability.workflow_state || ""] || "Closed by";

  return {
    state,
    label: `${action} ${lastAssignee}`,
    className: "bg-slate-200 text-slate-800",
  };
}
