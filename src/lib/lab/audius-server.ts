/**
 * Audius server-side data layer (WEBLAB-23). Runs ONLY in Next.js API routes.
 *
 * Responsibilities:
 *  1. Host discovery — query the official registry (https://api.audius.co) for
 *     healthy discovery hosts, cache in memory (10 min). Falls back to the
 *     registry endpoint itself, which today IS a discovery node (verified live).
 *  2. Failover fetch — try hosts in order with a per-attempt timeout; one full
 *     retry cycle before giving up. Errors map to AudiusApiError kinds.
 *  3. Short-TTL response cache (60 s) so rapid tab switches / load-more calls
 *     stay polite to the public API.
 *
 * No credentials exist or are needed: attribution is the documented `app_name`
 * query parameter (see src/lib/lab/audius.ts). Nothing secret is logged.
 */
import {
  AUDIUS_APP_NAME,
  AUDIUS_FALLBACK_HOSTS,
  AUDIUS_HOST_REGISTRY,
  normalizeAudiusPage,
  pageHasMore,
  type AudiusApiError,
  type AudiusTimeWindow,
  type AudiusTrack,
} from './audius';

const HOST_TTL_MS = 10 * 60 * 1000;
const PAGE_TTL_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 8_000;
const USER_AGENT = 'RidhoMusicWebLab/1.0 (+web-qa-preview)';

interface HostCache {
  hosts: string[];
  fetchedAt: number;
}
interface PageCache {
  tracks: AudiusTrack[];
  hasMore: boolean;
  expiresAt: number;
}

const hostCache: HostCache = { hosts: [], fetchedAt: 0 };
const pageCache = new Map<string, PageCache>();

function timedFetch(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, {
    signal: controller.signal,
    cache: 'no-store',
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  }).finally(() => clearTimeout(timer));
}

/** Queries the official registry; falls back to the registry host itself. */
export async function resolveAudiusHosts(): Promise<{ hosts: string[]; registryOk: boolean }> {
  const now = Date.now();
  if (hostCache.hosts.length > 0 && now - hostCache.fetchedAt < HOST_TTL_MS) {
    return { hosts: hostCache.hosts, registryOk: true };
  }
  try {
    const res = await timedFetch(AUDIUS_HOST_REGISTRY, FETCH_TIMEOUT_MS);
    if (!res.ok) throw new Error(`registry HTTP ${res.status}`);
    const payload = (await res.json()) as { data?: unknown };
    const hosts = Array.isArray(payload?.data)
      ? payload.data.filter((h): h is string => typeof h === 'string' && /^https:\/\//.test(h))
      : [];
    if (hosts.length === 0) throw new Error('registry returned no hosts');
    hostCache.hosts = hosts;
    hostCache.fetchedAt = now;
    return { hosts, registryOk: true };
  } catch {
    // Registry unreachable — the registry host is itself a discovery node.
    const fallback = [...AUDIUS_FALLBACK_HOSTS];
    hostCache.hosts = fallback;
    hostCache.fetchedAt = now;
    return { hosts: fallback, registryOk: false };
  }
}

export interface AudiusListParams {
  kind: 'search' | 'trending' | 'underground';
  query: string;
  genre: string | null;
  time: AudiusTimeWindow;
  offset: number;
  limit: number;
}

function buildUpstreamPath(params: AudiusListParams): string {
  const qs = new URLSearchParams();
  qs.set('app_name', AUDIUS_APP_NAME);
  qs.set('limit', String(params.limit));
  qs.set('offset', String(params.offset));
  if (params.kind === 'search') {
    qs.set('query', params.query);
    return `/v1/tracks/search?${qs.toString()}`;
  }
  if (params.genre) {
    // Audius trending accepts a genre filter via the documented `genre` param.
    qs.set('genre', params.genre);
  }
  if (params.kind === 'trending') {
    qs.set('time', params.time);
    return `/v1/tracks/trending?${qs.toString()}`;
  }
  return `/v1/tracks/trending/underground?${qs.toString()}`;
}

function cacheKey(params: AudiusListParams, host: string): string {
  return [host, params.kind, params.query, params.genre ?? '', params.time, params.offset, params.limit].join('|');
}

export type AudiusListResult =
  | { ok: true; tracks: AudiusTrack[]; hasMore: boolean; host: string; elapsedMs: number; registryOk: boolean; cached: boolean }
  | { ok: false; error: AudiusApiError };

/**
 * Fetches one page of tracks with host failover. Pure-transport errors are
 * classified honestly: network (fetch threw), timeout (abort), upstream
 * (non-2xx), bad-request (client sent an empty search query).
 */
export async function fetchAudiusPage(params: AudiusListParams): Promise<AudiusListResult> {
  if (params.kind === 'search' && params.query.trim().length === 0) {
    return { ok: false, error: { kind: 'bad-request', message: 'Search query is empty.', status: 400 } };
  }
  const started = Date.now();
  const { hosts, registryOk } = await resolveAudiusHosts();

  const key = cacheKey(params, hosts[0] ?? '');
  const cached = pageCache.get(key);
  if (cached && Date.now() < cached.expiresAt) {
    return { ok: true, tracks: cached.tracks, hasMore: cached.hasMore, host: hosts[0] ?? null, elapsedMs: Date.now() - started, registryOk, cached: true };
  }

  const path = buildUpstreamPath(params);
  let lastError: AudiusApiError = { kind: 'network', message: 'No discovery host reachable.', status: 502 };

  for (let attempt = 0; attempt < 2; attempt += 1) {
    for (const host of hosts) {
      try {
        const res = await timedFetch(`${host.replace(/\/+$/, '')}${path}`, FETCH_TIMEOUT_MS);
        if (!res.ok) {
          lastError = { kind: 'upstream', message: `Audius upstream responded HTTP ${res.status} (${host}).`, status: 502 };
          continue;
        }
        const tracks = normalizeAudiusPage(await res.json());
        const hasMore = pageHasMore(tracks.length, params.limit);
        pageCache.set(key, { tracks, hasMore, expiresAt: Date.now() + PAGE_TTL_MS });
        return { ok: true, tracks, hasMore, host, elapsedMs: Date.now() - started, registryOk, cached: false };
      } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError';
        lastError = aborted
          ? { kind: 'timeout', message: `Audius request timed out after ${FETCH_TIMEOUT_MS / 1000}s (${host}).`, status: 504 }
          : { kind: 'network', message: `Network error reaching ${host}: ${error instanceof Error ? error.message : 'unknown'}.`, status: 502 };
      }
    }
  }
  return { ok: false, error: lastError };
}

/** Clears caches — used by tests/maintenance, harmless in prod. */
export function resetAudiusCaches(): void {
  hostCache.hosts = [];
  hostCache.fetchedAt = 0;
  pageCache.clear();
}
