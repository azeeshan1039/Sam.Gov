"use client";

import * as React from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ChipInput } from "./ChipInput";
import {
  ANY_VALUE,
  EXTENT_COMPETED_OPTIONS,
  FISCAL_YEAR_OPTIONS,
  PRICING_TYPE_OPTIONS,
  SET_ASIDE_OPTIONS,
  US_STATES,
} from "./selectOptions";
import {
  EMPTY_FILTERS,
  type ContractAwardFilters,
} from "@/types/contract-awards";

interface FilterRailProps {
  value: ContractAwardFilters;
  onChange: (next: ContractAwardFilters) => void;
  onApply: () => void;
  onReset: () => void;
  busy: boolean;
}

function Section({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="border-b border-slate-200 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 hover:text-slate-900"
      >
        <span>{title}</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`}
        />
      </button>
      {open && <div className="space-y-3 px-4 pb-4">{children}</div>}
    </div>
  );
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-medium text-slate-700">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}

export function FilterRail({ value, onChange, onApply, onReset, busy }: FilterRailProps) {
  const set = <K extends keyof ContractAwardFilters>(
    k: K,
    v: ContractAwardFilters[K]
  ) => onChange({ ...value, [k]: v });

  const selectVal = (k: keyof ContractAwardFilters) =>
    (value[k] as string) || ANY_VALUE;
  const onSelect = (k: keyof ContractAwardFilters) => (v: string) =>
    set(k, (v === ANY_VALUE ? "" : v) as any);

  return (
    <aside className="w-80 shrink-0 border-r border-slate-200 bg-white overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-slate-200 bg-white px-3 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="mr-auto text-sm font-semibold text-slate-900">Filters</h2>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onReset}
            disabled={busy}
            title="Reset all filters"
            className="h-8 w-8 p-0"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={onApply}
            disabled={busy}
            className="h-8"
          >
            {busy ? "Querying…" : "Apply"}
          </Button>
        </div>
      </div>

      <Section title="Search">
        <Field label="Keyword" hint="Free-text across all fields.">
          <Input
            value={value.q}
            placeholder="e.g. freezer, x-ray, software"
            onChange={(e) => set("q", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Dates">
        <Field label="Date signed">
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={value.dateSignedFrom}
              onChange={(e) => set("dateSignedFrom", e.target.value)}
            />
            <span className="text-xs text-slate-500">to</span>
            <Input
              type="date"
              value={value.dateSignedTo}
              onChange={(e) => set("dateSignedTo", e.target.value)}
            />
          </div>
        </Field>
        <Field label="Current completion date">
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={value.currentCompletionDateFrom}
              onChange={(e) => set("currentCompletionDateFrom", e.target.value)}
            />
            <span className="text-xs text-slate-500">to</span>
            <Input
              type="date"
              value={value.currentCompletionDateTo}
              onChange={(e) => set("currentCompletionDateTo", e.target.value)}
            />
          </div>
        </Field>
        <Field label="Fiscal year">
          <Select
            value={selectVal("fiscalYear")}
            onValueChange={onSelect("fiscalYear")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>Any year</SelectItem>
              {FISCAL_YEAR_OPTIONS.map((y) => (
                <SelectItem key={y} value={y}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title="Dollar amounts">
        <Field label="Dollars obligated">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="Min"
              value={value.dollarsObligatedMin}
              onChange={(e) => set("dollarsObligatedMin", e.target.value)}
            />
            <span className="text-xs text-slate-500">to</span>
            <Input
              type="number"
              placeholder="Max"
              value={value.dollarsObligatedMax}
              onChange={(e) => set("dollarsObligatedMax", e.target.value)}
            />
          </div>
        </Field>
        <Field label="Total ultimate contract value">
          <div className="flex items-center gap-2">
            <Input
              type="number"
              placeholder="Min"
              value={value.totalUltimateContractValueMin}
              onChange={(e) =>
                set("totalUltimateContractValueMin", e.target.value)
              }
            />
            <span className="text-xs text-slate-500">to</span>
            <Input
              type="number"
              placeholder="Max"
              value={value.totalUltimateContractValueMax}
              onChange={(e) =>
                set("totalUltimateContractValueMax", e.target.value)
              }
            />
          </div>
        </Field>
      </Section>

      <Section title="Classification">
        <Field label="NAICS code(s)" hint="Press Enter to add (max 100).">
          <ChipInput
            values={value.naicsCode}
            onChange={(v) => set("naicsCode", v)}
            placeholder="e.g. 541512"
            validate={(s) =>
              /^\d{2,6}$/.test(s) ? null : "NAICS must be 2-6 digits."
            }
          />
        </Field>
        <Field label="PSC code(s)" hint="Press Enter to add (max 100).">
          <ChipInput
            values={value.productOrServiceCode}
            onChange={(v) => set("productOrServiceCode", v)}
            placeholder="e.g. 7030"
            validate={(s) =>
              /^[A-Z0-9]{4}$/i.test(s)
                ? null
                : "PSC is a 4-character code."
            }
          />
        </Field>
        <Field label="Product or service">
          <Select
            value={selectVal("productOrServiceType")}
            onValueChange={onSelect("productOrServiceType")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>Any</SelectItem>
              <SelectItem value="SERVICE">Service</SelectItem>
              <SelectItem value="PRODUCT">Product</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Award or IDV">
          <Select
            value={selectVal("awardOrIDV")}
            onValueChange={onSelect("awardOrIDV")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>Any</SelectItem>
              <SelectItem value="Award">Award</SelectItem>
              <SelectItem value="IDV">IDV</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </Section>

      <Section title="Awardee">
        <Field label="Legal business name">
          <Input
            value={value.awardeeLegalBusinessName}
            placeholder="Partial match"
            onChange={(e) =>
              set("awardeeLegalBusinessName", e.target.value)
            }
          />
        </Field>
        <Field label="UEI(s)" hint="12-character SAM identifier.">
          <ChipInput
            values={value.awardeeUniqueEntityId}
            onChange={(v) => set("awardeeUniqueEntityId", v)}
            placeholder="e.g. ABC123DEF456"
            validate={(s) =>
              /^[A-Z0-9]{12}$/i.test(s) ? null : "UEI is 12 chars."
            }
          />
        </Field>
        <Field label="CAGE code(s)">
          <ChipInput
            values={value.awardeeCageCode}
            onChange={(v) => set("awardeeCageCode", v)}
            placeholder="e.g. 1A2B3"
            validate={(s) =>
              /^[A-Z0-9]{5}$/i.test(s) ? null : "CAGE is 5 chars."
            }
          />
        </Field>
        <Field label="State">
          <Select
            value={selectVal("awardeeStateCode")}
            onValueChange={onSelect("awardeeStateCode")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>Any state</SelectItem>
              {US_STATES.map((s) => (
                <SelectItem key={s.code} value={s.code}>
                  {s.code} — {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="City">
          <Input
            value={value.awardeeCityName}
            onChange={(e) => set("awardeeCityName", e.target.value)}
          />
        </Field>
        <Field label="ZIP">
          <Input
            value={value.awardeeZipCode}
            onChange={(e) => set("awardeeZipCode", e.target.value)}
            placeholder="5 or 9 digits"
          />
        </Field>
        <Field label="Country code" hint="3-char ISO code (e.g. USA).">
          <Input
            value={value.awardeeCountryCode}
            onChange={(e) =>
              set("awardeeCountryCode", e.target.value.toUpperCase())
            }
            maxLength={3}
          />
        </Field>
      </Section>

      <Section title="Place of performance" defaultOpen={false}>
        <Field label="State">
          <Select
            value={selectVal("placeOfPerformStateCode")}
            onValueChange={onSelect("placeOfPerformStateCode")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any state" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>Any state</SelectItem>
              {US_STATES.map((s) => (
                <SelectItem key={s.code} value={s.code}>
                  {s.code} — {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="City">
          <Input
            value={value.placeOfPerformCityName}
            onChange={(e) => set("placeOfPerformCityName", e.target.value)}
          />
        </Field>
        <Field label="ZIP">
          <Input
            value={value.placeOfPerformZipCode}
            onChange={(e) => set("placeOfPerformZipCode", e.target.value)}
          />
        </Field>
        <Field label="Country code">
          <Input
            value={value.placeOfPerformCountryCode}
            onChange={(e) =>
              set("placeOfPerformCountryCode", e.target.value.toUpperCase())
            }
            maxLength={3}
          />
        </Field>
      </Section>

      <Section title="Agency" defaultOpen={false}>
        <Field label="Contracting subtier">
          <Input
            value={value.contractingSubtierName}
            placeholder="Partial match"
            onChange={(e) => set("contractingSubtierName", e.target.value)}
          />
        </Field>
        <Field label="Funding subtier">
          <Input
            value={value.fundingSubtierName}
            placeholder="Partial match"
            onChange={(e) => set("fundingSubtierName", e.target.value)}
          />
        </Field>
      </Section>

      <Section title="Contract attributes" defaultOpen={false}>
        <Field label="Set-aside">
          <Select
            value={selectVal("typeOfSetAsideName")}
            onValueChange={onSelect("typeOfSetAsideName")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>Any</SelectItem>
              {SET_ASIDE_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Extent competed">
          <Select
            value={selectVal("extentCompetedName")}
            onValueChange={onSelect("extentCompetedName")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>Any</SelectItem>
              {EXTENT_COMPETED_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Pricing type">
          <Select
            value={selectVal("typeOfContractPricingName")}
            onValueChange={onSelect("typeOfContractPricingName")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>Any</SelectItem>
              {PRICING_TYPE_OPTIONS.map((o) => (
                <SelectItem key={o} value={o}>
                  {o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Closed status">
          <Select
            value={selectVal("closedStatus")}
            onValueChange={onSelect("closedStatus")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>Any</SelectItem>
              <SelectItem value="Yes">Closed</SelectItem>
              <SelectItem value="No">Open</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Multi-year contract">
          <Select
            value={selectVal("multiyearContractName")}
            onValueChange={onSelect("multiyearContractName")}
          >
            <SelectTrigger>
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_VALUE}>Any</SelectItem>
              <SelectItem value="Yes">Yes</SelectItem>
              <SelectItem value="No">No</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id="ca-deleted"
            checked={value.includeDeleted}
            onCheckedChange={(c) => set("includeDeleted", c === true)}
          />
          <Label
            htmlFor="ca-deleted"
            className="cursor-pointer text-xs text-slate-700"
          >
            Include records deleted within 6 months
          </Label>
        </div>
      </Section>

    </aside>
  );
}

export { EMPTY_FILTERS };
