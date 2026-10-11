import { NextResponse } from 'next/server';

import { liveSearch } from '@/lib/lab/live-search';

/**
 * Live InnerTube search proxy for the Search Playground.
 *
 * Sends EXACTLY the same unauthenticated request the Android app sends
 * (InnertubeClient: WEB_REMIX context, POST {query} to
 * https://music.youtube.com/youtubei/v1/search?prettyPrint=false) — no extra
 * headers, no credentials, no bypass of any protection. The request itself
 * lives in src/lib/lab/live-search.ts, shared verbatim with the run-qa live
 * probe (scripts/live-probe.ts) so every consumer hits the API identically.
 *
 * Then parses the response server-side with the SAME TS parser the browser
 * harness uses. Every failure is surfaced honestly: network, timeout, HTTP
 * status, or parse. This endpoint never pretends an empty parse is a success
 * without saying so.
 */

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const MAX_QUERY_LENGTH = 200;

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, errorKind: 'bad-request', message: 'Body must be JSON.' }, { status: 400 });
  }

  const envelope = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  const query =
    typeof envelope['query'] === 'string' ? (envelope['query'] as string).trim() : '';
  // includeRaw: the caller wants the untouched response root back so it can be
  // saved as a user fixture. Off by default — normal runs stay small.
  const includeRaw = envelope['includeRaw'] === true;
  if (query.length === 0) {
    return NextResponse.json({ ok: false, errorKind: 'bad-request', message: 'query must be a non-empty string.' }, { status: 400 });
  }
  if (query.length > MAX_QUERY_LENGTH) {
    return NextResponse.json({ ok: false, errorKind: 'bad-request', message: `query too long (max ${MAX_QUERY_LENGTH} chars).` }, { status: 400 });
  }

  const result = await liveSearch(query);
  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        errorKind: result.errorKind,
        message: result.message,
        ...(result.httpStatus !== null ? { httpStatus: result.httpStatus } : {}),
        durationMs: result.durationMs,
      },
      { status: 200 },
    );
  }

  // Parse server-side with the same harness parser (pure TS, no side effects).
  const { parseWithTrace } = await import('@/lib/lab/yt-search-parser');
  const parsed = parseWithTrace(result.root);

  const trackCount = (parsed.sections ?? []).reduce((sum, s) => sum + s.tracks.length, 0);
  return NextResponse.json({
    ok: true,
    httpStatus: result.httpStatus,
    durationMs: result.durationMs,
    query,
    byteLength: JSON.stringify(result.root).length,
    sections: parsed.sections,
    trace: parsed.trace,
    rendererStats: parsed.rendererStats,
    continuationToken: parsed.continuationToken,
    // Only present when requested (capture-as-fixture flow). Untouched response root.
    ...(includeRaw ? { raw: result.root } : {}),
    // Honest note: gibberish queries get fuzzy-matched by the API (never truly empty).
    note:
      trackCount === 0
        ? 'HTTP 200 but the parser produced 0 tracks — either the layout changed again (AUDIT-1 Finding A class) or the envelope is unknown. Check the trace below.'
        : null,
  });
}
