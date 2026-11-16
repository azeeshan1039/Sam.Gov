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
        <div>
          {eyebrow ? <div className="cf-eyebrow">{eyebrow}</div> : null}
          <h1 className="cf-h1">{title}</h1>
          {lead ? <div className="cf-lead">{lead}</div> : null}
        </div>
        {actions ? <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>{actions}</div> : null}
      </div>
    </section>
  );
}

export function PageMain({ children }: { children: ReactNode }) {
  return <main className="cf-wrap cf-main">{children}</main>;
}

const ADMIN_TABS = [
  { href: "/work-management", label: "Work management" },
  { href: "/bid-history", label: "Bid history & pipeline" },
  { href: "/approvals", label: "Approvals" },
  { href: "/team", label: "Team" },
];

export function AdminTabs({ current }: { current: string }) {
  return (
    <nav aria-label="Admin" className="cf-wrap" style={{ display: "flex", flexWrap: "wrap", gap: 28, borderBottom: "1px solid var(--cf-line)" }}>
      {ADMIN_TABS.map((tab) => {
        const on = current === tab.href || (tab.href === "/bid-history" && (current === "/pipeline" || current === "/hundred-k"));
        return (
          <Link key={tab.href} href={tab.href} className={`cf-tab${on ? " cf-tab-on" : ""}`} aria-current={on ? "page" : undefined}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

const REPORT_TABS = [
  { href: "/agent-bid-data", label: "Bid data" },
  { href: "/weekly-submissions", label: "Weekly submissions" },
];

export function ReportTabs({ current }: { current: string }) {
  return (
    <nav aria-label="Reports" className="cf-wrap" style={{ display: "flex", flexWrap: "wrap", gap: 28, borderBottom: "1px solid var(--cf-line)" }}>
      {REPORT_TABS.map((tab) => {
        const on = current === tab.href;
        return (
          <Link key={tab.href} href={tab.href} className={`cf-tab${on ? " cf-tab-on" : ""}`} aria-current={on ? "page" : undefined}>
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function BidStepper({ status }: { status?: string | null }) {
  const steps = ["Picked up", "Supplier quote", "Manager approval", "Submit on portal", "Award tracking"];
  const current = status === "Bid submitted"
    ? 4
    : status === "Approved for Submission"
      ? 3
      : status === "Waiting Approval" || status === "Bid No Approved"
        ? 2
        : status === "Finding Supplier" || status === "Couldnt get quote"
          ? 1
          : 0;
  return (
    <ol className="cf-card" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", listStyle: "none", margin: 0, padding: 8 }}>
      {steps.map((label, index) => {
        const state = index < current ? "done" : index === current ? "current" : "later";
        return (
          <li key={label} style={{ padding: "12px 14px", borderRight: index < steps.length - 1 ? "1px solid var(--cf-line)" : undefined }}>
            <div className="cf-lbl" style={{ color: state === "later" ? "var(--cf-text-3)" : "#0E7490" }}>{String(index + 1).padStart(2, "0")}</div>
            <div style={{ marginTop: 4, fontWeight: 500, color: state === "later" ? "var(--cf-text-3)" : "var(--cf-text)" }}>{label}</div>
          </li>
        );
      })}
    </ol>
  );
}
