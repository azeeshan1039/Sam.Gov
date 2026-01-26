'use server';

import { NextResponse } from 'next/server';
import { getSamGovOpportunities } from '@/services/sam-gov';
import OpenAI from 'openai';


// Initialize OpenAI client
const openai = new OpenAI({ apiKey: "" });

export async function GET(request: Request, { params }: { params: { id: string } }) {
    try {
        const opportunityId = params.id;
        // 1. Fetch the specific opportunity details using opportunityId.
        // Note: This fetches a list and finds the ID. A dedicated fetch by ID function would be more efficient.
        const opportunities = await getSamGovOpportunities({}); // Fetch opportunities (you might want to add parameters here)
        const targetOpportunity = opportunities.find(opp => opp.id === opportunityId);

        if (!targetOpportunity) {
            return NextResponse.json({ error: `Opportunity with ID ${opportunityId} not found.` }, { status: 404 });
        }

        // 2. Access the resourceLinks, download files, and upload to OpenAI
        const fileInputs=[];

        if (targetOpportunity.resourceLinks && targetOpportunity.resourceLinks.length > 0) {
            for (const url of targetOpportunity.resourceLinks) {
                try {
                    const response = await fetch(url);

                    if (!response.ok) {
                        console.warn(`Failed to download attachment from ${url}. Status: ${response.status}`);
                        continue; // Skip to the next URL on download failure
                    }

                    // Get the filename from the URL or Content-Disposition header
                    // A simple approach: extract from URL path
                    const urlParts = url.split('/');
                    const filename = urlParts[urlParts.length - 1] || `attachment_${Date.now()}`;

                    // Get the file content as a Blob or Buffer
                    // Using blob() is often suitable for uploading
                    const fileBlob = await response.blob();

                    // Upload the file to OpenAI
                    const file = await openai.files.create({
                        // The 'file' parameter expects a Blob, File, or ReadableStream
                        file: fileBlob,
                        purpose: "user_data"
                    });

                    fileInputs.push({ type: "file", file_id: file.id });
                    console.log(`Successfully uploaded file ${filename} with ID: ${file.id}`);

                } catch (error) {
                    console.error(`Error processing attachment from ${url}:`, error);
                    // Continue processing other links even if one fails
                }
            }
        }

        
        // 4. Prepare input and 5. Call the AI summarization flow.
        // Replace Genkit flow call with OpenAI API call

        // Construct the content array for the user message
        const userMessageContent: any[] = [
            {
                type: "text",
                text: `You are now acting as my full-spectrum government contracting and sourcing expert. You specialize in working across all U.S. government agencies — including civilian, defense, and intelligence sectors — and you're proficient in interpreting solicitations from federal, state, and local governments.

Your job is to assist me through the entire sourcing and procurement process for government contracts. I will provide you with a solicitation (or you can help find one), and you will:

🔍 1. Read and Interpret the Solicitati ons
Analyze any solicitation documents (RFI, RFQ, RFP, IDIQ, BPA, etc.) and provide a plain-English summary of the requirement.

Identify the agency issuing it and explain the mission or goal of the procurement.

Highlight any critical requirements, special instructions, and mandatory compliance points.

🧠 2. Extract All Key Contract Data
From the solicitation, extract and organize the following:

Solicitation Number

NAICS Code(s)

PSC/FSC Code (if listed)

Set-aside Type (e.g., Small Business, 8(a), SDVOSB)

Contract Type (e.g., FFP, IDIQ, GSA Schedule)

Response Deadline and Submission Method

Evaluation Criteria (technical, price, past performance, etc.)

Product or Service Description

Quantity, Units, and Delivery Schedule

Contracting Officer or POC Contact Info

Any attachments or referenced FAR clauses

🔎 3. Identify and Understand the Product/Service
Break down exactly what product or service is being requested.

Translate technical language or obscure item descriptions into standard commercial equivalents.

If applicable, explain any relevant specifications, standards (e.g., MIL-SPEC, ANSI, ISO), or compliance certifications required.

🛒 4. Source the Product or Service
Use sourcing logic to locate the exact or equivalent item(s) being requested.

Search GSA Advantage, DLA, SAM.gov vendor lists, and major commercial suppliers (e.g., Grainger, Fastenal, McKesson, Dell, CDW).

Include relevant part numbers, prices, and lead times.

🤝 5. Find Suitable and Compliant Suppliers
Recommend 2–3 legitimate, cost-effective suppliers who meet the government’s requirements.

Prefer vendors that are: U.S.-based, registered in SAM.gov, and classified as small business, 8(a), HUBZone, woman-owned, or veteran-owned (if the set-aside requires it).

Include links to supplier profiles or catalogs and reasons for each recommendation.

💰 6. Price Comparison and Cost Optimization
Compare all pricing options and identify the lowest possible cost that still meets quality and compliance standards.

Include total cost breakdown (unit cost, shipping, tax, etc.)

Suggest whether to quote direct, use a distributor, or purchase via an existing contract vehicle (e.g., GSA Schedule, NASA SEWP, DLA TLSP).

📋 7. Final Recommendations and Next Steps
Provide a summary of findings and a recommended sourcing path.

List next steps for me to take — e.g., gather compliance docs, contact supplier, submit capability statement, or prepare a quote.

If the opportunity is not viable, explain why and suggest alternatives.

📎 Format:
Organize all output using clear section headers, bullet points, tables (if needed), and logical flow. Keep technical language concise but accurate. If the solicitation is missing key info, ask clarifying questions.
--- Instructions ---
Extract and structure the information into a JSON object based on the AnalyzeContractSolicitationOutputSchema. Include fields for solicitationSummary, keyContractData, productServiceAnalysis, sourcingRecommendations, supplierRecommendations, priceAnalysis, finalRecommendations, and clarifyingQuestions. Ensure the JSON is valid and includes all relevant details from the provided text and attachments.
`,
            }
        ];

        // Add file inputs if any files were uploaded
        userMessageContent.unshift(...fileInputs); // Add file inputs at the beginning of the content array, before the text

        // Construct the full messages array
        const messages: any[] = [
            {
                content: 'You are now acting as my full-spectrum government contracting and sourcing expert. You specialize in working across all U.S. government agencies — including civilian, defense, and intelligence sectors — and you\'re proficient in interpreting solicitations from federal, state, and local governments. Your job is to assist me through the entire sourcing and procurement process for government contracts by analyzing the provided information and extracting key data.',
            },
            {
                content: userMessageContent // Use the combined content array
            },
        ];

        // Call OpenAI API - using chat.completions.create for this structure
        // The example you provided with responses.create and 'input' might be for a
        // specific API version or experimental feature. chat.completions.create with
        // the content array structure is the standard way for multimodal input currently.
        const completion = await openai.responses.create({
            input: [
                {
                    "role": "system",
                    "content": [messages[0].content]
                },
                {
                    "role": "user",
                    "content": [messages[1].content]
                }
            ],
             // Instruct the model to return JSON
        });

        // 6. Return the AI summary.
        const aiSummaryJsonString = completion.output_text

        if (!aiSummaryJsonString) {
            throw new Error("OpenAI API did not return content.");
        }

        let aiSummary;
        try {
            aiSummary = JSON.parse(aiSummaryJsonString);
            // Optional: You might want to add Zod validation here to ensure the
            // parsed JSON matches AnalyzeContractSolicitationOutputSchema
            // AnalyzeContractSolicitationOutputSchema.parse(aiSummary);
        } catch (parseError) {
            console.error("Failed to parse OpenAI API response as JSON:", parseError);
            // Return the raw text response or throw an error
            return NextResponse.json({ error: "Failed to parse AI response.", rawContent: aiSummaryJsonString }, { status: 500 });
        }

        return NextResponse.json(aiSummary);
    } catch (error: any) {
        console.error(`Error processing opportunity ${params.id}:`, error);
        return NextResponse.json({ error: error.message || 'Failed to process opportunity summary' }, { status: 500 });
    }
}