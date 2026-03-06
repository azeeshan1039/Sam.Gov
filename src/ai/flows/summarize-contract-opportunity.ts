export type AnalysisProgress = {
  status: 'pending' | 'downloading' | 'analyzing' | 'summarizing' | 'completed' | 'failed';
  progress: string;
  totalDocuments: number;
  processedDocuments: number;
};

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_ATTEMPTS = 200; // ~13 minutes max

/**
 * Starts an async analysis job and polls until completion.
 * Calls onProgress for each poll so the UI can show live status.
 * Returns the final result JSON or null on failure.
 */
async function fetchAnalyzedContractSummaryAsync(
  urls: string[],
  onProgress?: (progress: AnalysisProgress) => void,
): Promise<any | null> {
  try {
    const startRes = await fetch('/api/backend/analyze-solicitations/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    });

    if (!startRes.ok) {
      const err = await startRes.json();
      console.error('Failed to start analysis job:', err);
      return null;
    }

    const { job_id } = await startRes.json();
    if (!job_id) {
      console.error('No job_id returned from start endpoint');
      return null;
    }

    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const statusRes = await fetch(
        `/api/backend/analyze-solicitations/status?job_id=${encodeURIComponent(job_id)}`
      );

      if (!statusRes.ok) {
        console.error('Status poll failed:', statusRes.status);
        continue;
      }

      const data = await statusRes.json();

      onProgress?.({
        status: data.status,
        progress: data.progress || '',
        totalDocuments: data.total_documents ?? 0,
        processedDocuments: data.processed_documents ?? 0,
      });

      if (data.status === 'completed') {
        return data.result ?? null;
      }

      if (data.status === 'failed') {
        console.error('Analysis job failed:', data.error);
        return null;
      }
    }

    console.error('Analysis job timed out after max poll attempts');
    return null;
  } catch (error) {
    console.error('Fetch error:', error);
    return null;
  }
}

/**
 * Legacy synchronous call (kept for backward compatibility).
 */
async function fetchAnalyzedContractSummary(urls: string[]) {
  try {
    const response = await fetch('/api/backend/analyze-solicitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Error from Flask API:', errorData);
      return null;
    }

    return await response.json();
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

  return await res.json();
}

export {
  fetchAnalyzedContractSummary,
  fetchAnalyzedContractSummaryAsync,
  parseDescriptionWithGemini,
};
