"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDashed, Clock3, Search, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/pipeline";
import {
  AWARD_OUTCOMES,
  formatCheckpoint,
  formatOutcomeLabel,
  outcomeBadgeClass,
  type AwardCheckpoint,
  type AwardDetail,
  type AwardOutcome,
} from "@/lib/awards";

const NO_CHECKPOINT = "none";

function todayEastern() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
}

function checkpointIcon(checkpoint: AwardCheckpoint) {
  if (checkpoint.state === "completed") return <CheckCircle2 className="h-4 w-4 text-emerald-600" aria-hidden />;
  if (checkpoint.state === "closed") return <XCircle className="h-4 w-4 text-slate-400" aria-hidden />;
  if (checkpoint.state === "due" || checkpoint.state === "missed") return <Clock3 className="h-4 w-4 text-amber-600" aria-hidden />;
  return <CircleDashed className="h-4 w-4 text-slate-400" aria-hidden />;
}

function checkpointStateLabel(checkpoint: AwardCheckpoint) {
  switch (checkpoint.state) {
    case "completed": return `Checked ${checkpoint.checked_on ?? ""}${checkpoint.checked_by_name ? ` by ${checkpoint.checked_by_name}` : ""}`;
    case "closed": return "Not needed (outcome known)";
    case "due": return "Due now";
    case "missed": return "Missed";
    default: return `Due ${checkpoint.due_on}`;
  }
}

/**
 * Award outcome and 30/45/60/90-day checkpoint workflow for one submitted bid
 * (KAN-63/64/65/66, SAM.gov award info KAN-69).
 */
export function AwardPanel({
  bidId,
  focusCheckpoint,
  onSaved,
}: {
  bidId: number;
  focusCheckpoint?: number | null;
  onSaved?: (award: AwardDetail) => void;
}) {
  const [award, setAward] = useState<AwardDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<AwardOutcome>("pending");
  const [awardedTo, setAwardedTo] = useState("");
  const [awardedAmount, setAwardedAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [checkedOn, setCheckedOn] = useState(todayEastern());
  const [target, setTarget] = useState<string>(NO_CHECKPOINT);
  const [lookupId, setLookupId] = useState<number | null>(null);

  const applyAward = useCallback((data: AwardDetail) => {
    setAward(data);
    setOutcome(data.award_outcome);
    setAwardedTo(data.awarded_to ?? "");
    setAwardedAmount(data.awarded_amount != null ? String(data.awarded_amount) : "");
    setNotes(data.outcome_notes ?? "");
    setLookupId(null);
    const dueDays = data.checkpoints
      .filter((cp) => cp.state === "due" || cp.state === "missed")
      .map((cp) => cp.checkpoint_days);
    if (focusCheckpoint && dueDays.includes(focusCheckpoint)) setTarget(String(focusCheckpoint));
    else if (data.current_checkpoint?.state === "due") setTarget(String(data.current_checkpoint.checkpoint_days));
    else setTarget(NO_CHECKPOINT);
  }, [focusCheckpoint]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/backend/pipeline/bids/${bidId}/award-checkpoints`, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Unable to load award tracking (${response.status}).`);
      applyAward(data.award);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load award tracking.");
    } finally {
      setLoading(false);
    }
  }, [applyAward, bidId]);

  useEffect(() => { load(); }, [load]);

  const dueCheckpoints = useMemo(
    () => (award?.checkpoints ?? []).filter((cp) => cp.state === "due" || cp.state === "missed"),
    [award],
  );

  const showWinner = outcome === "lost";
  const showAmount = outcome === "lost" || outcome === "won";

  function validate(): string | null {
    if (awardedAmount.trim() && (Number.isNaN(Number(awardedAmount)) || Number(awardedAmount) < 0)) {
      return "Awarded amount must be a positive number.";
    }
    if (checkedOn && checkedOn > todayEastern()) return "Checked on cannot be in the future.";
    if (checkedOn && award?.submitted_on && checkedOn < award.submitted_on) {
      return "Checked on cannot be before the submission date.";
    }
    return null;
  }

  async function save() {
    const invalid = validate();
    if (invalid) {
      setError(invalid);
      return;
    }
    setSaving(true);
    setError(null);
    setNotice(null);
    const url = target === NO_CHECKPOINT
      ? `/api/backend/pipeline/bids/${bidId}/award-outcome`
      : `/api/backend/pipeline/bids/${bidId}/award-checkpoints/${target}`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          award_outcome: outcome,
          awarded_to: showWinner ? awardedTo : "",
          awarded_amount: showAmount ? awardedAmount : "",
          notes,
          checked_on: checkedOn,
          lookup_id: lookupId,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `Unable to save the outcome (${response.status}).`);
      applyAward(data.award);
      setNotice(target === NO_CHECKPOINT ? "Award outcome saved." : `${target}-day check recorded.`);
      onSaved?.(data.award);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save the outcome.");
    } finally {
      setSaving(false);
    }
  }

  async function checkSam() {
    setChecking(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/backend/pipeline/bids/${bidId}/award-lookup`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `SAM.gov lookup failed (${response.status}).`);
      setAward(data.award);
      const info = data.award.sam_info;
      if (info?.result === "error" || info?.result === "deferred") {
        setError(info.message || "SAM.gov lookup did not complete. Manual entry still works.");
      } else {
        setNotice(info?.result === "found" ? "SAM.gov award information found." : "No published award found on SAM.gov yet.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "SAM.gov lookup failed.");
    } finally {
      setChecking(false);
    }
  }

  function useSamValues() {
    const info = award?.sam_info;
    if (!info || info.result !== "found") return;
    setAwardedTo(info.awardee_name ?? "");
    setAwardedAmount(info.amount != null ? String(info.amount) : "");
    setLookupId(info.id);
    setNotice(outcome === "won" || outcome === "lost"
      ? "SAM.gov values filled in. Review and save."
      : "SAM.gov values filled in. Choose Won or Lost, then save.");
  }

  if (loading && !award) return <p className="text-sm text-slate-600">Loading award tracking…</p>;
  if (!award) return <p role="alert" className="text-sm text-destructive">{error}</p>;

  const info = award.sam_info;
  const canRecord = award.can_record !== false;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${outcomeBadgeClass(award.award_outcome)}`}>
          {formatOutcomeLabel(award.award_outcome)}
        </span>
        {award.award_outcome === "lost" && (award.awarded_to || award.awarded_amount != null) && (
          <span className="text-sm">Awarded to <strong>{award.awarded_to || "—"}</strong> for <strong>{formatMoney(award.awarded_amount)}</strong></span>
        )}
        {award.award_outcome === "won" && award.awarded_amount != null && (
          <span className="text-sm">Award amount <strong>{formatMoney(award.awarded_amount)}</strong></span>
        )}
        <span className="text-sm text-slate-600">{formatCheckpoint(award)}</span>
      </div>

      {award.flagged && (
        <div role="alert" className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800">
          90 days since submission with no award outcome logged. Record the 90-day check.
        </div>
      )}

      {award.tracked ? (
        <ol className="grid gap-2 sm:grid-cols-4" aria-label="Award checkpoints">
          {award.checkpoints.map((cp) => (
            <li key={cp.id} className="rounded-md border p-3 text-sm" data-state={cp.state}>
              <div className="flex items-center gap-2 font-medium">{checkpointIcon(cp)}{cp.checkpoint_days}-day check</div>
              <p className="mt-1 text-xs text-slate-600">{checkpointStateLabel(cp)}</p>
              {cp.award_status && <p className="mt-1 text-xs">Recorded: {formatOutcomeLabel(cp.award_status)}</p>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-slate-600">
          Submitted before checkpoint tracking started ({award.tracking_start_date}). The outcome can still be recorded.
        </p>
      )}

      <div className="rounded-md border bg-slate-50 p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">SAM.gov award information</p>
          {canRecord && (
            <Button type="button" size="sm" variant="outline" onClick={checkSam}
              disabled={checking || !award.lookup.eligible || award.lookup.remaining_today <= 0}>
              <Search className="mr-1 h-4 w-4" />{checking ? "Checking…" : "Check SAM.gov now"}
            </Button>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-600">
          {award.lookup.eligible
            ? `${award.lookup.remaining_today} of ${award.lookup.daily_budget} SAM.gov requests left today.`
            : award.lookup.reason}
        </p>
        {info?.result === "found" && (
          <div className="mt-2 space-y-1" data-testid="sam-award-info">
            <p>Awarded to <strong>{info.awardee_name || "—"}</strong>{info.awardee_uei ? ` (UEI ${info.awardee_uei})` : ""} for <strong>{formatMoney(info.amount)}</strong></p>
            <p className="text-xs text-slate-600">Signed {info.date_signed || "—"} · PIID {info.piid || "—"} · source {info.api === "opportunities" ? "award notice" : "Contract Awards"}</p>
            {info.message && (
              <div role="note" className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                <p>{info.message}</p>
                <ul className="mt-1 list-disc pl-4">
                  {info.candidates.slice(0, 5).map((c, index) => (
                    <li key={`${c.piid}-${index}`}>{c.awardee_name || "—"} · {formatMoney(c.amount)} · {c.date_signed?.slice(0, 10) || "—"} · PIID {c.piid || "—"}</li>
                  ))}
                </ul>
              </div>
            )}
            {canRecord && (
              <Button type="button" size="sm" variant="secondary" onClick={useSamValues}>Use these values</Button>
            )}
          </div>
        )}
        {info && info.result !== "found" && (
          <p className="mt-2 text-xs">Last check: {info.result === "not_found" ? "no published award yet" : info.message}</p>
        )}
      </div>

      {canRecord ? (
        <form
          noValidate
          className="grid gap-3 md:grid-cols-2"
          onSubmit={(event) => { event.preventDefault(); save(); }}
          aria-label="Record award outcome"
        >
          <fieldset className="md:col-span-2">
            <legend className="mb-2 text-sm font-medium">Was the bid awarded?</legend>
            <div className="flex flex-wrap gap-2">
              {AWARD_OUTCOMES.map((value) => (
                <label key={value} className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${outcome === value ? outcomeBadgeClass(value) : ""}`}>
                  <input type="radio" name={`outcome-${bidId}`} value={value} checked={outcome === value}
                    onChange={() => setOutcome(value)} />
                  {formatOutcomeLabel(value)}
                </label>
              ))}
            </div>
          </fieldset>
          {showWinner && (
            <label className="grid gap-1 text-sm">Awarded to
              <Input value={awardedTo} onChange={(e) => setAwardedTo(e.target.value)} placeholder="Winning company" maxLength={255} />
            </label>
          )}
          {showAmount && (
            <label className="grid gap-1 text-sm">{outcome === "lost" ? "Winning amount" : "Award amount (optional)"}
              <Input type="number" min="0" step="0.01" value={awardedAmount} onChange={(e) => setAwardedAmount(e.target.value)} />
            </label>
          )}
          <label className="grid gap-1 text-sm">Checkpoint
            <select aria-label="Checkpoint" className="h-10 rounded-md border bg-background px-3" value={target}
              onChange={(e) => setTarget(e.target.value)}>
              <option value={NO_CHECKPOINT}>Update outcome only</option>
              {dueCheckpoints.map((cp) => (
                <option key={cp.id} value={String(cp.checkpoint_days)}>{cp.checkpoint_days}-day check</option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm">Checked on
            <Input type="date" value={checkedOn} max={todayEastern()} onChange={(e) => setCheckedOn(e.target.value)} />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2">Notes
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </label>
          {error && <p role="alert" className="text-sm text-destructive md:col-span-2">{error}</p>}
          {notice && <p role="status" className="text-sm text-emerald-700 md:col-span-2">{notice}</p>}
          <div className="md:col-span-2">
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save outcome"}</Button>
          </div>
        </form>
      ) : (
        <>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <p className="text-sm text-slate-600">Only the bid owner or a manager can record the outcome.</p>
        </>
      )}

      {award.history.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Outcome history</h3>
          <ol className="space-y-2 text-sm">
            {award.history.map((entry) => (
              <li key={entry.id} className="border-l-2 pl-3">
                <p>
                  {formatOutcomeLabel(entry.old_outcome)} → <strong>{formatOutcomeLabel(entry.new_outcome)}</strong>
                  {entry.checkpoint_days ? ` · ${entry.checkpoint_days}-day check` : ""}
                  {entry.awarded_to ? ` · ${entry.awarded_to}` : ""}
                  {entry.awarded_amount != null ? ` · ${formatMoney(entry.awarded_amount)}` : ""}
                  {entry.source === "sam_values" ? " · from SAM.gov" : ""}
                </p>
                <p className="text-xs text-slate-600">
                  {entry.changed_by_name || "Unknown"} · {new Date(entry.changed_at).toLocaleString("en-US", { timeZone: "America/New_York" })}
                  {entry.notes ? ` · ${entry.notes}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
