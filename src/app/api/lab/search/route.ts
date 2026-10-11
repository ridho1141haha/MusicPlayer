import { NextResponse } from 'next/server';

/**
 * Live InnerTube search proxy for the Search Playground.
 *
 * Sends EXACTLY the same unauthenticated request the Android app sends
 * (InnertubeClient: WEB_REMIX context, POST {query} to
 * https://music.youtube.com/youtubei/v1/search?prettyPrint=false) — no extra
 * headers, no credentials, no bypass of any protection. Then parses the
 * response server-side with the SAME TS parser the browser harness uses.
 *
 * Every failure is surfaced honestly: network, timeout, HTTP status, or parse.
 * This endpoint never pretends an empty parse is a success without saying so.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const BASE_URL = 'https://music.youtube.com/youtubei/v1/';
const CLIENT_CONTEXT = {
  client: { clientName: 'WEB_REMIX', clientVersion: '1.20241028.01.00', hl: 'en', gl: 'US' },
};
const USER_AGENT =
  'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';
const TIMEOUT_MS = 15_000;
const MAX_QUERY_LENGTH = 200;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, errorKind: 'bad-request', message: 'Body must be JSON.' }, { status: 400 });
  }

  const query =
    body !== null && typeof body === 'object' && typeof (body as Record<string, unknown>)['query'] === 'string'
      ? ((body as Record<string, unknown>)['query'] as string).trim()
      : '';
  if (query.length === 0) {
    return NextResponse.json({ ok: false, errorKind: 'bad-request', message: 'query must be a non-empty string.' }, { status: 400 });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ ok: false, errorKind: 'bad-request', message: `query too long (max ${MAX_QUERY_LENGTH} chars).` }, { status: 400 });
  }

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(`${BASE_URL}search?prettyPrint=false`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Origin: 'https://music.youtube.com',
        Referer: 'https://music.youtube.com/',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ query, context: CLIENT_CONTEXT }),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (error) {
    clearTimeout(timer);
    const aborted = error instanceof Error && error.name === 'AbortError';
    return NextResponse.json({
      ok: false,
      errorKind: aborted ? 'timeout' : 'network',
      message: aborted
        ? `No response within ${TIMEOUT_MS / 1000}s (timeout).`
        : `Could not reach music.youtube.com: ${error instanceof Error ? error.message : 'unknown network error'}`,
      durationMs: Date.now() - started,
    });
  }
  clearTimeout(timer);

  const durationMs = Date.now() - started;
  if (!response.ok) {
    return NextResponse.json({
      ok: false,
      errorKind: 'http',
      httpStatus: response.status,
      message: `Catalog responded with HTTP ${response.status}`,
      durationMs,
    });
  }

  let root: unknown;
  try {
    root = await response.json();
  } catch {
    return NextResponse.json({
      ok: false,
      errorKind: 'parse',
      httpStatus: response.status,
      message: 'Catalog returned non-JSON data (API may have changed).',
      durationMs,
    });
  }

  // Parse server-side with the same harness parser (pure TS, no side effects).
  const { parseWithTrace } = await import('@/lib/lab/yt-search-parser');
  const result = parseWithTrace(root);

  const trackCount = (result.sections ?? []).reduce((sum, s) => sum + s.tracks.length, 0);
  return NextResponse.json({
    ok: true,
    httpStatus: response.status,
    durationMs,
    query,
    byteLength: JSON.stringify(root).length,
    sections: result.sections,
    trace: result.trace,
    rendererStats: result.rendererStats,
    continuationToken: result.continuationToken,
    // Honest note: gibberish queries get fuzzy-matched by the API (never truly empty).
    note:
      trackCount === 0
        ? 'HTTP 200 but the parser produced 0 tracks — either the layout changed again (AUDIT-1 Finding A class) or the envelope is unknown. Check the trace below.'
        : null,
  });
}
