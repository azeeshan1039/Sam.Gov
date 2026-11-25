
import type { SamGovOpportunity } from '@/types/sam-gov'; // Updated import
import fs from 'fs/promises'; // This will now only be used on the server (in API route)
import path from 'path';
import { tmpdir } from 'os';

// Define the cache file path relative to the src directory
const CACHE_FILE_PATH = path.join(process.cwd(), 'src', 'data', '.sam_gov_cache.json');
const CACHE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

interface SamGovCache {
  data: SamGovOpportunity[];
  lastFetched: number;
}

const runtimeCachePath = process.env.VERCEL ? path.join(tmpdir(), 'contract-finder-sam-gov.json') : CACHE_FILE_PATH;
let memoryCache: SamGovCache | null = null;

export interface SamGovCatalog {
  opportunities: SamGovOpportunity[];
  lastFetched: number | null;
  source: 'live' | 'cache' | 'stale' | 'unavailable' | 'partial';
  issue?: 'missing_key' | 'rate_limited' | 'upstream_error';
}

async function readCache(): Promise<SamGovCache | null> {
  try {
    if (memoryCache) return memoryCache;
    const fileContent = await fs.readFile(runtimeCachePath, 'utf-8').catch((error) => {
      if (error.code === 'ENOENT' && runtimeCachePath !== CACHE_FILE_PATH) return fs.readFile(CACHE_FILE_PATH, 'utf-8');
      throw error;
    });
    return JSON.parse(fileContent);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.log("Cache file not found. Will attempt to fetch fresh data.");
    } else {
      console.error("Error reading cache file:", error);
    }
    return null;
  }
}

async function writeCache(cache: SamGovCache): Promise<void> {
  memoryCache = cache;
  try {
    await fs.mkdir(path.dirname(runtimeCachePath), { recursive: true });
    await fs.writeFile(runtimeCachePath, JSON.stringify(cache, null, 2), 'utf-8');
    console.log("SAM.gov cache updated successfully.");
  } catch (error) {
    console.error("Error writing cache file:", error);
  }
}


function getCurrentDate(): string {
  const today = new Date();
  const mm = String(today.getMonth() + 1).padStart(2, '0');
  const dd = String(today.getDate()).padStart(2, '0');
  const yyyy = today.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

function getOneYearBackDate(): string {
  const today = new Date();
  const pastDate = new Date(today);
  pastDate.setDate(today.getDate() - 364);
  const mm = String(pastDate.getMonth() + 1).padStart(2, '0');
  const dd = String(pastDate.getDate()).padStart(2, '0');
  const yyyy = pastDate.getFullYear();
  return `${mm}/${dd}/${yyyy}`;
}

export async function getSamGovOpportunities(searchCriteria: Record<string, any>): Promise<SamGovOpportunity[]> {
  return (await getSamGovCatalog(searchCriteria)).opportunities;
}

export async function getSamGovCatalog(searchCriteria: Record<string, any>): Promise<SamGovCatalog> {
  const cached = await readCache();
  const result = (snapshot: SamGovCache | null, source: SamGovCatalog['source'], issue?: SamGovCatalog['issue']): SamGovCatalog => ({
    opportunities: applyFilters(snapshot?.data || [], searchCriteria),
    lastFetched: snapshot?.lastFetched ?? null,
    source,
    issue,
  });
  if (cached && Date.now() - cached.lastFetched < CACHE_DURATION_MS) return result(cached, 'cache');
  const fallback = (issue: SamGovCatalog['issue']) => result(cached, cached ? 'stale' : 'unavailable', issue);
  const apiKey = process.env.SAM_GOV_API_KEY?.trim() || process.env.NEXT_PUBLIC_SAM_GOV_API_KEY?.trim();
  if (!apiKey) return fallback('missing_key');

  const data: SamGovOpportunity[] = [];
  const limit = 1000;
  let issue: SamGovCatalog['issue'];
  for (let offset = 0; offset < limit * 2; offset += limit) {
    const params = new URLSearchParams({
      api_key: apiKey, ptype: 'o,k', postedFrom: getOneYearBackDate(), postedTo: getCurrentDate(),
      limit: String(limit), offset: String(offset),
    });
    try {
      const response = await fetch('https://api.sam.gov/opportunities/v2/search?' + params, { cache: 'no-store' });
      if (!response.ok) {
        console.warn('SAM.gov search failed with HTTP', response.status);
        issue = response.status === 429 ? 'rate_limited' : 'upstream_error';
        break;
      }
      const payload = await response.json();
      const page = payload.opportunitiesData;
      if (!Array.isArray(page)) {
        issue = 'upstream_error';
        break;
      }
      data.push(...page.map(mapApiOpportunity));
      if (page.length < limit) break;
    } catch {
      issue = 'upstream_error';
      break;
    }
  }
  if (issue) return data.length ? result({ data, lastFetched: Date.now() }, 'partial', issue) : fallback(issue);

  const snapshot = { data, lastFetched: Date.now() };
  await writeCache(snapshot);
  return result(snapshot, 'live');
}

/**
 * Map a single SAM.gov API opportunity record to our internal SamGovOpportunity shape.
 * Extracted from the bulk fetch loop so by-id lookups can reuse it.
 */
function mapApiOpportunity(apiOpp: any): SamGovOpportunity {
  let ncodeString = '';
  if (Array.isArray(apiOpp.naicsCode)) {
    ncodeString = apiOpp.naicsCode.join(',');
  } else if (typeof apiOpp.naicsCode === 'string') {
    ncodeString = apiOpp.naicsCode;
  }
  ncodeString = ncodeString.toLowerCase().replace(/\s+/g, '');

  const officeAddr = apiOpp.officeAddress;
  const officeAddressString = officeAddr ?
    `${officeAddr.city || ''}${officeAddr.city && officeAddr.state ? ', ' : ''}${officeAddr.state || ''}${officeAddr.zipcode ? ' ' + officeAddr.zipcode : ''}${officeAddr.countryCode ? ', ' + officeAddr.countryCode : ''}`.trim()
    : 'N/A';

  const pop = apiOpp.placeOfPerformance;
  let locationObject: SamGovOpportunity['location'] = null;
  if (pop) {
    const countryFromPop = pop.country?.name
      ? { name: pop.country.name, code: pop.country.code }
      : undefined;
    const countryFallback = !countryFromPop && officeAddr?.countryCode === 'USA'
      ? { name: 'UNITED STATES', code: 'USA' }
      : undefined;

    locationObject = {
      city: pop.city?.name ? { name: pop.city.name, code: pop.city.code } : undefined,
      state: pop.state?.name ? { name: pop.state.name, code: pop.state.code } : undefined,
      country: countryFromPop || countryFallback,
      zip: pop.zipCode || undefined,
    };
  } else if (officeAddr?.countryCode) {
    const countryName = officeAddr.countryCode === 'USA' ? 'UNITED STATES' : officeAddr.countryCode;
    locationObject = {
      country: { name: countryName, code: officeAddr.countryCode },
    };
  }

  const parentPath = apiOpp.fullParentPathName?.split('.') || [];
  const department = parentPath[0]?.trim() || 'N/A';
  const subtier = parentPath[1]?.trim() || 'N/A';
  const office = parentPath.length > 2 ? parentPath.slice(2).join('. ').trim() : (parentPath.pop()?.trim() || 'N/A');
  const descriptionText = apiOpp.description || 'No description available.';

  const resourceLinks = (apiOpp.resourceLinks || []).map((rl: any) => {
    if (typeof rl === 'string') {
      return rl;
    }
    if (rl && typeof rl === 'object') {
      return {
        name: rl.name || rl.title || 'Attachment',
        link: rl.link || rl.url || rl.href || ''
      };
    }
    return rl;
  }).filter((rl: any) => rl && (typeof rl === 'string' || rl.link));

  return {
    id: apiOpp.noticeId,
    solicitationNumber: apiOpp.solicitationNumber || apiOpp.noticeId,
    active: typeof apiOpp.active === 'boolean' ? apiOpp.active : undefined,
    title: apiOpp.title || 'N/A',
    ncode: ncodeString || 'N/A',
    naicsDescription: apiOpp.naicsDescription || apiOpp.naicsTitle || undefined,
    department: department,
    subtier: subtier,
    office: office,
    location: locationObject,
    closingDate: apiOpp.responseDeadLine,
    postedDate: apiOpp.postedDate || apiOpp.modifiedDate || undefined,
    type: apiOpp.type || 'N/A',
    setAside: apiOpp.typeOfSetAsideDescription || apiOpp.typeOfSetAside || undefined,
    classificationCode: apiOpp.classificationCode || undefined,
    organizationHierarchy: apiOpp.fullParentPathName || undefined,
    link: apiOpp.uiLink || '#',
    officeAddress: officeAddressString,
    description: descriptionText,
    resourceLinks: resourceLinks,
  };
}

/**
 * Fetch a single SAM.gov opportunity by noticeId.
 *
 * The bulk getSamGovOpportunities cache only holds at most ~2,000 recent rows
 * (last 364 days, ptype=o,k). This function is the escape hatch when the user
 * navigates to a specific opportunity ID outside that window: we hit SAM.gov's
 * search endpoint with `noticeid=<id>` directly and a wide enough date range
 * to cover archived solicitations.
 *
 * Tries the file cache first (free), then falls back to one direct API call.
 * Returns null if not found anywhere.
 */
export async function getSamGovOpportunityById(id: string): Promise<SamGovOpportunity | null> {
  if (!id) return null;

  // 1) Cheap path: hit the existing file cache.
  const cache = await readCache();
  const fromCache = cache?.data?.find(o => o.id === id);
  if (fromCache) {
    return fromCache;
  }

  // 2) Direct lookup via SAM.gov search API by noticeid.
  const apiKey = process.env.SAM_GOV_API_KEY ?? process.env.NEXT_PUBLIC_SAM_GOV_API_KEY;
  if (!apiKey) {
    console.warn('SAM_GOV_API_KEY not set — cannot do direct by-id lookup.');
    return null;
  }

  // SAM.gov's search endpoint enforces a max 1-year postedFrom-to-postedTo
  // window. Walk back in 1-year slices (newest first) until we find the
  // notice or exhaust a bounded number of years.
  const MAX_YEARS_BACK = 4;
  const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;

  const today = new Date();

  for (let yearsBack = 0; yearsBack < MAX_YEARS_BACK; yearsBack++) {
    const windowTo = new Date(today);
    windowTo.setFullYear(today.getFullYear() - yearsBack);
    const windowFrom = new Date(windowTo);
    windowFrom.setFullYear(windowTo.getFullYear() - 1);
    // Pad by one day so the boundary doesn't trigger "Date range must be null year(s) apart"
    windowFrom.setDate(windowFrom.getDate() + 1);

    const params = new URLSearchParams({
      api_key: apiKey,
      noticeid: id,
      postedFrom: fmt(windowFrom),
      postedTo: fmt(windowTo),
      limit: '10',
    });
    const url = `https://api.sam.gov/opportunities/v2/search?${params.toString()}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text();
        console.error(`SAM.gov by-id lookup failed (window ${fmt(windowFrom)}-${fmt(windowTo)}): ${res.status} ${res.statusText}`, body.slice(0, 200));
        if (res.status === 401 || res.status === 403) {
          const e: any = new Error('SAM.gov API key invalid or expired.');
          e.code = 'SAMGOV_AUTH';
          throw e;
        }
        if (res.status === 429) {
          const e: any = new Error('SAM.gov API rate limit exceeded.');
          e.code = 'SAMGOV_RATE_LIMIT';
          throw e;
        }
        // 400 / other — try next window instead of bailing
        continue;
      }
      const data: any = await res.json();
      const list: any[] = Array.isArray(data?.opportunitiesData) ? data.opportunitiesData : [];
      const match = list.find(o => o?.noticeId === id) || list[0];
      if (match) {
        return mapApiOpportunity(match);
      }
      // Empty list in this window — try next one
    } catch (err: any) {
      if (err?.code === 'SAMGOV_AUTH' || err?.code === 'SAMGOV_RATE_LIMIT') {
        throw err;
      }
      console.error(`Error in window ${fmt(windowFrom)}-${fmt(windowTo)}:`, err);
      // Continue to next window
    }
  }

  // Walked all windows, no hit.
  return null;
}

// Helper function to apply filters
function applyFilters(
  opportunities: SamGovOpportunity[],
  searchCriteria: Record<string, any>
): SamGovOpportunity[] {
  if (!opportunities || opportunities.length === 0) {
    return [];
  }
  const { ncode, location, dateFilter, showOnlyOpen, searchQuery } = searchCriteria;

  return opportunities.filter(opportunity => {
    const searchLower = searchQuery?.toLowerCase() || '';
    // Ensure opportunity.description is treated as string for filtering.
    const descriptionText = opportunity.description || ''; // Use the raw description
    const matchesSearch = !searchQuery || (
      opportunity.title?.toLowerCase().includes(searchLower) ||
      opportunity.department?.toLowerCase().includes(searchLower) ||
      opportunity.subtier?.toLowerCase().includes(searchLower) ||
      opportunity.office?.toLowerCase().includes(searchLower) ||
      (typeof descriptionText === 'string' && descriptionText.toLowerCase().includes(searchLower))
    );

    const ncodeLower = ncode?.toLowerCase();
    const matchesNaics = !ncodeLower || opportunity.ncode?.toLowerCase().includes(ncodeLower);

    const locationLower = location?.toLowerCase();
    const locationString = [
      opportunity.location?.city?.name,
      opportunity.location?.state?.name,
      opportunity.location?.country?.name,
      opportunity.location?.zip,
      opportunity.officeAddress,
    ].filter(Boolean).join(', ').toLowerCase();
    const matchesLocation = !locationLower || locationString.includes(locationLower);


    const selectedDate = dateFilter ? new Date(dateFilter) : undefined;
    if (selectedDate) selectedDate.setHours(0, 0, 0, 0);
    const closingDate = opportunity.closingDate ? new Date(opportunity.closingDate) : undefined;
    const matchesDate = !selectedDate || (closingDate && closingDate >= selectedDate);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isOpen = closingDate && closingDate >= today;
    const matchesOpen = !showOnlyOpen || isOpen;

    return matchesSearch && matchesNaics && matchesLocation && matchesDate && matchesOpen;
  });
}
