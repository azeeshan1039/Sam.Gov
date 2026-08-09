import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  formatDate,
  formatMoney,
  formatStatus,
  hundredKRowClass,
  type PipelineItem,
} from "@/lib/pipeline";

type Variant = "full" | "hundred-k" | "person";

export function PipelineTable({
  items,
  variant = "full",
  empty = "No rows.",
}: {
  items: PipelineItem[];
  variant?: Variant;
  empty?: string;
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
              <TableCell className="whitespace-nowrap">{formatStatus(row.internal_status)}</TableCell>
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
              <TableCell className="whitespace-nowrap">{formatStatus(row.internal_status)}</TableCell>
              <TableCell className="font-medium whitespace-nowrap">{row.bid_id}</TableCell>
              <TableCell className="whitespace-nowrap">{row.solicitation_number || "—"}</TableCell>
              <TableCell>{row.title || "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{row.portal || "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(row.assign_date)}</TableCell>
              <TableCell className="whitespace-nowrap">{formatDate(row.due_date)}</TableCell>
              <TableCell>{row.days_remaining ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap">{formatMoney(row.gross_sales)}</TableCell>
              <TableCell>{row.approved_by_name || "—"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
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
            <TableCell className="font-medium whitespace-nowrap">{row.bid_id}</TableCell>
            <TableCell className="whitespace-nowrap">{row.solicitation_number || "—"}</TableCell>
            <TableCell className="whitespace-nowrap">{row.portal || "—"}</TableCell>
            <TableCell>{row.title || "—"}</TableCell>
            <TableCell className="whitespace-nowrap">{formatMoney(row.cost)}</TableCell>
            <TableCell className="whitespace-nowrap">{formatMoney(row.gross_sales)}</TableCell>
            <TableCell className="whitespace-nowrap">{formatMoney(row.gross_profit)}</TableCell>
            <TableCell className="whitespace-nowrap">{formatDate(row.assign_date || row.due_date)}</TableCell>
            <TableCell>{row.agent_name || "—"}</TableCell>
            <TableCell className="whitespace-nowrap">{formatStatus(row.internal_status)}</TableCell>
            <TableCell>{row.approved_by_name || "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
