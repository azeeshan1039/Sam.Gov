
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
  console.log(apiKey)
  if (!apiKey) {
    console.warn('SAM_GOV_API_KEY or NEXT_PUBLIC_SAM_GOV_API_KEY is not set. Using existing cache or returning empty.');
    return applyFilters(samGovCacheFromFile?.data || [], searchCriteria);
  }

  const baseUrl = 'https://api.sam.gov/opportunities/v2/search';
  const defaultParams: Record<string, any> = {
    api_key: apiKey,
    ptype: 'o,k,p',
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
      console.log(allFetchedOpportunitiesData);


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
  console.log(allFetchedOpportunitiesData);

  if (allFetchedOpportunitiesData.length > 0) {
    console.log(`Fetched a total of ${allFetchedOpportunitiesData.length} opportunities from API over ${pagesFetched} page(s).`);
    const mappedOpportunities: SamGovOpportunity[] = allFetchedOpportunitiesData.map((apiOpp: any) => {
      console.log('Raw SAM.gov API opportunity:', apiOpp); // Log the raw API response object
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
        locationObject = {
          city: pop.city ? { name: pop.city.name, code: pop.city.code } : undefined,
          state: pop.state ? { name: pop.state.name, code: pop.state.code } : undefined,
          country: pop.country ? { name: pop.country.name, code: pop.country.code } : undefined,
          zip: pop.zipCode || undefined,
        };
      }

      const parentPath = apiOpp.fullParentPathName?.split('.') || [];
      const department = parentPath[0]?.trim() || 'N/A';
      const subtier = parentPath[1]?.trim() || 'N/A';
      const office = parentPath.length > 2 ? parentPath.slice(2).join('. ').trim() : (parentPath.pop()?.trim() || 'N/A');
      const descriptionText = apiOpp.description || 'No description available.';

      // Map resourceLinks - SAM.gov returns array of objects with name & link
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
        title: apiOpp.title || 'N/A',
        ncode: ncodeString || 'N/A',
        department: department,
        subtier: subtier,
        office: office,
        location: locationObject,
        closingDate: apiOpp.responseDeadLine,
        type: apiOpp.type || 'N/A',
        link: apiOpp.uiLink || '#',
        officeAddress: officeAddressString,
        description: descriptionText,
        resourceLinks: resourceLinks,
      };
    });

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
