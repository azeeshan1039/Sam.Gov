"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { requestJson } from "@/lib/emails";

interface RuleDef { key: string; field: string; default_weight: number; label: string }
interface SettingsResponse {
  settings: {
    rules: Record<string, { enabled: boolean; weight: number }>;
    warn_threshold: number;
    hold_threshold: number;
    hold_high_risk: boolean;
    trigger_words: string[];
  };
  rules: RuleDef[];
  default_trigger_words: string[];
  disclaimer: string;
}

/** Admin-only configuration of the pre-send spam-risk rules and thresholds (KAN-78). */
export function DeliverabilitySettingsCard() {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [rules, setRules] = useState<Record<string, { enabled: boolean; weight: number }>>({});
  const [warn, setWarn] = useState("");
  const [hold, setHold] = useState("");
  const [holdHigh, setHoldHigh] = useState(true);
  const [words, setWords] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((body: SettingsResponse) => {
    setData(body);
    setRules(body.settings.rules);
    setWarn(String(body.settings.warn_threshold));
    setHold(String(body.settings.hold_threshold));
    setHoldHigh(body.settings.hold_high_risk);
    setWords(body.settings.trigger_words.join(", "));
  }, []);

  useEffect(() => {
    requestJson<SettingsResponse>("/api/backend/emails/deliverability-settings").then(({ ok, data: body }) => {
      if (ok) apply(body); else setError(body.error || "Unable to load spam-check settings.");
    });
  }, [apply]);

  async function save() {
    setMessage(null);
    setError(null);
    const { ok, data: body } = await requestJson<SettingsResponse>("/api/backend/emails/deliverability-settings", {
      method: "PUT",
      body: JSON.stringify({
        warn_threshold: Number(warn),
        hold_threshold: Number(hold),
        hold_high_risk: holdHigh,
        rules,
        trigger_words: words.split(",").map((w) => w.trim()).filter(Boolean),
      }),
    });
    if (!ok) { setError(body.error || "Unable to save."); return; }
    apply(body);
    setMessage("Spam-check settings saved. They apply to every check from now on.");
  }

  if (!data) return <Card><CardHeader><CardTitle>Spam-risk check</CardTitle></CardHeader><CardContent className="text-sm text-slate-600">{error || "Loading…"}</CardContent></Card>;

  return (
    <Card>
      <CardHeader><CardTitle>Spam-risk check</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm">
        <p className="text-slate-600">Each rule that matches adds its weight to the score. At the warning threshold the sender must confirm before sending; at the hold threshold the message is held for admin review when holding is on. {data.disclaimer}</p>
        <div className="flex flex-wrap items-end gap-4">
          <label className="grid gap-1">Warning threshold<Input aria-label="Warning threshold" type="number" min={0} className="w-28" value={warn} onChange={(e) => setWarn(e.target.value)} /></label>
          <label className="grid gap-1">Hold threshold<Input aria-label="Hold threshold" type="number" min={1} className="w-28" value={hold} onChange={(e) => setHold(e.target.value)} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={holdHigh} onChange={(e) => setHoldHigh(e.target.checked)} />Hold high-risk messages for admin review</label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="border-b text-xs uppercase text-slate-600"><th className="py-2">On</th><th>Rule</th><th>Area</th><th>Weight</th></tr></thead>
            <tbody>
              {data.rules.map((rule) => (
                <tr key={rule.key} className="border-b">
                  <td className="py-2"><input type="checkbox" aria-label={`Enable ${rule.label}`} checked={rules[rule.key]?.enabled ?? true}
                    onChange={(e) => setRules({ ...rules, [rule.key]: { ...rules[rule.key], enabled: e.target.checked } })} /></td>
                  <td>{rule.label}</td>
                  <td className="capitalize text-slate-600">{rule.field}</td>
                  <td><Input aria-label={`Weight for ${rule.label}`} type="number" min={0} className="h-8 w-20" value={rules[rule.key]?.weight ?? rule.default_weight}
                    onChange={(e) => setRules({ ...rules, [rule.key]: { ...rules[rule.key], weight: Number(e.target.value) } })} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <label className="grid gap-1">Promotional words and phrases (comma separated)
          <Textarea aria-label="Promotional words" rows={3} value={words} onChange={(e) => setWords(e.target.value)} />
        </label>
        {message && <p role="status" className="text-emerald-700">{message}</p>}
        {error && <p role="alert" className="text-red-700">{error}</p>}
        <div className="flex gap-2">
          <Button onClick={save}>Save settings</Button>
          <Button variant="outline" onClick={() => setWords(data.default_trigger_words.join(", "))}>Restore default words</Button>
        </div>
      </CardContent>
    </Card>
  );
}
