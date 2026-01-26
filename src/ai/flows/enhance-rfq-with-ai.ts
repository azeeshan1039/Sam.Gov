// src/ai/flows/enhance-rfq-with-ai.ts
'use server';
/**
 * @fileOverview A flow to enhance Request for Quotes (RFQs) using AI.
 *
 * - enhanceRfq - A function that takes an RFQ and enhances it with AI suggestions.
 * - EnhanceRfqInput - The input type for the enhanceRfq function.
 * - EnhanceRfqOutput - The return type for the enhanceRfq function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const EnhanceRfqInputSchema = z.object({
  rfqDetails: z.string().describe('The details of the RFQ, including products, quantities, and specifications.'),
  supplierList: z.array(z.string()).describe('A list of pre-approved suppliers to consider.'),
  historicalData: z.string().optional().describe('Historical data on past RFQs and supplier performance.'),
});
export type EnhanceRfqInput = z.infer<typeof EnhanceRfqInputSchema>;

const EnhanceRfqOutputSchema = z.object({
  revisedRfqDetails: z.string().describe('The revised RFQ details, incorporating AI suggestions for clarity and completeness.'),
  recommendedSuppliers: z.array(z.string()).describe('A list of recommended suppliers, ranked by suitability for the RFQ.'),
  suggestedTerms: z.string().describe('Suggested terms and conditions to include in the RFQ to ensure the best possible bids.'),
});
export type EnhanceRfqOutput = z.infer<typeof EnhanceRfqOutputSchema>;

export async function enhanceRfq(input: EnhanceRfqInput): Promise<EnhanceRfqOutput> {
  return enhanceRfqFlow(input);
}

const enhanceRfqPrompt = ai.definePrompt({
  name: 'enhanceRfqPrompt',
  input: {
    schema: z.object({
      rfqDetails: z.string().describe('The details of the RFQ.'),
      supplierList: z.array(z.string()).describe('A list of pre-approved suppliers.'),
      historicalData: z.string().optional().describe('Historical data on past RFQs and supplier performance.'),
    }),
  },
  output: {
    schema: z.object({
      revisedRfqDetails: z.string().describe('The revised RFQ details.'),
      recommendedSuppliers: z.array(z.string()).describe('A list of recommended suppliers, ranked by suitability.'),
      suggestedTerms: z.string().describe('Suggested terms and conditions to include in the RFQ.'),
    }),
  },
  prompt: `You are an AI assistant helping to improve the quality and effectiveness of Request for Quotes (RFQs). Given the following RFQ details, a list of pre-approved suppliers, and historical data, provide suggestions to enhance the RFQ.

RFQ Details:
{{{rfqDetails}}}

Supplier List:
{{#each supplierList}}{{{this}}}, {{/each}}

Historical Data (if available):
{{{historicalData}}}

Based on this information, please provide the following:

1.  Revised RFQ Details: Enhance the RFQ details to ensure clarity, completeness, and attractiveness to potential suppliers.
2.  Recommended Suppliers: Rank the suppliers in the provided list based on their suitability for this RFQ, considering factors like expertise, past performance, and pricing.
3.  Suggested Terms: Include suggested terms and conditions to ensure the best possible bids and protect the buyer's interests.

Output in JSON format.
`,
});

const enhanceRfqFlow = ai.defineFlow<
  typeof EnhanceRfqInputSchema,
  typeof EnhanceRfqOutputSchema
>({
  name: 'enhanceRfqFlow',
  inputSchema: EnhanceRfqInputSchema,
  outputSchema: EnhanceRfqOutputSchema,
},
async input => {
  const {output} = await enhanceRfqPrompt(input);
  return output!;
}
);
