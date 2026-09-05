"use client";

import { useEffect, useState } from "react";
import type { AuthUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface EditGoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AuthUser;
  memberId: number | null;
  memberName: string;
  currentGoal: number;
  onSaved: () => void;
}

export function EditGoalDialog({
  open,
  onOpenChange,
  user,
  memberId,
  memberName,
  currentGoal,
  onSaved,
}: EditGoalDialogProps) {
  const [goal, setGoal] = useState(String(currentGoal));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setGoal(String(currentGoal));
      setError(null);
    }
  }, [open, currentGoal]);

  const save = async () => {
    if (memberId == null) return;
    const parsed = Number.parseInt(goal, 10);
    if (Number.isNaN(parsed) || parsed < 0) {
      setError("Monthly goal must be a whole number of 0 or more.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/backend/auth/team/members/${memberId}/goal`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: user.company_id,
          requester_user_id: user.id,
          monthly_goal: parsed,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not save monthly goal");
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save monthly goal");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit monthly goal</DialogTitle>
          <DialogDescription>
            Update {memberName}&apos;s standing monthly bid target.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="member-goal">Monthly goal</Label>
          <Input
            id="member-goal"
            type="number"
            min={0}
            step={1}
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
            }}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={save} disabled={loading || memberId == null}>
            {loading ? "Saving..." : "Save goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
