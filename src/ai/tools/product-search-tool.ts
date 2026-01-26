
/**
 * @fileOverview A Genkit tool to search for product pricing and vendor information using SerpAPI.
 *
 * - productSearchTool - The Genkit tool definition.
 * - ProductSearchInputSchema - Input schema for the tool.
 * - ProductSearchOutputItemSchema - Schema for individual search results.
 * - ProductSearchOutputSchema - Output schema for the tool (array of results).
 */

import { ai } from '@/ai/ai-instance';
import { z } from 'zod';

// Input schema for the tool
export const ProductSearchInputSchema = z.object({
  productName: z.string().describe('The name of the product to search for.'),
  requiredQuantity: z.number().optional().describe('The required quantity of the product. This helps in finding suppliers who can meet the demand.'),
});
export type ProductSearchInput = z.infer<typeof ProductSearchInputSchema>;

// Schema for a single search result item
export const ProductSearchOutputItemSchema = z.object({
  vendorName: z.string().optional().describe('Name of the website or vendor (previously sourceName).'), // Renamed from sourceName
  title: z.string().optional().describe('Product title or listing title.'),
  link: z.string().optional().describe('Direct link to the product page.'),
  contactOrQuoteUrl: z.string().optional().describe('URL for contacting the vendor or requesting a quote, if found.'), // New field
  extractedPrice: z.number().optional().describe('Price extracted from the listing.'),
  priceCurrency: z.string().optional().default('USD').describe('Currency of the price.'),
  snippet: z.string().optional().describe('A brief description or snippet from the search result.'),
  quantityContext: z.string().optional().describe('Information related to quantity, stock, or bulk availability if found.'),
});
export type ProductSearchOutputItem = z.infer<typeof ProductSearchOutputItemSchema>;

// Output schema for the tool (an array of search results)
export const ProductSearchOutputSchema = z.array(ProductSearchOutputItemSchema).describe('A list of potential product purchasing options found online (up to 5).');
export type ProductSearchOutput = z.infer<typeof ProductSearchOutputSchema>;


async function searchProductOnline(input: ProductSearchInput): Promise<ProductSearchOutput> {
  const { productName, requiredQuantity } = input;
  const serpApiKey = process.env.SERP_API_KEY;

  if (!serpApiKey) {
    console.warn('SERP_API_KEY is not set. Product search will not be performed.');
    return [{
      vendorName: productName, title: productName, snippet: 'SERP_API_KEY not configured. Real-time search unavailable.',
      priceCurrency: ''
    }];
  }

  let searchQuery = `buy ${productName}`;
  if (requiredQuantity && requiredQuantity > 1) {
    searchQuery += ` quantity ${requiredQuantity} wholesale`;
  } else {
    searchQuery += ` best price`;
  }

  const params = new URLSearchParams({
    q: searchQuery,
    api_key: serpApiKey,
    engine: 'google_shopping',
    num: '10',
  });

  const url = `https://serpapi.com/search.json?${params.toString()}`;
  console.log(`Product Search Tool: Searching for "${searchQuery}" using SerpApi.`);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      const errorData = await response.text();
      console.error(`SerpAPI request failed: ${response.status}`, errorData);
      return [{
        vendorName: productName, title: productName, snippet: `SerpAPI request failed: ${response.status}. ${errorData}`,
        priceCurrency: ''
      }];
    }
    const searchData = await response.json();

    const results: ProductSearchOutputItem[] = [];

    if (searchData.shopping_results && searchData.shopping_results.length > 0) {
      searchData.shopping_results.forEach((item: any) => {
        if (results.length < 5) {
          results.push({
            vendorName: item.source, // Use source as vendorName
            title: item.title,
            link: item.link,
            // contactOrQuoteUrl: undefined, // LLM will infer this
            extractedPrice: item.extracted_price || (typeof item.price === 'string' ? parseFloat(item.price.replace(/[^0-9.]/g, '')) : item.price),
            priceCurrency: item.currency || 'USD',
            snippet: item.snippet || item.rich_snippet?.top?.extensions?.join(' '),
            quantityContext: `Required: ${requiredQuantity || 1}. Source: Shopping result. Verify bulk availability.`,
          });
        }
      });
    }

    if (results.length < 5 && searchData.organic_results && searchData.organic_results.length > 0) {
      searchData.organic_results.forEach((item: any) => {
         if (results.length < 5) {
            let priceMatch = item.snippet?.match(/\$?([0-9,]+\.?[0-9]*)/) || item.title?.match(/\$?([0-9,]+\.?[0-9]*)/);
            let extractedPrice;
            if (priceMatch && priceMatch[1]) {
              extractedPrice = parseFloat(priceMatch[1].replace(/,/g, ''));
            }

            if (item.title?.toLowerCase().includes(productName.toLowerCase().split(' ')[0])) {
                results.push({
                    vendorName: item.source || new URL(item.link).hostname, // Use source or hostname as vendorName
                    title: item.title,
                    link: item.link,
                    // contactOrQuoteUrl: undefined, // LLM will infer this
                    extractedPrice: extractedPrice,
                    priceCurrency: 'USD',
                    snippet: item.snippet,
                    quantityContext: `Required: ${requiredQuantity || 1}. Source: Organic result. Verify price and bulk availability.`,
                });
            }
        }
      });
    }
    
    if (results.length === 0) {
        console.log(`Product Search Tool: No relevant product listings found for "${productName}".`);
        return [{
          vendorName: productName, title: productName, snippet: 'No relevant product listings found via web search.',
          priceCurrency: ''
        }];
    }

    const sortedResults = results
        .filter(r => r.extractedPrice !== undefined && r.extractedPrice > 0)
        .sort((a, b) => (a.extractedPrice ?? Infinity) - (b.extractedPrice ?? Infinity));
    
    console.log(`Product Search Tool: Found ${sortedResults.length} potential options for "${productName}". Returning top ${Math.min(sortedResults.length, 3)}.`);
    return sortedResults.slice(0, 3);

  } catch (error) {
    console.error('Error performing product search via SerpAPI:', error);
    return [{
      vendorName: productName, title: productName, snippet: `Error during web search: ${error instanceof Error ? error.message : 'Unknown error'}`,
      priceCurrency: ''
    }];
  }
}

// Define the Genkit tool
export const productSearchTool = ai.defineTool(
  {
    name: 'productSearchTool',
    description: 'Searches online using Google Shopping and Google Search for product pricing, vendor information, and purchase links. Tries to consider required quantity and returns up to 3 best options sorted by price. The "contactOrQuoteUrl" field will likely be undefined and should be inferred by the calling LLM if needed.',
    inputSchema: ProductSearchInputSchema,
    outputSchema: ProductSearchOutputSchema,
  },
  searchProductOnline 
);

