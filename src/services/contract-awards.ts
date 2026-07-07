/**
 * Service layer for the GSA Contract Awards API.
 * Endpoint: https://api.sam.gov/contract-awards/v1/search
 *
 * Auth: api_key query param, sourced from process.env.SAM_GOV_API_KEY
 * (same key the existing SAM.gov opportunities integration uses).
 */
import type {
  ContractAwardFilters,
  ContractAwardRecord,
  ContractAwardsSearchResponse,
} from "@/types/contract-awards";

const BASE_URL = "https://api.sam.gov/contract-awards/v1/search";
const FORBIDDEN_Q_CHARS = /[&|{}^\\]/g;
const MAX_CHIPS = 100;
const PAGE_SIZE = 100;
const SYNC_HARD_CAP = 400_000;

export class ContractAwardsError extends Error {
  code: "AUTH" | "RATE_LIMIT" | "BAD_REQUEST" | "UPSTREAM" | "MISSING_KEY";
  status?: number;
  constructor(code: ContractAwardsError["code"], message: string, status?: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

function isoToUsDate(iso: string): string {
  // yyyy-mm-dd -> MM/DD/YYYY (API expects US format)
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function rangeParam(from: string, to: string): string | undefined {
  const f = isoToUsDate(from);
  const t = isoToUsDate(to);
  if (f && t) return `[${f},${t}]`;
  if (f) return f;
  if (t) return t;
  return undefined;
}

function numRange(min: string, max: string): string | undefined {
  if (min && max) return `[${min},${max}]`;
  if (min) return min;
  if (max) return max;
  return undefined;
}

/**
 * Build the upstream query string from a UI filter object.
 * The api_key + pagination are added by callers (fetchPage).
 */
export function buildQueryParams(filters: ContractAwardFilters): Record<string, string> {
  const out: Record<string, string> = {};
  const set = (k: string, v: string | undefined) => {
    if (v && v.trim()) out[k] = v;
  };

  // Free-text — strip forbidden chars rather than rejecting the request.
  if (filters.q) set("q", filters.q.replace(FORBIDDEN_Q_CHARS, "").trim());

  // Date ranges
  set("dateSigned", rangeParam(filters.dateSignedFrom, filters.dateSignedTo));
  set(
    "currentCompletionDate",
    rangeParam(filters.currentCompletionDateFrom, filters.currentCompletionDateTo)
  );

  // Money ranges
  set("dollarsObligated", numRange(filters.dollarsObligatedMin, filters.dollarsObligatedMax));
  set(
    "totalUltimateContractValue",
    numRange(filters.totalUltimateContractValueMin, filters.totalUltimateContractValueMax)
  );

  // Multi-value chips — comma-joined, capped at 100
  const chips = (k: keyof ContractAwardFilters, paramName: string) => {
    const arr = filters[k] as string[];
    if (Array.isArray(arr) && arr.length > 0) {
      out[paramName] = arr.slice(0, MAX_CHIPS).join(",");
    }
  };
  chips("naicsCode", "naicsCode");
  chips("productOrServiceCode", "productOrServiceCode");
  chips("awardeeUniqueEntityId", "awardeeUniqueEntityId");
  chips("awardeeCageCode", "awardeeCageCode");

  // Enums + scalars
  set("productOrServiceType", filters.productOrServiceType);
  set("awardOrIDV", filters.awardOrIDV);
  set("fiscalYear", filters.fiscalYear);
  set("closedStatus", filters.closedStatus);
  set("multiyearContractName", filters.multiyearContractName);

  // Free-text partial-match
  set("awardeeLegalBusinessName", filters.awardeeLegalBusinessName);
  set("contractingSubtierName", filters.contractingSubtierName);
  set("fundingSubtierName", filters.fundingSubtierName);

  set("typeOfSetAsideName", filters.typeOfSetAsideName);
  set("extentCompetedName", filters.extentCompetedName);
  set("typeOfContractPricingName", filters.typeOfContractPricingName);

  // Awardee location
  set("awardeeStateCode", filters.awardeeStateCode);
  set("awardeeCityName", filters.awardeeCityName);
  set("awardeeZipCode", filters.awardeeZipCode);
  set("awardeeCountryCode", filters.awardeeCountryCode);

  // Place of performance
  set("placeOfPerformStateCode", filters.placeOfPerformStateCode);
  set("placeOfPerformCityName", filters.placeOfPerformCityName);
  set("placeOfPerformZipCode", filters.placeOfPerformZipCode);
  set("placeOfPerformCountryCode", filters.placeOfPerformCountryCode);

  if (filters.includeDeleted) out.deletedStatus = "yes";

  return out;
}

function getApiKey(): string {
  const key = process.env.SAM_GOV_API_KEY || process.env.NEXT_PUBLIC_SAM_GOV_API_KEY;
  if (!key) {
    throw new ContractAwardsError(
      "MISSING_KEY",
      "SAM_GOV_API_KEY is not set. Add it to .env.local and restart the dev server."
    );
  }
  return key;
}

async function callUpstream(url: string): Promise<any> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch (err: any) {
    throw new ContractAwardsError("UPSTREAM", `Network error contacting GSA: ${err?.message || err}`);
  }
  if (res.status === 204) return { opportunitiesData: [], totalRecords: 0 };
  if (res.status === 401 || res.status === 403) {
    throw new ContractAwardsError("AUTH", "SAM.gov API key invalid, missing, or unauthorized.", res.status);
  }
  if (res.status === 429) {
    throw new ContractAwardsError(
      "RATE_LIMIT",
      "GSA daily quota exceeded. Try again tomorrow or upgrade the API key role.",
      429
    );
  }
  if (res.status === 400) {
    const body = await res.text();
    throw new ContractAwardsError(
      "BAD_REQUEST",
      `GSA rejected the query: ${body.slice(0, 300)}`,
      400
    );
  }
  if (!res.ok) {
    const body = await res.text();
    throw new ContractAwardsError(
      "UPSTREAM",
      `GSA returned ${res.status}: ${body.slice(0, 200)}`,
      res.status
    );
  }
  return res.json();
}

export async function fetchPage(
  filters: ContractAwardFilters,
  limit: number,
  offset: number
): Promise<ContractAwardsSearchResponse> {
  const apiKey = getApiKey();
  const params = new URLSearchParams({
    ...buildQueryParams(filters),
    api_key: apiKey,
    limit: String(Math.min(Math.max(limit, 1), PAGE_SIZE)),
    offset: String(Math.max(offset, 0)),
  });
  const data = await callUpstream(`${BASE_URL}?${params.toString()}`);
  // Contract Awards API returns rows under `awardSummary` (the Opportunities API
  // uses `opportunitiesData` — different endpoint, different shape).
  const list: any[] = Array.isArray(data?.awardSummary) ? data.awardSummary : [];
  return {
    records: list.map(flattenRecord),
    totalRecords: Number(data?.totalRecords ?? list.length),
    limit: Number(data?.limit ?? limit),
    offset: Number(data?.offset ?? offset),
  };
}

/**
 * Walk pages of the API up to `cap` rows total (or until upstream runs out).
 * Caller is expected to enforce a sensible cap (the route layer caps at 10,000
 * by default; the API itself enforces offset*limit <= 400,000).
 */
export async function fetchAllPages(
  filters: ContractAwardFilters,
  cap: number
): Promise<ContractAwardRecord[]> {
  const safeCap = Math.min(Math.max(cap, 1), SYNC_HARD_CAP);
  const all: ContractAwardRecord[] = [];
  let offset = 0;
  while (all.length < safeCap) {
    const remaining = safeCap - all.length;
    const pageLimit = Math.min(PAGE_SIZE, remaining);
    const page = await fetchPage(filters, pageLimit, offset);
    if (page.records.length === 0) break;
    all.push(...page.records);
    if (page.records.length < pageLimit) break;
    offset += page.records.length;
    if (offset >= page.totalRecords) break;
  }
  return all;
}

function pickStr(...vals: any[]): string {
  for (const v of vals) {
    if (v === null || v === undefined) continue;
    const s = typeof v === "object" ? "" : String(v).trim();
    if (s) return s;
  }
  return "";
}

function joinPlace(parts: Array<string | undefined | null>): string {
  return parts.filter((p) => p && String(p).trim()).join(", ");
}

function nameOrCode(v: any): string {
  if (!v) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") return pickStr(v.name, v.code);
  return String(v);
}

/**
 * Flatten the nested GSA Contract Awards record into the columns we render and export.
 * Field paths verified against a live response (samples in scratchpad/ca_sample.json).
 * The API nests fields under contractId / coreData / awardDetails — awardeeData lives
 * INSIDE awardDetails, not as a top-level section.
 */
export function flattenRecord(raw: any): ContractAwardRecord {
  const contractId = raw?.contractId ?? {};
  const core = raw?.coreData ?? {};
  const details = raw?.awardDetails ?? {};

  const fed = core?.federalOrganization ?? {};
  const contractingInfo = fed?.contractingInformation ?? {};
  const fundingInfo = fed?.fundingInformation ?? {};

  const place = core?.principalPlaceOfPerformance ?? {};
  const psInfo = core?.productOrServiceInformation ?? {};
  const product = psInfo?.productOrService ?? {};
  const principalNaics = Array.isArray(psInfo?.principalNaics) ? psInfo.principalNaics : [];

  const awardee = details?.awardeeData ?? {};
  const awardeeHeader = awardee?.awardeeHeader ?? {};
  const awardeeUei = awardee?.awardeeUEIInformation ?? {};
  const awardeeLoc = awardee?.awardeeLocation ?? {};

  const detailsComp = details?.competitionInformation ?? {};
  const coreComp = core?.competitionInformation ?? {};

  return {
    piid: pickStr(contractId?.piid, contractId?.PIID),
    modificationNumber: pickStr(contractId?.modificationNumber, contractId?.modNumber),
    agencyId: pickStr(contractId?.subtier?.code, contractId?.subtier?.name),
    dateSigned: pickStr(details?.dates?.dateSigned),
    dollarsObligated: pickStr(
      details?.dollars?.actionObligation,
      details?.dollars?.baseDollarsObligated
    ),
    totalUltimateContractValue: pickStr(
      details?.totalContractDollars?.totalBaseAndAllOptionsValue,
      details?.totalContractDollars?.totalBaseAndExercisedOptionsValue,
      details?.totalContractDollars?.totalActionObligation
    ),
    awardeeLegalName: pickStr(
      awardeeHeader?.legalBusinessName,
      awardeeHeader?.awardeeName,
      awardeeHeader?.awardeeNameFromContract
    ),
    awardeeUei: pickStr(awardeeUei?.uniqueEntityId),
    awardeeCage: pickStr(awardeeUei?.cageCode),
    awardeePlace: joinPlace([
      nameOrCode(awardeeLoc?.city),
      nameOrCode(awardeeLoc?.state),
      pickStr(awardeeLoc?.zip),
      nameOrCode(awardeeLoc?.country),
    ]),
    placeOfPerformance: joinPlace([
      nameOrCode(place?.city),
      nameOrCode(place?.state),
      pickStr(place?.zipCode),
      nameOrCode(place?.country),
    ]),
    contractingDepartment: nameOrCode(contractingInfo?.contractingDepartment),
    contractingSubtier: nameOrCode(contractingInfo?.contractingSubtier),
    fundingDepartment: nameOrCode(fundingInfo?.fundingDepartment),
    fundingSubtier: nameOrCode(fundingInfo?.fundingSubtier),
    naicsCode: pickStr(principalNaics[0]?.code),
    productOrServiceCode: pickStr(product?.code),
    productOrServiceType: pickStr(product?.type),
    typeOfSetAside: nameOrCode(
      detailsComp?.typeOfSetAside ?? detailsComp?.idvTypeOfSetAside ?? coreComp?.typeOfSetAside
    ),
    extentCompeted: nameOrCode(
      coreComp?.extentCompeted ?? detailsComp?.extentCompetedForReferencedIdv
    ),
    typeOfContractPricing: nameOrCode(core?.acquisitionData?.typeOfContractPricing),
    description: pickStr(
      details?.productOrServiceInformation?.descriptionOfContractRequirement,
      core?.descriptionOfRequirement,
      core?.description
    ),
  };
}

export const CSV_COLUMNS: Array<{ key: keyof ContractAwardRecord; header: string }> = [
  { key: "piid", header: "PIID" },
  { key: "modificationNumber", header: "Modification #" },
  { key: "agencyId", header: "Agency ID" },
  { key: "dateSigned", header: "Date Signed" },
  { key: "dollarsObligated", header: "Dollars Obligated" },
  { key: "totalUltimateContractValue", header: "Total Ultimate Contract Value" },
  { key: "awardeeLegalName", header: "Awardee" },
  { key: "awardeeUei", header: "Awardee UEI" },
  { key: "awardeeCage", header: "Awardee CAGE" },
  { key: "awardeePlace", header: "Awardee Location" },
  { key: "placeOfPerformance", header: "Place of Performance" },
  { key: "contractingDepartment", header: "Contracting Department" },
  { key: "contractingSubtier", header: "Contracting Subtier" },
  { key: "fundingDepartment", header: "Funding Department" },
  { key: "fundingSubtier", header: "Funding Subtier" },
  { key: "naicsCode", header: "NAICS" },
  { key: "productOrServiceCode", header: "PSC" },
  { key: "productOrServiceType", header: "Product/Service Type" },
  { key: "typeOfSetAside", header: "Set-Aside" },
  { key: "extentCompeted", header: "Extent Competed" },
  { key: "typeOfContractPricing", header: "Pricing Type" },
  { key: "description", header: "Description" },
];

function csvEscape(v: string): string {
  if (v == null) return "";
  const s = String(v);
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function toCsv(rows: ContractAwardRecord[]): string {
  const header = CSV_COLUMNS.map((c) => csvEscape(c.header)).join(",");
  const body = rows
    .map((r) => CSV_COLUMNS.map((c) => csvEscape(r[c.key] ?? "")).join(","))
    .join("\r\n");
  return `${header}\r\n${body}\r\n`;
}
