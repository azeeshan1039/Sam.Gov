"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface ChipInputProps {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  maxLength?: number;
  /** Optional input validator — return null to accept, string to reject with that message. */
  validate?: (raw: string) => string | null;
}

export function ChipInput({
  values,
  onChange,
  placeholder,
  maxLength = 100,
  validate,
}: ChipInputProps) {
  const [draft, setDraft] = React.useState("");
  const [err, setErr] = React.useState<string | null>(null);

  const commit = () => {
    const raw = draft.trim();
    if (!raw) return;
    if (values.length >= maxLength) {
      setErr(`Max ${maxLength} values.`);
      return;
    }
    if (validate) {
      const v = validate(raw);
      if (v) {
        setErr(v);
        return;
      }
    }
    if (values.includes(raw)) {
      setDraft("");
      return;
    }
    onChange([...values, raw]);
    setDraft("");
    setErr(null);
  };

  const remove = (i: number) => {
    const next = values.slice();
    next.splice(i, 1);
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      <Input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          setDraft(e.target.value);
          if (err) setErr(null);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          } else if (e.key === "Backspace" && !draft && values.length > 0) {
            remove(values.length - 1);
          }
        }}
        onBlur={commit}
      />
      {err && <p className="text-xs text-destructive">{err}</p>}
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {values.map((v, i) => (
            <Badge
              key={`${v}-${i}`}
              variant="secondary"
              className="gap-1 pr-1"
            >
              <span className="font-mono text-[11px]">{v}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="rounded-full p-0.5 hover:bg-background/50"
                aria-label={`Remove ${v}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
