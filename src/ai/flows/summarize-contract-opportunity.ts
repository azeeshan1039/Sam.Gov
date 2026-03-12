export type AnalysisProgress = {
  status: 'pending' | 'downloading' | 'analyzing' | 'summarizing' | 'completed' | 'failed';
  progress: string;
  totalDocuments: number;
  processedDocuments: number;
};

export type AnalysisResult = {
  result: any | null;
  jobId: string | null;
};

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_ATTEMPTS = 200; // ~13 minutes max

/**
 * Poll loop shared by both start-new and resume flows.
 * Returns 'completed' result, null on failure/timeout, or 'not_found' if job disappeared.
 */
const MAX_CONSECUTIVE_ERRORS = 10;

async function _pollJob(
  jobId: string,
  onProgress?: (progress: AnalysisProgress) => void,
): Promise<any | null | 'not_found'> {
  let consecutive404s = 0;
  let consecutiveErrors = 0;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    let statusRes: Response;
    try {
      statusRes = await fetch(
        `/api/backend/analyze-solicitations/status?job_id=${encodeURIComponent(jobId)}`
      );
    } catch (networkErr) {
      consecutiveErrors++;
      console.error(`Poll network error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, networkErr);
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error('Too many consecutive network errors — giving up');
        return null;
      }
      continue;
    }

    if (statusRes.status === 404) {
      consecutive404s++;
      consecutiveErrors++;
      if (consecutive404s >= 3) {
        console.error('Job not found after 3 attempts — server may have restarted');
        return 'not_found';
      }
      continue;
    }

    if (!statusRes.ok) {
      consecutiveErrors++;
      console.error(`Status poll failed (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, statusRes.status);
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.error('Too many consecutive poll errors — giving up');
        return null;
      }
      continue;
    }

    // Successful response — reset all error counters
    consecutive404s = 0;
    consecutiveErrors = 0;

    const data = await statusRes.json();

    if (data.error && data.error.includes('not found')) {
      return 'not_found';
    }

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
}

/**
 * Resume polling an existing job by its ID.
 * Returns { result, jobId } — result is null on failure, 'not_found' signals the caller to start fresh.
 */
async function pollExistingJob(
  jobId: string,
  onProgress?: (progress: AnalysisProgress) => void,
): Promise<AnalysisResult & { notFound?: boolean }> {
  try {
    const pollResult = await _pollJob(jobId, onProgress);
    if (pollResult === 'not_found') {
      return { result: null, jobId: null, notFound: true };
    }
    return { result: pollResult, jobId };
  } catch (error) {
    console.error('Poll error:', error);
    return { result: null, jobId };
  }
}

/**
 * Starts an async analysis job and polls until completion.
 * Calls onJobStarted immediately with the jobId so the caller can persist it.
 * Returns { result, jobId } on completion.
 */
async function fetchAnalyzedContractSummaryAsync(
  urls: string[],
  onProgress?: (progress: AnalysisProgress) => void,
  onJobStarted?: (jobId: string) => void,
): Promise<AnalysisResult> {
  try {
    const startRes = await fetch('/api/backend/analyze-solicitations/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
    });

    if (!startRes.ok) {
      const err = await startRes.json();
      console.error('Failed to start analysis job:', err);
      return { result: null, jobId: null };
    }

    const { job_id } = await startRes.json();
    if (!job_id) {
      console.error('No job_id returned from start endpoint');
      return { result: null, jobId: null };
    }

    onJobStarted?.(job_id);

    const pollResult = await _pollJob(job_id, onProgress);
    if (pollResult === 'not_found') {
      return { result: null, jobId: job_id };
    }
    return { result: pollResult, jobId: job_id };
  } catch (error) {
    console.error('Fetch error:', error);
    return { result: null, jobId: null };
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
  pollExistingJob,
  parseDescriptionWithGemini,
};
