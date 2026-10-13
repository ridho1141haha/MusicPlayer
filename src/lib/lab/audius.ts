/**
 * Audius integration — shared types + pure helpers (WEBLAB-23).
 *
 * Audius is the selected online music provider for the web QA preview. The
 * official public API (https://docs.audius.co) needs NO secrets: requests are
 * attributed with an `app_name` query parameter (documented mechanism), and
 * playback uses the documented stream endpoint `/v1/tracks/{id}/stream`,
 * which 302-redirects to the content CDN. Verified live 2026-10-13:
 *   - GET https://api.audius.co                          -> {data: [host...]}
 *   - GET {host}/v1/tracks/trending?app_name=…&time=week  -> 200 {data:[…]}
 *   - GET {host}/v1/tracks/trending/underground?…         -> 200 {data:[…]}
 *   - GET {host}/v1/tracks/search?query=…&app_name=…      -> 200 {data:[…]}
 *   - GET {host}/v1/tracks/{id}/stream?app_name=…         -> 302 CDN mp3
 * Pagination is `offset`+`limit`; `hasMore` is inferred (batch full ⇒ maybe more).
 *
 * This module is pure (no fetch, no DOM) so it stays unit-testable.
 */

/** The three list sources the Audius tab exposes. */
export type AudiusSource = 'search' | 'trending' | 'underground';

/** Trending time window (documented values). */
export type AudiusTimeWindow = 'week' | 'month' | 'year' | 'allTime';

/** Normalized track as used by the Audius tab UI. */
export interface AudiusTrack {
  /** Audius encoded track id, e.g. "J72oWO6". Namespaced as `audius:<id>` in queue keys. */
  id: string;
  title: string;
  artist: string;
  /** Genre label, e.g. "House", "Hip-Hop/Rap" (null when absent). */
  genre: string | null;
  /** Milliseconds (converted from the API's seconds for consistency with LabTrack). */
  durationMs: number;
  /** 480x480 artwork when present, else 150x150, else null. */
  artworkUrl: string | null;
  playCount: number;
  /** Direct audius.co permalink (opens the track page in a new tab). */
  permalink: string | null;
}

/** Envelope returned by /api/audius/tracks. */
export interface AudiusTracksPage {
  tracks: AudiusTrack[];
  /** True when the last batch was full — "Load more" may yield another page. */
  hasMore: boolean;
  /** The discovery host that actually served this page (transparency, no secrets). */
  host: string | null;
  elapsedMs: number | null;
}

/** Error kinds surfaced by the API layer (mapped to honest UI states). */
export type AudiusApiErrorKind = 'network' | 'upstream' | 'timeout' | 'bad-request' | 'no-hosts';

export interface AudiusApiError {
  kind: AudiusApiErrorKind;
  message: string;
  /** HTTP status returned to the client, kept for QA transparency. */
  status: number;
}

/** `app_name` attribution — the documented, non-secret identification mechanism. */
export const AUDIUS_APP_NAME = 'RidhoMusicWebLab';

/** Fallback host list used only when the registry itself is unreachable. */
export const AUDIUS_FALLBACK_HOSTS = ['https://api.audius.co'] as const;

/** Registry endpoint that publishes healthy discovery hosts. */
export const AUDIUS_HOST_REGISTRY = 'https://api.audius.co';

/** Default page size for search/trending lists (Audius caps at 100). */
export const AUDIUS_PAGE_SIZE = 12;

/** Genres offered for trending filtering (documented values; empty = all genres). */
export const AUDIUS_GENRES = [
  'Electronic',
  'Hip-Hop/Rap',
  'Lo-Fi',
  'Rock',
  'Ambient',
  'Jazz',
  'Classical',
  'R&B/Soul',
] as const;

/**
 * Builds the documented stream endpoint URL for a track. The <audio> element
 * follows the 302→(307)→CDN chain natively, so no server-side proxy is needed
 * and range-seek stays native. No credentials are embedded — app_name only.
 */
export function audiusStreamUrl(trackId: string, host: string = 'https://api.audius.co'): string {
  const cleanId = encodeURIComponent(trackId.trim());
  return `${host.replace(/\/+$/, '')}/v1/tracks/${cleanId}/stream?app_name=${encodeURIComponent(AUDIUS_APP_NAME)}`;
}

/** Queue key namespacing so Audius tracks can never collide with fixture ids. */
export function audiusTrackKey(track: Pick<AudiusTrack, 'id'>): string {
  return `audius:${track.id}`;
}

type RawArtwork = { '150x150'?: string; '480x480'?: string; '1000x1000'?: string } | null | undefined;

interface RawAudiusTrack {
  id?: unknown;
  title?: unknown;
  duration?: unknown;
  genre?: unknown;
  play_count?: unknown;
  permalink?: unknown;
  is_streamable?: unknown;
  is_delete?: unknown;
  is_available?: unknown;
  artwork?: RawArtwork;
  user?: { name?: unknown } | null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function pickArtwork(artwork: RawArtwork): string | null {
  if (!artwork) return null;
  return asString(artwork['480x480']) ?? asString(artwork['150x150']) ?? asString(artwork['1000x1000']);
}

/**
 * Normalizes one raw API track. Returns null for tracks that must not be
 * offered for playback (deleted / not streamable / not available) or that lack
 * an id — the API contract makes streamability explicit via
 * `is_streamable`/`is_available`/`access.stream`.
 */
export function normalizeAudiusTrack(raw: RawAudiusTrack): AudiusTrack | null {
  const id = asString(raw?.id);
  if (id === null) return null;
  if (raw?.is_delete === true) return null;
  if (raw?.is_streamable === false) return null;
  if (raw?.is_available === false) return null;
  const durationSec = typeof raw?.duration === 'number' && Number.isFinite(raw.duration) && raw.duration > 0 ? raw.duration : 0;
  return {
    id,
    title: asString(raw?.title) ?? 'Untitled',
    artist: asString(raw?.user?.name) ?? 'Unknown artist',
    genre: asString(raw?.genre),
    durationMs: Math.round(durationSec * 1000),
    artworkUrl: pickArtwork(raw?.artwork),
    playCount: typeof raw?.play_count === 'number' && Number.isFinite(raw.play_count) ? raw.play_count : 0,
    permalink: asString(raw?.permalink),
  };
}

/** Normalizes a raw `{data: [...]}` page, deduping by id and preserving order. */
export function normalizeAudiusPage(payload: unknown): AudiusTrack[] {
  const data = (payload as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  const byId = new Map<string, AudiusTrack>();
  for (const raw of data) {
    const track = normalizeAudiusTrack(raw as RawAudiusTrack);
    if (track !== null && !byId.has(track.id)) byId.set(track.id, track);
  }
  return [...byId.values()];
}

/** Appends a page to a list, deduping against what is already rendered. */
export function appendAudiusPage(existing: AudiusTrack[], incoming: AudiusTrack[]): AudiusTrack[] {
  const seen = new Set(existing.map((t) => t.id));
  const merged = [...existing];
  for (const track of incoming) {
    if (!seen.has(track.id)) {
      seen.add(track.id);
      merged.push(track);
    }
  }
  return merged;
}

/** `hasMore` inference: a full batch means another page MIGHT exist. */
export function pageHasMore(batchLength: number, limit: number): boolean {
  return batchLength >= limit;
}

/** Coarse play-count formatter for list rows (1.2K / 3.4M). */
export function formatPlayCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '0';
  if (count < 1000) return String(count);
  if (count < 1_000_000) return `${(count / 1000).toFixed(count < 10_000 ? 1 : 0)}K`;
  return `${(count / 1_000_000).toFixed(1)}M`;
}

/** Guards the `time` query param against junk. */
export function parseTimeWindow(value: string | null): AudiusTimeWindow {
  return value === 'month' || value === 'year' || value === 'allTime' ? value : 'week';
}

/** Guards the `limit`/`offset` params (server-side input hygiene). */
export function parsePaging(value: string | null, fallback: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(Math.trunc(n), 0), max);
}
