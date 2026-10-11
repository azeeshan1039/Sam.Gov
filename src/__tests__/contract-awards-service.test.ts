/**
 * Characterisation tests for the existing /contract-awards service (page left unchanged).
 * They lock in today's behaviour so any later change is deliberate. Two behaviours
 * differ from the open.gsa.gov docs and are reported separately, not fixed here:
 *   - multi-value params are joined with "," (docs: "~")
 *   - fetchAllPages advances `offset` by records (docs: offset is a page number)
 */
import {
  ContractAwardsError,
  buildQueryParams,
  fetchAllPages,
  fetchPage,
  flattenRecord,
  toCsv,
} from "@/services/contract-awards";
import { EMPTY_FILTERS } from "@/types/contract-awards";

const record = {
  contractId: { piid: "15B61524P00000105", modificationNumber: "0", subtier: { code: "1540", name: "BOP" } },
  coreData: {
    federalOrganization: { contractingInformation: { contractingDepartment: { code: "1500", name: "JUSTICE" } } },
    productOrServiceInformation: { productOrService: { code: "6515", type: "PRODUCT" }, principalNaics: [{ code: "339112" }] },
  },
  awardDetails: {
    dates: { dateSigned: "2024-03-15" },
    dollars: { actionObligation: "28735" },
    totalContractDollars: { totalBaseAndAllOptionsValue: "52680.8" },
    awardeeData: {
      awardeeHeader: { legalBusinessName: "GE PRECISION HEALTHCARE LLC" },
      awardeeUEIInformation: { uniqueEntityId: "JJURYE5M19G1", cageCode: "1GMR6" },
      awardeeLocation: { city: "WAUKESHA", state: { code: "WI" }, zip: "53188" },
    },
  },
};

function respond(status: number, body: unknown = {}) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
  } as Response);
}

const originalKey = process.env.SAM_GOV_API_KEY;
beforeEach(() => { process.env.SAM_GOV_API_KEY = "test-key"; });
afterAll(() => { process.env.SAM_GOV_API_KEY = originalKey; });

describe("contract-awards service (characterisation)", () => {
  test("buildQueryParams converts dates, ranges and chips and strips forbidden characters", () => {
    const params = buildQueryParams({
      ...EMPTY_FILTERS,
      q: "beds & {chairs}",
      dateSignedFrom: "2026-01-02",
      dateSignedTo: "2026-02-03",
      dollarsObligatedMin: "100",
      naicsCode: ["339112", "423450"],
      awardeeLegalBusinessName: "GE",
      includeDeleted: true,
    });
    expect(params).toEqual({
      q: "beds  chairs",
      dateSigned: "[01/02/2026,02/03/2026]",
      dollarsObligated: "100",
      naicsCode: "339112,423450",
      awardeeLegalBusinessName: "GE",
      deletedStatus: "yes",
    });
    expect(buildQueryParams(EMPTY_FILTERS)).toEqual({});
  });

  test("flattenRecord reads the nested awardSummary record", () => {
    const flat = flattenRecord(record);
    expect(flat).toMatchObject({
      piid: "15B61524P00000105",
      dateSigned: "2024-03-15",
      dollarsObligated: "28735",
      totalUltimateContractValue: "52680.8",
      awardeeLegalName: "GE PRECISION HEALTHCARE LLC",
      awardeeUei: "JJURYE5M19G1",
      awardeeCage: "1GMR6",
      awardeePlace: "WAUKESHA, WI, 53188",
      contractingDepartment: "JUSTICE",
      naicsCode: "339112",
      productOrServiceCode: "6515",
    });
    expect(toCsv([flat]).split("\r\n")[0]).toContain("PIID,Modification #");
  });

  test("fetchPage sends the key and maps upstream errors", async () => {
    const fetchMock = jest.fn(() => respond(200, { awardSummary: [record], totalRecords: 1, limit: 25, offset: 0 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const page = await fetchPage({ ...EMPTY_FILTERS, q: "beds" }, 500, -3);
    const url = new URL(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url.searchParams.get("api_key")).toBe("test-key");
    expect(url.searchParams.get("limit")).toBe("100");
    expect(url.searchParams.get("offset")).toBe("0");
    expect(page.records).toHaveLength(1);

    const codes: Array<[number, string]> = [[401, "AUTH"], [403, "AUTH"], [429, "RATE_LIMIT"], [400, "BAD_REQUEST"], [500, "UPSTREAM"]];
    for (const [status, code] of codes) {
      global.fetch = jest.fn(() => respond(status, "upstream says no")) as unknown as typeof fetch;
      await expect(fetchPage(EMPTY_FILTERS, 10, 0)).rejects.toMatchObject({ code });
    }
    global.fetch = jest.fn(() => respond(204)) as unknown as typeof fetch;
    await expect(fetchPage(EMPTY_FILTERS, 10, 0)).resolves.toMatchObject({ records: [], totalRecords: 0 });
    delete process.env.SAM_GOV_API_KEY;
    await expect(fetchPage(EMPTY_FILTERS, 10, 0)).rejects.toBeInstanceOf(ContractAwardsError);
  });

  test("fetchAllPages currently advances offset by records fetched", async () => {
    const offsets: string[] = [];
    global.fetch = jest.fn((input: RequestInfo | URL) => {
      const url = new URL(String(input));
      offsets.push(url.searchParams.get("offset") || "");
      const limit = Number(url.searchParams.get("limit"));
      return respond(200, { awardSummary: Array.from({ length: limit }, () => record), totalRecords: 250 });
    }) as unknown as typeof fetch;
    const rows = await fetchAllPages(EMPTY_FILTERS, 250);
    expect(rows).toHaveLength(250);
    expect(offsets).toEqual(["0", "100", "200"]);
  });
});
