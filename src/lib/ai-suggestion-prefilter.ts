/**
 * Rule-based pre-filter for SAM.gov opportunities before they're sent to the
 * AI recommendation backend. Purpose: drop clearly-service/installation jobs
 * deterministically so we don't pay LLM tokens scoring them.
 *
 * Signals encode the client's KEEP/DROP guidance:
 *   KEEP  — product RFQ, no install (PSC digit-prefix, NAICS 42xxxx/33xxxx,
 *           "brand name or equal", NSN pattern, "part number")
 *   DROP  — services/labor/install (PSC letter-prefix, NAICS 23/54/561/811,
 *           install/setup/turnkey/training/maintenance/etc. keywords,
 *           wage-determination attachments)
 *
 * Order: DROP signals win — if any fire, we skip the record. Otherwise KEEP
 * or uncertain both proceed (default `true`); we prefer letting the AI make
 * a marginal call over silently dropping a possibly-real product opp.
 */
import type { SamGovOpportunity } from "@/types/sam-gov";

const DROP_KEYWORDS = [
  "install",
  "installation",
  "setup",
  "configure",
  "configuration",
  "integration",
  "turnkey",
  "on-site",
  "on site",
  "mounting",
  "commissioning",
  "deployment",
  "training",
  "maintenance",
  "labor",
  "removal",
  "haul-away",
  "haul away",
];

const DROP_KEYWORD_RE = new RegExp(
  `\\b(?:${DROP_KEYWORDS.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`,
  "i"
);

const DROP_NAICS_PREFIXES = ["23", "54", "561", "811"];
const KEEP_NAICS_PREFIXES = ["42", "33"];

const WAGE_ATTACHMENT_RE = /wage|davis[- ]bacon|sca[- ]?wd|SF ?98/i;

const NSN_RE = /\b\d{4}-\d{2}-\d{3}-\d{4}\b/;
const BRAND_NAME_OR_EQUAL_RE = /brand[- ]name[- ]or[- ]equal/i;
const PART_NUMBER_RE = /\bpart[- ]number\b/i;

function naicsList(ncode: string | undefined): string[] {
  if (!ncode) return [];
  return ncode
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

function anyNaicsStartsWith(codes: string[], prefixes: string[]): boolean {
  return codes.some((c) => prefixes.some((p) => c.startsWith(p)));
}

function attachmentNames(opp: SamGovOpportunity): string[] {
  return (opp.resourceLinks ?? [])
    .map((rl) => (typeof rl === "string" ? rl : rl?.name || ""))
    .filter(Boolean);
}

export function isProductRfq(opp: SamGovOpportunity): boolean {
  const psc = (opp.classificationCode || "").trim();
  const codes = naicsList(opp.ncode);
  const title = opp.title || "";
  const description = opp.description || "";
  const text = `${title}\n${description}`;

  // --- Hard DROP ---

  // PSC starts with a letter => services (esp. N, J, R, U, Y, Z)
  if (psc && /^[A-Za-z]/.test(psc)) return false;

  // Services NAICS
  if (anyNaicsStartsWith(codes, DROP_NAICS_PREFIXES)) return false;

  // Install/services keywords in title or description
  if (DROP_KEYWORD_RE.test(text)) return false;

  // Wage-determination attachment name (SCA / Davis-Bacon / SF98)
  if (attachmentNames(opp).some((n) => WAGE_ATTACHMENT_RE.test(n))) return false;

  // --- Hard KEEP (not required to return true early, but semantically these
  // are the strong positives; the default already returns true) ---

  if (psc && /^\d/.test(psc)) return true;
  if (anyNaicsStartsWith(codes, KEEP_NAICS_PREFIXES)) return true;
  if (BRAND_NAME_OR_EQUAL_RE.test(text)) return true;
  if (NSN_RE.test(text)) return true;
  if (PART_NUMBER_RE.test(text)) return true;

  // Uncertain: let the AI decide.
  return true;
}
