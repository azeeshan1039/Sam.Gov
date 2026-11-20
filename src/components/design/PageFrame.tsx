import Link from "next/link";
import type { ReactNode } from "react";

export function PageBand({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow?: string;
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="cf-band">
      <div className="cf-wrap cf-band-in">
        <div className="min-w-0 [overflow-wrap:anywhere]">
          {eyebrow ? <div className="cf-eyebrow">{eyebrow}</div> : null}
          <h1 className="cf-h1">{title}</h1>
          {lead ? <div className="cf-lead">{lead}</div> : null}
        </div>
        {actions ? <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>{actions}</div> : null}
      </div>
    </section>
  );
}

export function PageMain({ children, className }: { children: ReactNode; className?: string }) {
  return <main className={className ? "cf-wrap cf-main " + className : "cf-wrap cf-main"}>{children}</main>;
}

const ADMIN_TABS = [
  { href: "/work-management", label: "Work management" },
  { href: "/bid-history", label: "Bid history & pipeline" },
  { href: "/hundred-k", label: "$100K+ by employee" },
  { href: "/approvals", label: "Approvals" },
  { href: "/activity-log", label: "Status activity" },
  { href: "/team", label: "Team" },
];

export function AdminTabs({ current, approvalCount }: { current: string; approvalCount?: number }) {
  return (
    <div style={{ borderBottom: "1px solid var(--cf-line)" }}>
      <nav aria-label="Admin" className="cf-wrap cf-section-tabs">
        {ADMIN_TABS.map((tab) => {
          const on = current === tab.href;
          return (
            <Link key={tab.href} href={tab.href} className={`cf-tab${on ? " cf-tab-on" : ""}`} aria-current={on ? "page" : undefined}>
              {tab.label}
              {tab.href === "/approvals" && approvalCount ? <span className="cf-cnt">{approvalCount}</span> : null}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

const REPORT_TABS = [
  { href: "/agent-bid-data", label: "Bid data" },
  { href: "/weekly-submissions", label: "Weekly submissions" },
];

export function ReportTabs({ current }: { current: string }) {
  return (
    <div style={{ borderBottom: "1px solid var(--cf-line)" }}>
      <nav aria-label="Reports" className="cf-wrap cf-section-tabs">
        {REPORT_TABS.map((tab) => {
          const on = current === tab.href;
          return (
            <Link key={tab.href} href={tab.href} className={`cf-tab${on ? " cf-tab-on" : ""}`} aria-current={on ? "page" : undefined}>
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function BidStepper({ status, captions }: { status?: string | null; captions?: string[] }) {
  const award = status === "Bid submitted";
  const steps = award
    ? ["Picked up", "Supplier found", "Approved", "Bid submitted", "Award decision"]
    : ["Picked up", "Supplier quote", "Manager approval", "Submit on portal", "Award tracking"];
  const current = status === "Bid submitted"
    ? 4
    : status === "Approved for Submission"
      ? 3
      : status === "Waiting Approval" || status === "Bid No Approved"
        ? 2
        : status === "Finding Supplier" || status === "Couldnt get quote"
          ? 1
          : 0;
  const notes = ["YOU", "IN PROGRESS", "NEXT", "AFTER APPROVAL", "30/45/60/90 DAYS"];
  return (
    <section className="cf-card" aria-label="Bid progress" style={{ padding: "22px 24px" }}>
      <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))", gap: 16 }}>
        {steps.map((label, index) => {
          const state = index < current ? "done" : index === current ? "now" : "todo";
          const caption = captions?.[index] || (state === "done" ? "DONE" : notes[index]);
          return (
            <li key={label} className="cf-step" aria-current={state === "now" ? "step" : undefined}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span className={`cf-dot ${state === "done" ? "cf-dot-done" : state === "now" ? "cf-dot-now" : "cf-dot-todo"}`}>{state === "done" ? "✓" : String(index + 1).padStart(2, "0")}</span>
                {index < steps.length - 1 ? <span className={state === "done" ? "cf-step-ln cf-step-ln-on" : "cf-step-ln"} /> : null}
              </div>
              <span style={{ fontWeight: 500, color: state === "todo" ? "#64748B" : "#0B1220" }}>{label}</span>
              <span className="cf-mono cf-meta" style={state === "now" && award ? { color: "#B45309", fontWeight: 500 } : undefined}>{caption}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
