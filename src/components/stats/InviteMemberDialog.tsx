"use client";

import { useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
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

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: AuthUser;
  onInvited: () => void;
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  user,
  onInvited,
}: InviteMemberDialogProps) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slotsRemaining, setSlotsRemaining] = useState<number | null>(null);
  const [maxSlots, setMaxSlots] = useState<number>(5);

  useEffect(() => {
    if (!open) return;
    setEmail("");
    setError(null);
    const load = async () => {
      try {
        const res = await fetch(
          `/api/backend/auth/team?company_id=${user.company_id}&requester_user_id=${user.id}`,
          { cache: "no-store" }
        );
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          setSlotsRemaining(data.slots_remaining ?? 0);
          setMaxSlots(data.max_team_members ?? 5);
        }
      } catch {
        setSlotsRemaining(null);
      }
    };
    load();
  }, [open, user.company_id, user.id]);

  const sendInvite = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/backend/auth/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: user.company_id,
          requester_user_id: user.id,
          emails: [email.trim()],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Could not send invite");
      }
      if (Array.isArray(data.errors) && data.errors.length > 0) {
        throw new Error(data.errors[0].error || "Could not send invite");
      }
      onInvited();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send invite");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add team member</DialogTitle>
          <DialogDescription>
            {slotsRemaining == null
              ? "Send an invite email. They appear on Stats after they accept."
              : `${slotsRemaining} of ${maxSlots} member slots remaining. They appear on Stats after they accept.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="member@company.com"
            onKeyDown={(e) => {
              if (e.key === "Enter") sendInvite();
            }}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button
            onClick={sendInvite}
            disabled={loading || !email.trim() || slotsRemaining === 0}
          >
            <UserPlus className="h-4 w-4" />
            {loading ? "Sending..." : "Send invite"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
