"use client";

import Link from "next/link";
import { AwardPanel } from "@/components/awards/AwardPanel";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AwardDetail, AwardTrackingItem } from "@/lib/awards";

export function CheckpointDialog({
  item,
  focusCheckpoint,
  open,
  onOpenChange,
  onSaved,
}: {
  item: Pick<AwardTrackingItem, "id" | "bid_id" | "solicitation_number" | "title"> | null;
  focusCheckpoint?: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (award: AwardDetail) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Award check · {item?.solicitation_number || item?.bid_id}</DialogTitle>
          <DialogDescription className="text-slate-600">
            {item?.title || "Submitted bid"} · <Link className="text-blue-600 hover:underline" href={`/bids/${item?.id}`}>Open bid</Link>
          </DialogDescription>
        </DialogHeader>
        {item && <AwardPanel bidId={item.id} focusCheckpoint={focusCheckpoint} onSaved={onSaved} />}
      </DialogContent>
    </Dialog>
  );
}
