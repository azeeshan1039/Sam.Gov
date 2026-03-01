import { NextResponse } from 'next/server';

/**
 * Server-side proxy to fetch SAM.gov description content
 * This avoids CORS issues when fetching from client-side
 */
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const descUrl = searchParams.get('url');

    if (!descUrl) {
        return NextResponse.json({ error: 'URL parameter required' }, { status: 400 });
    }

    try {
        // Validate URL is from SAM.gov
        const url = new URL(descUrl);
        if (!url.hostname.includes('sam.gov')) {
            return NextResponse.json({ error: 'Invalid URL - must be SAM.gov' }, { status: 400 });
        }

        // Add API key for all SAM.gov API requests
        const apiKey = process.env.SAM_GOV_API_KEY ?? process.env.NEXT_PUBLIC_SAM_GOV_API_KEY;
        console.log('API Key present:', !!apiKey, 'Key prefix:', apiKey?.substring(0, 10));

        if (apiKey) {
            url.searchParams.set('api_key', apiKey);
        } else {
            console.error('No SAM.gov API key found in environment!');
        }

        console.log('Fetching description from:', url.toString().replace(apiKey || '', '***'));

        const response = await fetch(url.toString(), {
            headers: {
                'Accept': 'application/json, text/html, text/plain, */*',
                'User-Agent': 'Contract-Finder/1.0',
            },
        });

        console.log('SAM.gov response status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('SAM.gov API error:', response.status, errorText.substring(0, 500));
            return NextResponse.json(
                { error: `SAM.gov returned ${response.status}` },
                { status: response.status }
            );
        }

        const contentType = response.headers.get('content-type') || '';
        const text = await response.text();

        console.log('Response content type:', contentType, 'Length:', text.length);

        // Try to parse as JSON first
        try {
            const json = JSON.parse(text);
            // SAM.gov description API returns HTML in "description" field
            // Return raw HTML so frontend can render structure (paragraphs, lists, etc.)
            if (json.description) {
                return NextResponse.json({ content: json.description, isHtml: true });
            }
            return NextResponse.json({ content: JSON.stringify(json), isHtml: false });
        } catch {
            // Not JSON, treat as raw HTML/text
            return NextResponse.json({ content: text, isHtml: true });
        }
    } catch (error: any) {
        console.error('Error proxying description:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch description' },
            { status: 500 }
        );
    }
}
