/**
 * Shared LIVE InnerTube search client (WEBLAB-15).
 *
 * Extracted from src/app/api/lab/search/route.ts so that BOTH the API route and
 * the run-qa live-probe script (scripts/live-probe.ts) perform EXACTLY the same
 * unauthenticated request the Android app sends (InnertubeClient: WEB_REMIX
 * context, POST {query} to music.youtube.com/youtubei/v1/search) — no extra
 * headers, no credentials, no bypass of any protection.
 *
 * Pure I/O wrapper — no mocking, no caching, every failure surfaced honestly.
 */

const BASE_URL = 'https://music.youtube.com/youtubei/v1/';
const CLIENT_CONTEXT = {
  client: { clientName: 'WEB_REMIX', clientVersion: '1.20241028.01.00', hl: 'en', gl: 'US' },
};
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

export const LIVE_SEARCH_TIMEOUT_MS = 15_000;

export type LiveSearchResult =
  | { ok: true; httpStatus: number; durationMs: number; root: unknown }
  | { ok: false; errorKind: 'timeout' | 'network' | 'http' | 'parse'; message: string; durationMs: number; httpStatus: number | null };

/** The exact request init the Android app sends (kept verbatim from the route). */
export function liveSearchRequestInit(query: string): { url: string; init: RequestInit } {
  return {
    url: `${BASE_URL}search?prettyPrint=false`,
    init: {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ query, context: CLIENT_CONTEXT }),
      cache: 'no-store',
    },
  };
}

/**
 * One LIVE search against the public unauthenticated endpoint.
 * Never throws for request-level failures — they come back as honest results.
 */
export async function liveSearch(query: string, timeoutMs: number = LIVE_SEARCH_TIMEOUT_MS): Promise<LiveSearchResult> {
  const started = Date.now();
  const { url, init } = liveSearchRequestInit(query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    clearTimeout(timer);
    const aborted = error instanceof Error && error.name === 'AbortError';
    return {
      ok: false,
      errorKind: aborted ? 'timeout' : 'network',
      message: aborted
        ? `No response within ${timeoutMs / 1000}s (timeout).`
        : `Could not reach music.youtube.com: ${error instanceof Error ? error.message : 'unknown network error'}`,
      durationMs: Date.now() - started,
      httpStatus: null,
    };
  }
  clearTimeout(timer);

  const durationMs = Date.now() - started;
  if (!response.ok) {
    return {
      ok: false,
      errorKind: 'http',
      message: `Catalog responded with HTTP ${response.status}`,
      durationMs,
      httpStatus: response.status,
    };
  }

  let root: unknown;
  try {
    root = await response.json();
  } catch {
    return {
      ok: false,
      errorKind: 'parse',
      message: 'Catalog returned non-JSON data (API may have changed).',
      durationMs,
      httpStatus: response.status,
    };
  }

  return { ok: true, httpStatus: response.status, durationMs, root };
}
