'use server';

/**
 * @fileOverview Ranks contract opportunities based on user preferences using OpenAI API.
 */

import OpenAI from 'openai';
import { z } from 'genkit';

// Define the schema for user preferences
const UserPreferencesSchema = z.object({
  opportunityType: z.enum(['product', 'service', 'product/service', '']).optional(),
  location: z.string().optional(),
  interestedDepartments: z.string().optional(),
});

// Input schema
const RankOpportunitiesInputSchema = z.object({
  opportunityDescription: z.string(),
  userPreferences: UserPreferencesSchema,
});
export type RankOpportunitiesInput = z.infer<typeof RankOpportunitiesInputSchema>;

// Output schema
const RankOpportunitiesOutputSchema = z.object({
  relevanceScore: z.number().min(0).max(1),
});
export type RankOpportunitiesOutput = z.infer<typeof RankOpportunitiesOutputSchema>;

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Ensure this is set in your .env.local
});

/**
 * Main function to rank an opportunity
 */
export async function rankOpportunities(
  input: RankOpportunitiesInput
): Promise<RankOpportunitiesOutput> {
  // Provide default empty preferences if undefined
  const userPreferences = input.userPreferences || {
    opportunityType: '',
    location: '',
    interestedDepartments: '',
  };

  // Build the prompt
  const prompt = `
You are an AI assistant that ranks contract opportunities based on user preferences.

Opportunity description:
"${input.opportunityDescription}"

User preferences:
- Opportunity Type: "${userPreferences.opportunityType || 'Any'}"
- Location: "${userPreferences.location || 'Anywhere'}"
- Interested Departments/Agencies: "${userPreferences.interestedDepartments || 'Any'}"

Analyze the opportunity description and provide a relevance score between 0.0 and 1.0 (inclusive),
where 1.0 is a perfect match and 0.0 is not relevant at all.

Return ONLY a JSON object like:
{ "relevanceScore": 0.75 }
`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4',
      messages: [
        {
          role: 'system',
          content:
            'You are a JSON-only API. Always respond with a valid JSON object, nothing else.',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0,
    });

    const message = response.choices?.[0]?.message?.content;

    if (!message) {
      return { relevanceScore: 0 };
    }

    // Parse the returned JSON
    const parsed = JSON.parse(message);
    return { relevanceScore: parsed.relevanceScore ?? 0 };
  } catch (err) {
    console.error('Error ranking opportunity:', err);
    return { relevanceScore: 0 };
  }
}
