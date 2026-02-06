/**
 * Sends a list of resource URLs to the Flask API for analysis,
 * then returns the parsed JSON response.
 * @param urls Array of URLs to analyze
 * @returns JSON response from Flask API or null if error
 */
async function fetchAnalyzedContractSummary(urls: string[]) {
  try {
    // Use Next.js proxy to avoid CORS issues
    const response = await fetch('/api/backend/analyze-solicitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    });
    // ADD TYPE FOR DESC SUMMARY
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error from Flask API:', errorData);
      return null;
    }

    const result = await response.json();
    return result;
  } catch (error) {
    console.error('Fetch error:', error);
    return null;
  }
}

async function parseDescriptionWithGemini(description: string) {
  const res = await fetch("/api/gemini/parse-description", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description: description }),
  });

  if (!res.ok) throw new Error("Gemini failed to parse description");

  return await res.json(); // assumed to return a structured summary
}

export { fetchAnalyzedContractSummary, parseDescriptionWithGemini };
