"use client";

import { AlertTriangle, CheckCircle2, Info, ShieldAlert } from "lucide-react";
import { riskClass, RISK_DISCLAIMER, type SpamCheckResult } from "@/lib/emails";

const LEVEL_TEXT = {
  low: "Low spam risk",
  medium: "Some spam-risk warnings",
  high: "High spam risk",
} as const;

/**
 * Pre-send spam-risk result (KAN-78). Only reports findings and suggestions;
 * the employee edits the message themselves. Content is never changed here.
 */
export function SpamRiskPanel({ result, stale }: { result: SpamCheckResult; stale?: boolean }) {
  const Icon = result.level === "high" ? ShieldAlert : result.level === "medium" ? AlertTriangle : CheckCircle2;
  return (
    <section aria-label="Spam-risk check" className={`rounded-md border p-3 text-sm ${riskClass(result.level)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <Icon className="h-4 w-4" aria-hidden />
          {LEVEL_TEXT[result.level]} · score {result.score}
        </p>
        <p className="text-xs">Warn at {result.warn_threshold} · hold at {result.hold_threshold}</p>
      </div>
      {stale && (
        <p role="status" className="mt-2 font-medium">The draft changed after this check. Run the check again before sending.</p>
      )}
      {result.will_hold && (
        <p className="mt-2 font-medium">
          If you send it as written, this message will be held until an admin reviews it.
        </p>
      )}
      {result.findings.length === 0 ? (
        <p className="mt-2">No common spam signals were found.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {result.findings.map((finding) => (
            <li key={finding.rule} className="rounded border border-current/20 bg-white/70 p-2 text-slate-900">
              <p className="font-medium">
                <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] uppercase tracking-wide text-slate-600">{finding.field}</span>
                {finding.message}
              </p>
              <p className="mt-1 text-slate-700">Suggestion: {finding.suggestion}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-700">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {result.disclaimer || RISK_DISCLAIMER}
      </p>
    </section>
  );
}
