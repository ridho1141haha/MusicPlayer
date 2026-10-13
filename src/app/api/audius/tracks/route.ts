/**
 * GET /api/audius/tracks — one normalized page of Audius tracks.
 *
 * Query params:
 *   kind    = search | trending | underground   (required)
 *   q       = search query                      (kind=search only)
 *   genre   = genre filter                      (optional, trending/underground)
 *   time    = week | month | year | allTime     (trending only, default week)
 *   offset  = pagination offset                 (default 0)
 *   limit   = page size                         (default 12, max 50)
 *
 * Server-side host discovery + failover keep the browser free of cross-host
 * retry logic; responses are normalized to AudiusTrack (see lib/lab/audius.ts).
 */
import { NextResponse } from 'next/server';

import { parsePaging, parseTimeWindow, AUDIUS_PAGE_SIZE, type AudiusSource } from '@/lib/lab/audius';
import { fetchAudiusPage } from '@/lib/lab/audius-server';

export const dynamic = 'force-dynamic';

const MAX_LIMIT = 50;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kindParam = url.searchParams.get('kind');
  const kind: AudiusSource | null =
    kindParam === 'search' || kindParam === 'trending' || kindParam === 'underground' ? kindParam : null;
  if (kind === null) {
    return NextResponse.json(
      { error: { kind: 'bad-request', message: "kind must be one of: search, trending, underground." } },
      { status: 400 },
    );
  }
  const genreParam = url.searchParams.get('genre');
  const result = await fetchAudiusPage({
    kind,
    query: url.searchParams.get('q') ?? '',
    genre: typeof genreParam === 'string' && genreParam.length > 0 ? genreParam : null,
    time: parseTimeWindow(url.searchParams.get('time')),
    offset: parsePaging(url.searchParams.get('offset'), 0, 10_000),
    limit: parsePaging(url.searchParams.get('limit'), AUDIUS_PAGE_SIZE, MAX_LIMIT),
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.error.status, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json(
    {
      kind,
      tracks: result.tracks,
      hasMore: result.hasMore,
      host: result.host,
      elapsedMs: result.elapsedMs,
      cached: result.cached,
      registryOk: result.registryOk,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
