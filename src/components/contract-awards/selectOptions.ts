/**
 * Starter option lists for the curated Select filters.
 * These come from the GSA spec's documented enums + the most-commonly-used values.
 * The client is expected to refine them in the SOW (see "Default-view filter set" unblocker).
 */

export const SET_ASIDE_OPTIONS: string[] = [
  "Total Small Business Set-Aside",
  "Partial Small Business Set-Aside",
  "8(a) Sole Source",
  "8(a) Competitive",
  "HUBZone Set-Aside",
  "HUBZone Sole Source",
  "Service-Disabled Veteran-Owned Small Business Set-Aside",
  "Service-Disabled Veteran-Owned Small Business Sole Source",
  "Women-Owned Small Business Set-Aside",
  "Women-Owned Small Business Sole Source",
  "Economically Disadvantaged Women-Owned Small Business Set-Aside",
  "Economically Disadvantaged Women-Owned Small Business Sole Source",
  "Veteran-Owned Small Business Set-Aside",
  "Veteran-Owned Small Business Sole Source",
  "Indian Small Business Economic Enterprise",
  "Indian Economic Enterprise",
  "Buy Indian",
  "Local Area Set-Aside",
];

export const EXTENT_COMPETED_OPTIONS: string[] = [
  "Full and Open Competition",
  "Not Available for Competition",
  "Not Competed",
  "Full and Open Competition after Exclusion of Sources",
  "Competed under SAP",
  "Not Competed under SAP",
  "Competitive Delivery Order",
  "Non-Competitive Delivery Order",
];

export const PRICING_TYPE_OPTIONS: string[] = [
  "Firm Fixed Price",
  "Fixed Price with Economic Price Adjustment",
  "Fixed Price Incentive",
  "Fixed Price Redeterminable",
  "Fixed Price Level of Effort",
  "Cost Plus Award Fee",
  "Cost Plus Fixed Fee",
  "Cost Plus Incentive Fee",
  "Cost Sharing",
  "Cost No Fee",
  "Time and Materials",
  "Labor Hours",
  "Order Dependent (IDV allows pricing arrangement to be determined separately for each order)",
  "Combination (Two or more)",
];

export const US_STATES: Array<{ code: string; name: string }> = [
  { code: "AL", name: "Alabama" }, { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" }, { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" }, { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" }, { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" }, { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" }, { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" }, { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" }, { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" }, { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" }, { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" }, { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" }, { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" }, { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" }, { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" }, { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" }, { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" }, { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" }, { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" }, { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" }, { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" }, { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" }, { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" }, { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" }, { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" }, { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" }, { code: "PR", name: "Puerto Rico" },
  { code: "VI", name: "U.S. Virgin Islands" }, { code: "GU", name: "Guam" },
  { code: "AS", name: "American Samoa" }, { code: "MP", name: "Northern Mariana Islands" },
];

export const FISCAL_YEAR_OPTIONS: string[] = (() => {
  // current FY runs Oct (m=9) through Sept; calendar year suffices for the picker.
  const now = new Date();
  const y = now.getFullYear();
  const list: string[] = [];
  for (let i = 0; i < 6; i++) list.push(String(y - i));
  return list;
})();

export const ANY_VALUE = "__any";
