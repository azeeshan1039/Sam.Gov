
'use server';
/**
 * @fileOverview An AI agent that finds pricing information for a list of products
 * by using a web search tool.
 *
 * - findProductPricing - A function that takes a list of product names and quantity details,
 *                        and returns pricing information, website links, and vendor contacts for up to 3 vendors per product.
 * - FindProductPricingInput - The input type for the findProductPricing function.
 * - FindProductPricingOutput - The return type for the findProductPricing function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';
import { productSearchTool } from '@/ai/tools/product-search-tool';

const ProductPricingInputSchema = z.object({
  productList: z.array(z.string()).describe('A list of product/service names.'),
  quantityDetails: z.string().describe('A string containing details about quantities for the products, potentially mixed.'),
});
export type FindProductPricingInput = z.infer<typeof ProductPricingInputSchema>;

// Schema for a single vendor's offer for a product
const VendorOfferSchema = z.object({
  vendorName: z.string().optional().describe('The name of the vendor/supplier. This corresponds to "vendorName" from the search tool.'),
  rate: z.number().describe('Per-item price (unit_price, numeric). Set to 0 if not applicable or found. This corresponds to "extractedPrice" from the search tool.'),
  websiteLink: z.string().optional().describe('A plausible URL (product page or vendor site) where this item can be purchased at this rate. This corresponds to "link" from the search tool.'),
  contactOrQuoteUrl: z.string().optional().describe('A plausible URL for contacting the vendor or requesting a quote (e.g., vendor homepage, contact page). Infer this if not directly available. This might be the same as websiteLink if it is a general vendor page.'),
  subtotal: z.number().describe('Calculated subtotal for this vendor (rate * numeric part of identifiedQuantity for the product). Set to 0 if quantity is not numeric or rate is 0.'),
});

// Schema for all offers for a single product from the input list
const ProductOffersSchema = z.object({
  productName: z.string().describe('The product name from the input list.'),
  identifiedQuantity: z.string().describe('The specific quantity identified for this product from quantityDetails (e.g., "500 units", "200 sticks", or "Not numerically specified").'),
  offers: z.array(VendorOfferSchema).max(3).describe('Up to three best vendor offers found for this product, sorted by best rate first.'),
});

// Output schema for the entire flow
const ProductPricingOutputSchema = z.object({
  productsWithOffers: z.array(ProductOffersSchema).describe('An array of products, each with a list of vendor offers.'),
  overallTotalAmount: z.number().describe('The sum of the best (first) offer\'s subtotal for each product. If a product has no offers or its best offer has a subtotal of 0, its contribution to this total is 0.'),
});
export type FindProductPricingOutput = z.infer<typeof ProductPricingOutputSchema>;


export async function findProductPricing(input: FindProductPricingInput): Promise<FindProductPricingOutput> {
  return findProductPricingFlow(input);
}

const prompt = ai.definePrompt({
  name: 'findProductPricingPrompt',
  tools: [productSearchTool],
  input: {schema: ProductPricingInputSchema},
  output: {schema: ProductPricingOutputSchema},
  prompt: `You are an expert AI research assistant specializing in procurement and supply chain analysis, with access to a web search tool ('productSearchTool').
Your task is to process a list of product names and a string describing their quantities.
For each product, you need to find 3 best vendor offers based on the lowest unit price for the specified bulk quantity.

Product List:
{{#each productList}}
- {{{this}}}
{{/each}}

Quantity Details: "{{{quantityDetails}}}"

For each product in the 'productList':
1.  Determine its 'identifiedQuantity' and the numerical quantity by carefully parsing the 'quantityDetails' string.
    - Example: If 'productList' contains "SATA 2 HDD" and 'quantityDetails' says "500 SATA 2 HDD units...", then 'identifiedQuantity' is "500 units" and numerical quantity is 500.
    - If a product's quantity is not numerically specified in 'quantityDetails' (e.g., "Office Chairs"), use 1 as the numerical quantity for search purposes, and set 'identifiedQuantity' to "Not numerically specified".

2.  Use the 'productSearchTool' with the product name and its determined numerical quantity. The tool will return an array of web search results (each with 'vendorName', 'title', 'link', 'contactOrQuoteUrl' (often undefined), 'extractedPrice', 'snippet', 'quantityContext').

3.  From the array of search results provided by 'productSearchTool' for the current product:
    a.  Analyze all search results. Look for clues in 'title', 'snippet', 'quantityContext', and 'vendorName' to identify vendors that can supply the required numerical quantity.
    b.  Prioritize results that explicitly mention bulk, wholesale, B2B, or seem like official distributors/manufacturers if the quantity is large.
    c.  Identify **up to three best offers** that have the lowest 'extractedPrice' (this will be your 'rate') and seem most likely to fulfill the 'identifiedQuantity'. Sort them by rate, cheapest first.
    d.  If multiple results have similar low prices, prefer those with more direct product links or clearer vendor information.

4.  For each of the selected (up to three) best offers for the current product, populate a 'VendorOfferSchema' object:
    - 'vendorName': The 'vendorName' from the search result.
    - 'rate': The 'extractedPrice' from the search result. If no price is found or applicable, set to 0.
    - 'websiteLink': The 'link' from the search result. This should be a direct product page if possible, otherwise the vendor's site.
    - 'contactOrQuoteUrl': The 'contactOrQuoteUrl' from the search result if available. If not, infer a plausible contact URL (e.g., main domain + /contact, or the vendor's main website URL if specific contact is not found). This can be the same as 'websiteLink' if it's a general vendor page.
    - 'subtotal': Calculate as (rate * numerical_quantity). If numerical_quantity is 0 or rate is 0, then subtotal is 0.

5.  Construct a 'ProductOffersSchema' object for the current product:
    - 'productName': The product name from the input 'productList'.
    - 'identifiedQuantity': As determined in step 1.
    - 'offers': An array containing the (3) 'VendorOfferSchema' objects created in step 4. If no suitable offers are found, this array should be empty.

6.  If the 'productSearchTool' returns no relevant results (e.g., empty array, or items with "No relevant product listings found" or "SERP_API_KEY not configured" in snippet), or if you cannot confidently select any best options after analyzing the results, then for that product, its 'offers' array in 'ProductOffersSchema' should be empty.

After processing all products in 'productList':
1.  Collate all 'ProductOffersSchema' objects into the 'productsWithOffers' array.
2.  Calculate the 'overallTotalAmount'. For each product in 'productsWithOffers':
    - If its 'offers' array is not empty, take the 'subtotal' from the first (best) offer.
    - If 'offers' is empty or the best offer's subtotal is 0, that product contributes 0 to the 'overallTotalAmount'.
    - Sum these contributions to get the final 'overallTotalAmount'.

Return the complete information in the specified JSON format according to 'ProductPricingOutputSchema'.
Ensure all fields in each schema are populated accurately based on your analysis.
`,
});

const findProductPricingFlow = ai.defineFlow(
  {
    name: 'findProductPricingFlow',
    inputSchema: ProductPricingInputSchema,
    outputSchema: ProductPricingOutputSchema,
  },
  async (input) => {
    console.log("findProductPricingFlow: Input received:", JSON.stringify(input, null, 2));
    const {output} = await prompt(input);
    
    if (!output || !Array.isArray(output.productsWithOffers)) {
        console.error("AI failed to generate valid pricing output or productsWithOffers is missing/not an array. Input was:", JSON.stringify(input, null, 2));
        const errorProductsWithOffers = input.productList.map(productName => ({
            productName: productName,
            identifiedQuantity: "Error in AI processing",
            offers: [],
        }));
        return {
            productsWithOffers: errorProductsWithOffers,
            overallTotalAmount: 0,
        };
    }
    
    console.log("findProductPricingFlow: Raw AI output:", JSON.stringify(output, null, 2));

    let calculatedOverallTotalAmount = 0;
    const processedProductsWithOffers = output.productsWithOffers.map(productOfferGroup => {
        let bestOfferSubtotalForProduct = 0;
        
        const processedOffers = productOfferGroup.offers.map((offer:any) => {
            let numericQuantity = 0;
            const quantityMatch = String(productOfferGroup.identifiedQuantity || "").match(/(\d+(\.\d+)?)/);
            if (quantityMatch && quantityMatch[1]) {
                numericQuantity = parseFloat(quantityMatch[1]);
            } else if (productOfferGroup.identifiedQuantity === "Not numerically specified") {
                numericQuantity = 0; 
            }

            const rate = typeof offer.rate === 'number' ? offer.rate : 0;
            let subtotal = 0;
            if (numericQuantity > 0 && rate > 0) {
                subtotal = numericQuantity * rate;
            }
            
            const finalRate = (numericQuantity > 0 && rate > 0) ? rate : 0;

            if (offer.subtotal !== subtotal) {
                console.warn(`Subtotal mismatch for ${productOfferGroup.productName} (Vendor: ${offer.vendorName || 'Unknown'}). LLM: ${offer.subtotal}, Calculated: ${subtotal}. Using calculated.`);
            }
            return { 
                ...offer, 
                rate: finalRate, 
                subtotal: subtotal 
            };
        });

        // Sort offers by rate (cheapest first) after ensuring subtotals are correct
        const sortedOffers = processedOffers.sort((a:any, b:any) => (a.rate || Infinity) - (b.rate || Infinity));

        if (sortedOffers.length > 0 && sortedOffers[0].subtotal > 0) {
            bestOfferSubtotalForProduct = sortedOffers[0].subtotal;
        }
        calculatedOverallTotalAmount += bestOfferSubtotalForProduct;

        return {
            ...productOfferGroup,
            offers: sortedOffers,
        };
    });
    
    if (output.overallTotalAmount !== calculatedOverallTotalAmount) {
        console.warn(`Overall total amount mismatch. LLM: ${output.overallTotalAmount}, Calculated: ${calculatedOverallTotalAmount}. Using calculated.`);
    }
    
    const finalOutput = {
        productsWithOffers: processedProductsWithOffers,
        overallTotalAmount: calculatedOverallTotalAmount,
    };
    console.log("findProductPricingFlow: Processed output:", JSON.stringify(finalOutput, null, 2));
    return finalOutput;
  }
);

