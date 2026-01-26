'use server';
/**
 * @fileOverview An AI agent that suggests relevant products for a given bid requirement.
 *
 * - suggestProductsForBid - A function that suggests products for a bid.
 * - SuggestProductsForBidInput - The input type for the suggestProductsForBid function.
 * - SuggestProductsForBidOutput - The return type for the suggestProductsForBid function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const SuggestProductsForBidInputSchema = z.object({
  bidRequirements: z
    .string()
    .describe('The description of the bid requirements.'),
  userCatalog: z.string().describe('The user product catalog.'),
  vendorEcosystem: z.string().describe('The vendor ecosystem.'),
});

export type SuggestProductsForBidInput = z.infer<
  typeof SuggestProductsForBidInputSchema
>;

const SuggestProductsForBidOutputSchema = z.object({
  suggestedProducts: z
    .string()
    .describe('The list of suggested products for the bid.'),
  pricingTrends: z.string().describe('Pricing trends for the suggested products.'),
  historicalData: z.string().describe('Historical data for the suggested products.'),
  recommendedPricePoints: z
    .string()
    .describe('Recommended price points for the suggested products.'),
});

export type SuggestProductsForBidOutput = z.infer<
  typeof SuggestProductsForBidOutputSchema
>;

export async function suggestProductsForBid(
  input: SuggestProductsForBidInput
): Promise<SuggestProductsForBidOutput> {
  return suggestProductsForBidFlow(input);
}

const prompt = ai.definePrompt({
  name: 'suggestProductsForBidPrompt',
  input: {
    schema: z.object({
      bidRequirements: z
        .string()
        .describe('The description of the bid requirements.'),
      userCatalog: z.string().describe('The user product catalog.'),
      vendorEcosystem: z.string().describe('The vendor ecosystem.'),
    }),
  },
  output: {
    schema: z.object({
      suggestedProducts: z
        .string()
        .describe('The list of suggested products for the bid.'),
      pricingTrends: z
        .string()
        .describe('Pricing trends for the suggested products.'),
      historicalData: z
        .string()
        .describe('Historical data for the suggested products.'),
      recommendedPricePoints: z
        .string()
        .describe('Recommended price points for the suggested products.'),
    }),
  },
  prompt: `You are an AI assistant helping users find products for a given bid requirement.

  Based on the following bid requirements: {{{bidRequirements}}}

  And given the following user catalog: {{{userCatalog}}}

  And the following vendor ecosystem: {{{vendorEcosystem}}}

  Suggest relevant products from the user's catalog or vendor ecosystem, along with pricing trends, historical data, and recommended price points.

  Return the suggested products, pricing trends, historical data, and recommended price points.`,
});

const suggestProductsForBidFlow = ai.defineFlow<
  typeof SuggestProductsForBidInputSchema,
  typeof SuggestProductsForBidOutputSchema
>(
  {
    name: 'suggestProductsForBidFlow',
    inputSchema: SuggestProductsForBidInputSchema,
    outputSchema: SuggestProductsForBidOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
