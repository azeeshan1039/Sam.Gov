
import type { SamGovOpportunity } from '@/types/sam-gov'; // Updated import
import fs from 'fs/promises'; // This will now only be used on the server (in API route)
import path from 'path';

// Define the cache file path relative to the src directory
const CACHE_FILE_PATH = path.join(process.cwd(), 'src', 'data', '.sam_gov_cache.json');
const CACHE_DURATION_MS = 4 * 60 * 60 * 1000; // 4 hours

interface SamGovCache {
  data: SamGovOpportunity[];
  lastFetched: number;
}

const singleDummyOpportunityForRateLimit: SamGovOpportunity = {
  id: 'DUMMY_RL_001',
  title: 'Service Temporarily Unavailable due to High Traffic',
  ncode: '000000',
  department: 'System Alert',
  subtier: 'Please try refreshing in a few minutes.',
  office: 'N/A',
  location: {
    city: { name: 'N/A' },
    state: { name: 'N/A' },
    zip: '00000',
    country: { name: 'N/A' },
  },
  closingDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // Tomorrow
  type: 'Special Notice',
  link: '#',
  officeAddress: 'N/A',
  description: 'We are experiencing high demand on the SAM.gov API. To ensure fair access, your request has been temporarily paused. This is a placeholder listing. Please try again later.',
  resourceLinks: []
};


async function readCache(): Promise<SamGovCache | null> {
  try {
    const fileContent = await fs.readFile(CACHE_FILE_PATH, 'utf-8');
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
  try {
    // Ensure the src/data directory exists
    await fs.mkdir(path.dirname(CACHE_FILE_PATH), { recursive: true });
    await fs.writeFile(CACHE_FILE_PATH, JSON.stringify(cache, null, 2), 'utf-8');
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

export async function getSamGovOpportunities(
  searchCriteria: Record<string, any>
): Promise<SamGovOpportunity[]> {
  const currentTime = Date.now();
  let samGovCacheFromFile = await readCache();

  if (samGovCacheFromFile && (currentTime - samGovCacheFromFile.lastFetched < CACHE_DURATION_MS) && samGovCacheFromFile.data.length > 0) {
    console.log("Serving SAM.gov opportunities from valid file cache.");
    return applyFilters(samGovCacheFromFile.data, searchCriteria);
  }

  console.log("File cache is stale, empty, or non-existent. Attempting to fetch fresh SAM.gov opportunities from API.");
  const apiKey = process.env.SAM_GOV_API_KEY ?? process.env.NEXT_PUBLIC_SAM_GOV_API_KEY;
  if (!apiKey) {
    console.warn('SAM_GOV_API_KEY or NEXT_PUBLIC_SAM_GOV_API_KEY is not set. Using existing cache or returning empty.');
    return applyFilters(samGovCacheFromFile?.data || [], searchCriteria);
  }

  const baseUrl = 'https://api.sam.gov/opportunities/v2/search';
  const defaultParams: Record<string, any> = {
    api_key: apiKey,
    ptype: 'o,k',
    postedFrom: getOneYearBackDate(),
    postedTo: getCurrentDate(),
    limit: '1000'
  };

  let allFetchedOpportunitiesData: any[] = [];
  let offset = 0;
  const limit = 1000;
  let hasMore = true;
  let pagesFetched = 0;
  const maxPages = 2;

  console.log(`Fetching SAM.gov opportunities (max ${maxPages} pages)...`);

  while (hasMore && pagesFetched < maxPages) {
    const params = { ...defaultParams, offset: String(offset) };
    const queryString = new URLSearchParams(params).toString();
    const url = `${baseUrl}?${queryString}`;

    console.log(`Fetching page ${pagesFetched + 1} (offset: ${offset}) of max ${maxPages} pages...`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        const errorBodyText = await response.text();
        console.error(`SAM.gov API error on page ${pagesFetched + 1}: ${response.status} ${response.statusText}`, errorBodyText);

        if (response.status === 429 && pagesFetched === 0) { // Only return dummy if 429 on *first* page attempt
          console.warn("SAM.gov API rate limit exceeded on initial fetch. Returning a single dummy listing for this request.");
          return applyFilters([singleDummyOpportunityForRateLimit], searchCriteria); // Do not update cache with this
        }

        // For other errors on the first page, or any error on subsequent pages
        // If it's an error on the first page (and not 429), rely on potentially stale cache or empty.
        if (pagesFetched === 0) {
          console.warn("API error on first page. Using existing file cache (if any) or empty list.");
          return applyFilters(samGovCacheFromFile?.data || [], searchCriteria);
        }

        // Error on subsequent pages: stop fetching. We'll process what we have.
        hasMore = false;
        break;
      }

      const data = await response.json();
      if (!data.opportunitiesData || !Array.isArray(data.opportunitiesData)) {
        console.error(`Invalid data format from SAM.gov API on page ${pagesFetched + 1}.`);
        if (pagesFetched === 0) {
          console.warn("Invalid data on first page. Using existing file cache (if any) or empty list.");
          return applyFilters(samGovCacheFromFile?.data || [], searchCriteria);
        }
        hasMore = false;
        break;
      }

      allFetchedOpportunitiesData.push(...data.opportunitiesData);

      if (data.opportunitiesData.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    } catch (error: any) {
      console.error(`Network error fetching data from SAM.gov API on page ${pagesFetched + 1}:`, error);
      if (pagesFetched === 0) {
        console.warn("Network error on first page. Using existing file cache (if any) or empty list.");
        return applyFilters(samGovCacheFromFile?.data || [], searchCriteria);
      }
      hasMore = false;
      break;
    }
    pagesFetched++;
  }

  if (allFetchedOpportunitiesData.length > 0) {
    console.log(`Fetched a total of ${allFetchedOpportunitiesData.length} opportunities from API over ${pagesFetched} page(s).`);
    const mappedOpportunities: SamGovOpportunity[] = allFetchedOpportunitiesData.map(mapApiOpportunity);

    const newCache: SamGovCache = {
      data: mappedOpportunities,
      lastFetched: currentTime,
    };
    await writeCache(newCache);
    console.log(`SAM.gov file cache updated with live API data. ${mappedOpportunities.length} opportunities stored.`);
    return applyFilters(mappedOpportunities, searchCriteria);
  } else {
    // No new data fetched successfully from any page, and it wasn't a 429 on the first attempt that returned dummy.
    console.log("No new opportunities fetched from API. Using existing file cache (if any) or returning empty list.");
    return applyFilters(samGovCacheFromFile?.data || [], searchCriteria);
  }
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
