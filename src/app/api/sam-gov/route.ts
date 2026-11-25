
import { NextResponse } from 'next/server';
import { getSamGovCatalog } from '@/services/sam-gov';
import fetch from 'node-fetch'; // Explicitly import fetch

/**
 * Downloads files from a list of URLs and extracts text content.
 * NOTE: This is a basic implementation that treats all content as text.
 * It needs to be enhanced to handle different file types (PDF, DOCX, etc.).
 * @param urls - An array of URLs to download files from.
 * @returns A single string containing the extracted text content from all supported files.
 */
async function downloadAndExtractTextFromLinks(urls: string[]): Promise<string> {
  let allContent = '';
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        const text = await response.text();
        allContent += `\n---\nAttachment Content from ${url}\n---\n${text}\n`;
      } else {
        console.warn(`Failed to download attachment from ${url}: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error(`Error fetching attachment from ${url}:`, error);
    }
  }
  return allContent;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const searchParamsObject: Record<string, string> = {};
  searchParams.forEach((value, key) => {
    searchParamsObject[key] = value;
  });

  try {
    const catalog = await getSamGovCatalog(searchParamsObject);
    const headers = new Headers({ 'X-SAM-Gov-Source': catalog.source, 'Cache-Control': 'no-store' });
    if (catalog.lastFetched != null) headers.set('X-SAM-Gov-Last-Fetched', new Date(catalog.lastFetched).toISOString());
    if (catalog.issue) headers.set('X-SAM-Gov-Issue', catalog.issue);
    return NextResponse.json(catalog.opportunities, { headers });
  } catch (error: any) {
    console.error("Error in SAM.gov API route:", error);
    return NextResponse.json({ error: error.message || 'Failed to fetch SAM.gov opportunities' }, { status: 500 });
  }
}
