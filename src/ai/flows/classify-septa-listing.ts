'use server';

/**
 * @fileOverview An AI agent that classifies SEPTA listings into categories.
 *
 * - classifySeptaListing - A function that classifies a SEPTA listing.
 * - ClassifySeptaListingInput - The input type for the classifySeptaListing function.
 * - ClassifySeptaListingOutput - The return type for the classifySeptaListing function.
 */

import {ai} from '@/ai/ai-instance';
import {z} from 'genkit';

const ClassifySeptaListingInputSchema = z.object({
  listingDescription: z
    .string()
    .describe('The description of the SEPTA listing from the detail page.'),
});

export type ClassifySeptaListingInput = z.infer<
  typeof ClassifySeptaListingInputSchema
>;

const ClassifySeptaListingOutputSchema = z.object({
  tag: z
    .enum(['Product', 'Service', 'Product/Service'])
    .describe('The classification tag for the SEPTA listing.'),
});

export type ClassifySeptaListingOutput = z.infer<
  typeof ClassifySeptaListingOutputSchema
>;

export async function classifySeptaListing(
  input: ClassifySeptaListingInput
): Promise<ClassifySeptaListingOutput> {
  return classifySeptaListingFlow(input);
}

const prompt = ai.definePrompt({
  name: 'classifySeptaListingPrompt',
  input: {
    schema: z.object({
      listingDescription: z
        .string()
        .describe('The description of the SEPTA listing.'),
    }),
  },
  output: {
    schema: z.object({
      tag: z
        .enum(['Product', 'Service', 'Product/Service'])
        .describe('The classification tag for the SEPTA listing.'),
    }),
  },
  prompt: `You are an AI assistant helping classify SEPTA listings based on their description.

  Given the following description: {{{listingDescription}}}

  Determine whether the listing is for a "Product", a "Service", or a combination of both "Product/Service".

  Return the classification tag.`,
});

const classifySeptaListingFlow = ai.defineFlow<
  typeof ClassifySeptaListingInputSchema,
  typeof ClassifySeptaListingOutputSchema
>(
  {
    name: 'classifySeptaListingFlow',
    inputSchema: ClassifySeptaListingInputSchema,
    outputSchema: ClassifySeptaListingOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
