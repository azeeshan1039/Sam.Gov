/**
 * Filter shape for the /contract-awards page UI.
 * Each field maps 1:1 to a query param accepted by
 * https://api.sam.gov/contract-awards/v1/search
 *
 * Empty string / undefined / empty array means "do not send".
 */
export interface ContractAwardFilters {
  // Free-text
  q: string;

  // Date ranges — yyyy-mm-dd from native <input type="date">, serialized to MM/DD/YYYY upstream
  dateSignedFrom: string;
  dateSignedTo: string;
  currentCompletionDateFrom: string;
  currentCompletionDateTo: string;

  // Money ranges
  dollarsObligatedMin: string;
  dollarsObligatedMax: string;
  totalUltimateContractValueMin: string;
  totalUltimateContractValueMax: string;

  // Multi-value chips (max 100 each)
  naicsCode: string[];
  productOrServiceCode: string[];
  awardeeUniqueEntityId: string[];
  awardeeCageCode: string[];

  // Enums / selects
  productOrServiceType: "" | "SERVICE" | "PRODUCT";
  awardOrIDV: "" | "Award" | "IDV";
  fiscalYear: string;
  closedStatus: "" | "Yes" | "No";
  multiyearContractName: "" | "Yes" | "No";

  // Free-text partial-match
  awardeeLegalBusinessName: string;
  contractingSubtierName: string;
  fundingSubtierName: string;

  // Curated-list selects (we ship a starter list per field; client can ask for more)
  typeOfSetAsideName: string;
  extentCompetedName: string;
  typeOfContractPricingName: string;

  // Location group — awardee
  awardeeStateCode: string;
  awardeeCityName: string;
  awardeeZipCode: string;
  awardeeCountryCode: string;

  // Location group — place of performance
  placeOfPerformStateCode: string;
  placeOfPerformCityName: string;
  placeOfPerformZipCode: string;
  placeOfPerformCountryCode: string;

  // Advanced
  includeDeleted: boolean;
}

export const EMPTY_FILTERS: ContractAwardFilters = {
  q: "",
  dateSignedFrom: "",
  dateSignedTo: "",
  currentCompletionDateFrom: "",
  currentCompletionDateTo: "",
  dollarsObligatedMin: "",
  dollarsObligatedMax: "",
  totalUltimateContractValueMin: "",
  totalUltimateContractValueMax: "",
  naicsCode: [],
  productOrServiceCode: [],
  awardeeUniqueEntityId: [],
  awardeeCageCode: [],
  productOrServiceType: "",
  awardOrIDV: "",
  fiscalYear: "",
  closedStatus: "",
  multiyearContractName: "",
  awardeeLegalBusinessName: "",
  contractingSubtierName: "",
  fundingSubtierName: "",
  typeOfSetAsideName: "",
  extentCompetedName: "",
  typeOfContractPricingName: "",
  awardeeStateCode: "",
  awardeeCityName: "",
  awardeeZipCode: "",
  awardeeCountryCode: "",
  placeOfPerformStateCode: "",
  placeOfPerformCityName: "",
  placeOfPerformZipCode: "",
  placeOfPerformCountryCode: "",
  includeDeleted: false,
};

/**
 * Flattened row shape we surface in the UI table and CSV.
 * The upstream response nests data under contractId/coreData/awardDetails/awardeeData;
 * services/contract-awards.ts:flattenRecord pulls the columns we actually render.
 */
export interface ContractAwardRecord {
  piid: string;
  modificationNumber: string;
  agencyId: string;
  dateSigned: string;
  dollarsObligated: string;
  totalUltimateContractValue: string;
  awardeeLegalName: string;
  awardeeUei: string;
  awardeeCage: string;
  awardeePlace: string;
  placeOfPerformance: string;
  contractingDepartment: string;
  contractingSubtier: string;
  fundingDepartment: string;
  fundingSubtier: string;
  naicsCode: string;
  productOrServiceCode: string;
  productOrServiceType: string;
  typeOfSetAside: string;
  extentCompeted: string;
  typeOfContractPricing: string;
  description: string;
}

export interface ContractAwardsSearchResponse {
  records: ContractAwardRecord[];
  totalRecords: number;
  limit: number;
  offset: number;
}
