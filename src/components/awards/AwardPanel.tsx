"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, CircleDashed, Clock3, Search, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/pipeline";
import {
  AWARD_OUTCOMES,
  formatCheckpoint,
  formatOutcomeLabel,
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
  const [lookupFault, setLookupFault] = useState<string | null>(null);
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
    setLookupFault(null);
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
    setLookupFault(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/backend/pipeline/bids/${bidId}/award-lookup`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || `SAM.gov lookup failed (${response.status}).`);
      setAward(data.award);
      const info = data.award.sam_info;
      if (info?.result === "error" || info?.result === "deferred") {
        const message = info.message || "SAM.gov lookup did not complete. Manual entry still works.";
        setLookupFault(message);
        setError(message);
      } else {
        setNotice(info?.result === "found" ? "SAM.gov award information found." : "No published award found on SAM.gov yet.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "SAM.gov lookup failed.";
      setLookupFault(message);
      setError(message);
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
  const lookupLine = award.lookup.eligible
    ? `${award.lookup.remaining_today} of ${award.lookup.daily_budget} SAM.gov requests left today.`
    : award.lookup.reason;
  const limitReached = award.lookup.eligible && award.lookup.remaining_today <= 0;
  const lostError = Boolean(error && outcome === "lost");
  const submittedLabel = award.submitted_on
    ? new Date(`${award.submitted_on}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).toUpperCase()
    : null;

  return (
    <section className="cf-card" aria-labelledby="award-h" style={{ padding: "22px 24px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h2 id="award-h" className="cf-h2" style={{ fontSize: 20 }}>Award tracking</h2>
        <span className="cf-mono cf-meta">
          {submittedLabel ? `SUBMITTED ${submittedLabel} · ` : ""}{award.checkpoints_completed} OF {award.checkpoints_total || 4} CHECKS RECORDED
        </span>
      </div>
      <span className="sr-only">{formatCheckpoint(award)}</span>

      {award.flagged && (
        <div role="alert" className="cf-note cf-note-bad">
          <span style={{ fontWeight: 500, color: "#BE123C" }}>90 days since submission with no award outcome logged. Record the 90-day check.</span>
        </div>
      )}

      {award.tracked ? (
        <ol aria-label="Award checkpoints" style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(150px, 100%), 1fr))", gap: 12 }}>
          {award.checkpoints.map((cp) => {
            const due = cp.state === "due" || cp.state === "missed";
            return (
              <li key={cp.id} className={`cf-cp${due ? " cf-cp-due" : ""}`} data-state={cp.state}>
                <span style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 500 }}>
                  {checkpointIcon(cp)}{cp.checkpoint_days}-day check
                </span>
                <span className="cf-mono cf-meta" style={due ? { fontWeight: 500, color: "#B45309", textTransform: "uppercase" } : undefined}>{checkpointStateLabel(cp)}</span>
                {cp.award_status ? <span className="cf-meta">Recorded: {formatOutcomeLabel(cp.award_status)}</span> : null}
              </li>
            );
          })}
        </ol>
      ) : (
        <p className="cf-sub">Submitted before checkpoint tracking started ({award.tracking_start_date}). The outcome can still be recorded.</p>
      )}

      <div className={`cf-note ${info?.result === "found" ? "cf-note-ok" : limitReached ? "cf-note-warn" : lookupFault ? "cf-note-bad" : "cf-note-plain"}`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {info?.result === "found" ? (
            <span style={{ fontWeight: 500, color: "#047857" }}>Award found on SAM.gov</span>
          ) : info?.result === "not_found" ? (
            <span style={{ fontWeight: 500 }}>No award posted yet on SAM.gov</span>
          ) : limitReached ? (
            <span style={{ fontWeight: 500, color: "#B45309" }}>Daily SAM.gov lookup limit reached</span>
          ) : lookupFault ? (
            <span style={{ fontWeight: 500, color: "#BE123C" }}>SAM.gov didn&apos;t respond</span>
          ) : (
            <span style={{ fontWeight: 500 }}>Look up the award on SAM.gov</span>
          )}
          <span className="cf-meta" style={{ fontSize: 13 }}>{lookupFault || lookupLine}</span>
        </div>
        {canRecord ? (
          <button type="button" className="cf-btn cf-btn-secondary" onClick={checkSam}
            disabled={checking || !award.lookup.eligible || award.lookup.remaining_today <= 0}>
            <Search size={16} />{checking ? "Checking…" : "Check SAM.gov now"}
          </button>
        ) : null}
      </div>

      {info?.result === "found" && (
        <div data-testid="sam-award-info" className="cf-note cf-note-ok" style={{ alignItems: "flex-start" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <p>Awarded to <strong>{info.awardee_name || "—"}</strong>{info.awardee_uei ? ` (UEI ${info.awardee_uei})` : ""} for <strong>{formatMoney(info.amount)}</strong></p>
            <p className="cf-meta">Signed {info.date_signed || "—"} · PIID {info.piid || "—"} · source {info.api === "opportunities" ? "award notice" : "Contract Awards"}</p>
            {info.message && (
              <div role="note" className="cf-note cf-note-warn" style={{ marginTop: 8 }}>
                <div>
                  <p>{info.message}</p>
                  <ul className="mt-1 list-disc pl-4">
                    {info.candidates.slice(0, 5).map((c, index) => (
                      <li key={`${c.piid}-${index}`}>{c.awardee_name || "—"} · {formatMoney(c.amount)} · {c.date_signed?.slice(0, 10) || "—"} · PIID {c.piid || "—"}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
          {canRecord ? <button type="button" className="cf-btn cf-btn-primary" onClick={useSamValues}>Use these values</button> : null}
        </div>
      )}
      {info && info.result !== "found" && info.result !== "not_found" ? (
        <p className="cf-meta">Last check: {info.message}</p>
      ) : null}

      {award.award_outcome === "lost" && (award.awarded_to || award.awarded_amount != null) && (
        <p className="cf-sub">Awarded to <strong>{award.awarded_to || "—"}</strong> for <strong>{formatMoney(award.awarded_amount)}</strong></p>
      )}

      {canRecord ? (
        <form noValidate style={{ display: "flex", flexDirection: "column", gap: 18 }} onSubmit={(event) => { event.preventDefault(); save(); }} aria-label="Record award outcome">
          <fieldset style={{ border: 0, margin: 0, padding: 0 }}>
            <legend style={{ fontSize: 14, fontWeight: 500, padding: 0, marginBottom: 10 }}>Was the bid awarded?</legend>
            <p className="cf-meta" style={{ marginBottom: 10 }}>AMAFHH customer award only. Accepting a supplier quote does not set Won, Lost, Pending, or Unknown.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
              {AWARD_OUTCOMES.map((value) => (
                <label key={value} className={`cf-choice${outcome === value ? " cf-choice-on" : ""}`}>
                  <input type="radio" name={`outcome-${bidId}`} value={value} checked={outcome === value} onChange={() => setOutcome(value)} />
                  {formatOutcomeLabel(value)}
                </label>
              ))}
            </div>
          </fieldset>
          {(showWinner || showAmount) && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: 16, padding: 16, borderRadius: 12, border: `1px solid ${lostError ? "rgba(251,113,133,.3)" : outcome === "won" ? "rgba(52,211,153,.3)" : "var(--cf-line)"}`, background: lostError ? "rgba(251,113,133,.04)" : outcome === "won" ? "rgba(52,211,153,.04)" : "transparent" }}>
              {showWinner && (
                <label className="cf-field">Awarded to
                  <Input value={awardedTo} onChange={(e) => setAwardedTo(e.target.value)} placeholder="Winning company" maxLength={255} />
                </label>
              )}
              {showAmount && (
                <label className="cf-field">{outcome === "lost" ? "Winning amount" : "Award amount (optional)"}
                  <Input type="number" min="0" step="0.01" value={awardedAmount} onChange={(e) => setAwardedAmount(e.target.value)} />
                </label>
              )}
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))", gap: 16 }}>
            <label className="cf-field">Checkpoint
              <select aria-label="Checkpoint" className="cf-select" value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value={NO_CHECKPOINT}>Update outcome only</option>
                {dueCheckpoints.map((cp) => (
                  <option key={cp.id} value={String(cp.checkpoint_days)}>{cp.checkpoint_days}-day check</option>
                ))}
              </select>
            </label>
            <label className="cf-field">Checked on
              <Input type="date" value={checkedOn} max={todayEastern()} onChange={(e) => setCheckedOn(e.target.value)} />
            </label>
          </div>
          <label className="cf-field">Notes
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="What did you find? e.g. no award posted yet on SAM.gov" />
          </label>
          {error && <p role="alert" className="cf-err">{error}</p>}
          {notice && <p role="status" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontWeight: 500, color: "#047857" }}>{notice}</p>}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
            <button type="submit" className="cf-btn cf-btn-primary" disabled={saving}>{saving ? "Saving…" : "Save outcome"}</button>
            <a className="cf-btn cf-btn-secondary" href="/my-bids">Cancel</a>
          </div>
        </form>
      ) : (
        <>
          {error && <p role="alert" className="cf-err">{error}</p>}
          <p className="cf-sub">Only the bid owner or a manager can record the outcome.</p>
        </>
      )}

      {award.history.length > 0 && (
        <div>
          <h3 className="cf-h3">Outcome history</h3>
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
                <p className="cf-meta">
                  {entry.changed_by_name || "Unknown"} · {new Date(entry.changed_at).toLocaleString("en-US", { timeZone: "America/New_York" })}
                  {entry.notes ? ` · ${entry.notes}` : ""}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
