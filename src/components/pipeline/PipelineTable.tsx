import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import Link from "next/link";
import {
  formatDate,
  formatMoney,
  formatOutcome,
  formatStatus,
  hundredKRowClass,
  statusStyle,
  type PipelineItem,
} from "@/lib/pipeline";

function dash(value: string | number | null | undefined) {
  if (value == null || value === "") return "—";
  return String(value);
}

function SheetLink({ href }: { href: string | null | undefined }) {
  if (!href) return <span>—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="whitespace-nowrap text-blue-600 underline hover:text-blue-800"
    >
      Link
    </a>
  );
}

const sheetHead = "whitespace-nowrap";
const sheetCell = "whitespace-nowrap";

type Variant = "full" | "hundred-k" | "person" | "my-bids" | "history" | "ledger";

function statusLabel(status: string) {
  if (status === "Finding Supplier") return "Finding supplier";
  if (status === "Waiting Approval") return "Waiting approval";
  if (status === "Approved for Submission") return "Approved for submission";
  if (status === "Bid No Approved") return "Bid not approved";
  return status || "—";
}

function statusPill(status: string) {
  if (status === "Waiting Approval" || status === "Approved for Submission") return "cf-pill-app";
  if (status === "Bid submitted") return "cf-pill-sub";
  if (status === "Bid No Approved" || status === "Bid got removed" || status === "Couldnt get quote") return "cf-pill-lost";
  return "cf-pill-sup";
}

function outcomePill(outcome: string | null | undefined) {
  if (outcome === "won") return "cf-pill-won";
  if (outcome === "lost") return "cf-pill-lost";
  if (outcome === "pending") return "cf-pill-app";
  if (outcome === "unknown") return "cf-pill-pool";
  return "";
}

function shortDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" }).format(date);
}

function StatusBadge({ status }: { status: string }) {
  return <span className="inline-flex rounded-full px-2 py-1 text-xs font-semibold" style={statusStyle(status)}>{formatStatus(status)}</span>;
}

export function PipelineTable({
  items,
  variant = "full",
  empty = "No rows.",
  highlightId = null,
}: {
  items: PipelineItem[];
  variant?: Variant;
  empty?: string;
  highlightId?: number | null;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{empty}</p>;
  }

  if (variant === "hundred-k") {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">#</TableHead>
            <TableHead>Solicitation</TableHead>
            <TableHead>100k above</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Status</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row, i) => (
            <TableRow key={row.id} className={hundredKRowClass(row.internal_status)}>
              <TableCell>{i + 1}</TableCell>
              <TableCell className="font-medium whitespace-nowrap">
                {row.solicitation_number || "—"}
              </TableCell>
              <TableCell>{row.title || "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(row.due_date)}</TableCell>
              <TableCell className="whitespace-nowrap"><StatusBadge status={row.internal_status} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (variant === "person") {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Internal Status</TableHead>
            <TableHead>ID</TableHead>
            <TableHead>Solicitation #</TableHead>
            <TableHead>Title</TableHead>
            <TableHead>Portal</TableHead>
            <TableHead>Assign Date</TableHead>
            <TableHead>Due Date</TableHead>
            <TableHead>Days left</TableHead>
            <TableHead>Gross Sales</TableHead>
            <TableHead>Approved by</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row) => (
            <TableRow key={row.id}>
              <TableCell className="whitespace-nowrap"><StatusBadge status={row.internal_status} /></TableCell>
              <TableCell className="font-medium whitespace-nowrap"><Link className="text-blue-600 underline" href={`/bids/${row.id}`}>{row.bid_id}</Link></TableCell>
              <TableCell className="whitespace-nowrap">{row.solicitation_number || "—"}</TableCell>
              <TableCell>{row.title || "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{row.portal || "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(row.assign_date)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(row.due_date)}</TableCell>
              <TableCell>{row.days_remaining ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{formatMoney(row.submitted_price)}</TableCell>
              <TableCell>{row.approved_by_name || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (variant === "my-bids") {
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className={sheetHead}>Internal Status</TableHead>
            <TableHead className={sheetHead}>ID</TableHead>
            <TableHead className={sheetHead}>Solicitation #</TableHead>
            <TableHead className={sheetHead}>Title</TableHead>
            <TableHead className={sheetHead}>Manufacturer</TableHead>
            <TableHead className={sheetHead}>Bid link</TableHead>
            <TableHead className={sheetHead}>Portal</TableHead>
            <TableHead className={sheetHead}>Assign Date</TableHead>
            <TableHead className={sheetHead}>Due Date</TableHead>
            <TableHead className={sheetHead}>Days Remaining</TableHead>
            <TableHead className={sheetHead}>Due time</TableHead>
            <TableHead className={sheetHead}>Shipping</TableHead>
            <TableHead className={sheetHead}>Agent</TableHead>
            <TableHead className={sheetHead}>Approved by</TableHead>
            <TableHead className={sheetHead}>Final Quote Link</TableHead>
            <TableHead className={sheetHead}>Price</TableHead>
            <TableHead className={sheetHead}>Markup (%)</TableHead>
            <TableHead className={sheetHead}>Submitted</TableHead>
            <TableHead className={sheetHead}>Profit</TableHead>
            <TableHead className={sheetHead}>Approval Status</TableHead>
            <TableHead className={sheetHead}>CO NAME</TableHead>
            <TableHead className={sheetHead}>Email</TableHead>
            <TableHead className={sheetHead}>Delivery Address</TableHead>
            <TableHead className={sheetHead}>Awarded amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((row) => (
            <TableRow
              key={row.id}
              id={`pipeline-row-${row.id}`}
              className={highlightId === row.id ? "bg-amber-100" : undefined}
            >
              <TableCell className={sheetCell}><StatusBadge status={row.internal_status} /></TableCell>
              <TableCell className={`font-medium ${sheetCell}`}><Link className="text-blue-600 underline" href={`/bids/${row.id}`}>{row.bid_id}</Link></TableCell>
              <TableCell className={sheetCell}>{dash(row.solicitation_number)}</TableCell>
              <TableCell className="min-w-[12rem]">{dash(row.title)}</TableCell>
              <TableCell className={sheetCell}>{dash(row.manufacturer)}</TableCell>
              <TableCell className={sheetCell}>
                <SheetLink href={row.bid_url} />
              </TableCell>
              <TableCell className={sheetCell}>{dash(row.portal)}</TableCell>
              <TableCell className={sheetCell}>{formatDate(row.assign_date)}</TableCell>
              <TableCell className={sheetCell}>{formatDate(row.due_date)}</TableCell>
              <TableCell className={sheetCell}>{row.days_remaining ?? "—"}</TableCell>
              <TableCell className={sheetCell}>{dash(row.due_time)}</TableCell>
              <TableCell className="min-w-[8rem]">{dash(row.shipping_notes)}</TableCell>
              <TableCell className={sheetCell}>{dash(row.agent_name)}</TableCell>
              <TableCell className={sheetCell}>{dash(row.approved_by_name)}</TableCell>
              <TableCell className={sheetCell}>
                <SheetLink href={row.final_quote_url} />
              </TableCell>
              <TableCell className={sheetCell}>{formatMoney(row.supplier_cost)}</TableCell>
              <TableCell className={sheetCell}>{row.markup_percent == null ? "—" : `${row.markup_percent.toFixed(2)}%`}</TableCell>
              <TableCell className={sheetCell}>{formatMoney(row.submitted_price)}</TableCell>
              <TableCell className={sheetCell}>{formatMoney(row.gross_profit)}</TableCell>
              <TableCell className={sheetCell}>{formatStatus(row.approval_status)}</TableCell>
              <TableCell className={sheetCell}>{dash(row.co_name)}</TableCell>
              <TableCell className={sheetCell}>{dash(row.contact_email)}</TableCell>
              <TableCell className="min-w-[10rem]">{dash(row.delivery_address)}</TableCell>
              <TableCell className={sheetCell}>{formatMoney(row.awarded_amount)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  if (variant === "history") {
    return (
      <div style={{ overflowX: "auto" }}>
        <table className="cf-table">
          <thead>
            <tr>
              <th>Status</th>
              <th>Solicitation</th>
              <th>Portal</th>
              <th>Assigned</th>
              <th>Due</th>
              <th className="cf-num">Price</th>
              <th className="cf-num">Gross profit</th>
              <th>Outcome</th>
              <th><span className="sr-only">History</span></th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const outcome = row.award_outcome || row.outcome;
              const price = row.submitted_price ?? row.expected_submitted_price;
              const dueUrgent = row.days_remaining != null && row.days_remaining <= 11;
              return (
                <tr key={row.id}>
                  <td><span className={`cf-pill ${statusPill(row.internal_status)}`}>{statusLabel(row.internal_status)}</span></td>
                  <td>
                    <Link className="cf-id" href={`/bids/${row.id}`}>{row.solicitation_number || row.bid_id}</Link>
                    <div className="cf-meta">{row.title || "—"}</div>
                  </td>
                  <td>{row.portal || "—"}</td>
                  <td>{shortDate(row.assign_date)}</td>
                  <td style={{ color: dueUrgent ? "#BE123C" : undefined, fontWeight: dueUrgent ? 500 : undefined }}>{shortDate(row.due_date)}</td>
                  <td className="cf-num" style={{ color: price == null ? "var(--cf-text-3)" : undefined }}>{formatMoney(price)}</td>
                  <td className="cf-num" style={{ color: row.gross_profit == null ? "var(--cf-text-3)" : row.gross_profit < 0 ? "#BE123C" : "#047857" }}>{formatMoney(row.gross_profit)}</td>
                  <td>{outcome && outcome !== "unknown" ? <span className={`cf-pill ${outcomePill(outcome)}`}>{formatOutcome(outcome)}</span> : <span style={{ color: "var(--cf-text-3)" }}>{formatOutcome(outcome)}</span>}</td>
                  <td><Link className="cf-link" href={`/bids/${row.id}`}>View bid history</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  if (variant === "ledger") {
    return (
      <div style={{ overflowX: "auto" }}>
        <table className="cf-table">
          <thead>
            <tr>
              <th>Solicitation</th>
              <th>Portal</th>
              <th>Agent</th>
              <th>Status</th>
              <th className="cf-num">Cost</th>
              <th className="cf-num">Price</th>
              <th className="cf-num">Gross profit</th>
              <th>Assigned</th>
              <th>Due</th>
              <th>Outcome</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const outcome = row.award_outcome || row.outcome;
              const price = row.submitted_price ?? row.expected_submitted_price;
              const dueUrgent = row.days_remaining != null && row.days_remaining <= 11;
              return (
                <tr key={row.id}>
                  <td>
                    <Link className="cf-id" href={`/bids/${row.id}`}>{row.solicitation_number || row.bid_id}</Link>
                    <div className="cf-meta">{row.title || "—"}</div>
                  </td>
                  <td>{row.portal || "—"}</td>
                  <td>{row.agent_name || "—"}</td>
                  <td><span className={`cf-pill ${statusPill(row.internal_status)}`}>{statusLabel(row.internal_status)}</span></td>
                  <td className="cf-num" style={{ color: row.supplier_cost == null ? "var(--cf-text-3)" : undefined }}>{formatMoney(row.supplier_cost)}</td>
                  <td className="cf-num" style={{ color: price == null ? "var(--cf-text-3)" : undefined }}>{formatMoney(price)}</td>
                  <td className="cf-num" style={{ color: row.gross_profit == null ? "var(--cf-text-3)" : row.gross_profit < 0 ? "#BE123C" : "#047857" }}>{formatMoney(row.gross_profit)}</td>
                  <td className="cf-mono" style={{ fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase" }}>{shortDate(row.assign_date)}</td>
                  <td className="cf-mono" style={{ fontSize: 12, letterSpacing: "0.04em", textTransform: "uppercase", color: dueUrgent ? "#BE123C" : undefined, fontWeight: dueUrgent ? 500 : undefined }}>{shortDate(row.due_date)}</td>
                  <td>{outcome && outcome !== "unknown" ? <span className={`cf-pill ${outcomePill(outcome)}`}>{formatOutcome(outcome)}</span> : <span style={{ color: "var(--cf-text-3)" }}>{formatOutcome(outcome)}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Bid ID</TableHead>
          <TableHead>Solicitation</TableHead>
          <TableHead>Portal</TableHead>
          <TableHead>Item Description</TableHead>
          <TableHead>Cost</TableHead>
          <TableHead>Gross Sales</TableHead>
          <TableHead>Gross Profit</TableHead>
          <TableHead>Date</TableHead>
          <TableHead>Agent</TableHead>
          <TableHead>Internal Status</TableHead>
          <TableHead>Approved by</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((row) => (
          <TableRow key={row.id}>
            <TableCell className="font-medium whitespace-nowrap"><Link className="text-blue-600 underline" href={`/bids/${row.id}`}>{row.bid_id}</Link></TableCell>
            <TableCell className="whitespace-nowrap">{row.solicitation_number || "—"}</TableCell>
            <TableCell className="whitespace-nowrap">{row.portal || "—"}</TableCell>
            <TableCell>{row.title || "—"}</TableCell>
            <TableCell className="whitespace-nowrap">{formatMoney(row.supplier_cost)}</TableCell>
            <TableCell className="whitespace-nowrap">{formatMoney(row.submitted_price)}</TableCell>
            <TableCell className="whitespace-nowrap">{formatMoney(row.gross_profit)}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDate(row.assign_date || row.due_date)}</TableCell>
            <TableCell>{row.agent_name || "—"}</TableCell>
            <TableCell className="whitespace-nowrap"><StatusBadge status={row.internal_status} /></TableCell>
            <TableCell>{row.approved_by_name || "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
