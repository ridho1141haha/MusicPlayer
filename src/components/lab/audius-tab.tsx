'use client';

/**
 * AudiusTab (WEBLAB-23) — the REAL online player of the web lab.
 *
 * Replaces simulated playback with the official Audius public API:
 *  - Search tracks (/v1/tracks/search)
 *  - Trending (/v1/tracks/trending, time window + genre filters)
 *  - Underground (/v1/tracks/trending/underground)
 *  - Playback via the documented stream endpoint (302 → CDN, native seeking)
 *
 * Honest states everywhere: skeletons while loading, explicit empty state,
 * error kinds (network/timeout/upstream) with retry, buffering indicator on
 * the artwork, load-more pagination (offset-based, deduped). The player is a
 * single persistent <audio> element managed by useAudiusPlayer.
 *
 * The other lab tabs (fixtures/parser/QA harness) are untouched — this tab is
 * additive and self-contained.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Flame,
  ListMusic,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Search,
  SkipBack,
  SkipForward,
  Sprout,
  Volume2,
  VolumeX,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { EmptyState } from '@/components/lab/empty-state';
import { useAudiusPlayer, formatClock } from '@/hooks/use-audius-player';
import {
  AUDIUS_GENRES,
  AUDIUS_PAGE_SIZE,
  appendAudiusPage,
  audiusTrackKey,
  formatPlayCount,
  type AudiusApiError,
  type AudiusSource,
  type AudiusTimeWindow,
  type AudiusTrack,
} from '@/lib/lab/audius';
import { formatDuration } from '@/lib/lab/format';

type ListStatus = 'idle' | 'loading' | 'ready' | 'error';

const TIME_OPTIONS: Array<{ value: AudiusTimeWindow; label: string }> = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
  { value: 'year', label: 'This year' },
  { value: 'allTime', label: 'All time' },
];

const SOURCE_OPTIONS: Array<{ value: AudiusSource; label: string; icon: typeof Search }> = [
  { value: 'search', label: 'Search', icon: Search },
  { value: 'trending', label: 'Trending', icon: Flame },
  { value: 'underground', label: 'Underground', icon: Sprout },
];

function describeListError(error: AudiusApiError): string {
  switch (error.kind) {
    case 'network':
      return 'Could not reach the Audius network. Check the connection and retry.';
    case 'timeout':
      return 'The Audius request timed out. The discovery host may be slow — retry.';
    case 'upstream':
      return 'The Audius API returned an error. This is usually transient — retry.';
    case 'no-hosts':
      return 'No Audius discovery host is reachable right now.';
    case 'bad-request':
      return 'The request was invalid (empty search query).';
    default:
      return error.message || 'Unknown Audius request failure.';
  }
}

/** Animated "now playing" bars (3 bars, staggered scaleY). */
function EqualizerBars() {
  return (
    <span className="flex h-4 items-end gap-[2px]" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="w-[3px] rounded-full bg-primary"
          animate={{ height: ['25%', '100%', '45%', '85%', '25%'] }}
          transition={{ duration: 1.1, repeat: Infinity, delay: i * 0.18, ease: 'easeInOut' }}
        />
      ))}
    </span>
  );
}

/** Artwork with honest fallback (never a broken-image glyph). */
function TrackArtwork({ track, className }: { track: AudiusTrack; className: string }) {
  const [failed, setFailed] = useState(false);
  // Official "adjust state when a prop changes" pattern: reset during render
  // when the artwork URL changes (no cascading-render effect needed).
  const [lastUrl, setLastUrl] = useState(track.artworkUrl);
  if (lastUrl !== track.artworkUrl) {
    setLastUrl(track.artworkUrl);
    setFailed(false);
  }
  if (track.artworkUrl === null || failed) {
    return (
      <span className={`flex items-center justify-center rounded-lg bg-secondary text-muted-foreground ${className}`} aria-hidden="true">
        <ListMusic className="h-1/2 w-1/2" />
      </span>
    );
  }
  return (
    <img
      src={track.artworkUrl}
      alt={`Artwork for ${track.title}`}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`rounded-lg object-cover ${className}`}
    />
  );
}

interface TrackRowProps {
  track: AudiusTrack;
  index: number;
  isCurrent: boolean;
  isPlaying: boolean;
  onPlay: (track: AudiusTrack, index: number) => void;
}

function AudiusTrackRow({ track, index, isCurrent, isPlaying, onPlay }: TrackRowProps) {
  return (
    <button
      type="button"
      onClick={() => onPlay(track, index)}
      data-testid="audius-track-row"
      aria-label={`Play ${track.title} by ${track.artist}`}
      className={`group flex w-full items-center gap-3 rounded-xl border border-transparent p-2.5 text-left transition-colors min-h-[64px] ${
        isCurrent ? 'border-primary/25 bg-primary/10' : 'hover:bg-secondary/60'
      }`}
    >
      <TrackArtwork track={track} className="h-12 w-12 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className={`block truncate text-sm font-medium ${isCurrent ? 'text-primary' : ''}`}>{track.title}</span>
        <span className="block truncate text-xs text-muted-foreground">{track.artist}</span>
      </span>
      {track.genre && (
        <Badge variant="secondary" className="hidden shrink-0 font-normal md:inline-flex">
          {track.genre}
        </Badge>
      )}
      <span className="hidden shrink-0 text-[11px] tabular-nums text-muted-foreground sm:block" title={`${formatPlayCount(track.playCount)} plays`}>
        {formatPlayCount(track.playCount)} ▶
      </span>
      <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {formatDuration(track.durationMs)}
      </span>
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center">
        {isCurrent && isPlaying ? (
          <EqualizerBars />
        ) : isCurrent ? (
          <Pause className="h-4 w-4 text-primary" aria-hidden="true" />
        ) : (
          <Play className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
        )}
      </span>
    </button>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-2" data-testid="audius-list-skeleton" aria-label="Loading tracks">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl p-2.5">
          <Skeleton className="h-12 w-12 rounded-lg" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-4 w-10" />
        </div>
      ))}
    </div>
  );
}

export function AudiusTab() {
  const player = useAudiusPlayer();

  // ---- discovery inputs ----
  const [source, setSource] = useState<AudiusSource>('trending');
  const [queryInput, setQueryInput] = useState('');
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [genre, setGenre] = useState<string>('all');
  const [time, setTime] = useState<AudiusTimeWindow>('week');

  // ---- list state ----
  const [tracks, setTracks] = useState<AudiusTrack[]>([]);
  const [listStatus, setListStatus] = useState<ListStatus>('idle');
  const [listError, setListError] = useState<AudiusApiError | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hostInfo, setHostInfo] = useState<string | null>(null);
  const [searchHint, setSearchHint] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);

  const fetchPage = useCallback(
    async (append: boolean, overrideOffset?: number) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      const seq = ++requestSeqRef.current;

      const offset = overrideOffset ?? 0;
      if (append) setLoadingMore(true);
      else setListStatus('loading');
      setListError(null);

      const params = new URLSearchParams({ kind: source, limit: String(AUDIUS_PAGE_SIZE), offset: String(offset) });
      if (source === 'search') params.set('q', submittedQuery);
      if (source !== 'search' && genre !== 'all') params.set('genre', genre);
      if (source === 'trending') params.set('time', time);

      try {
        const res = await fetch(`/api/audius/tracks?${params.toString()}`, { signal: controller.signal, cache: 'no-store' });
        const payload = (await res.json()) as
          | { tracks: AudiusTrack[]; hasMore: boolean; host: string; elapsedMs: number; cached: boolean }
          | { error: AudiusApiError };
        if (seq !== requestSeqRef.current) return; // stale response
        if (!res.ok || 'error' in payload) {
          const error = 'error' in payload ? payload.error : { kind: 'upstream', message: `HTTP ${res.status}`, status: res.status };
          if (append) setLoadingMore(false);
          else setListStatus('error');
          setListError(error);
          return;
        }
        const page = payload.tracks;
        setTracks((prev) => (append ? appendAudiusPage(prev, page) : page));
        setHasMore(payload.hasMore);
        setNextOffset(offset + AUDIUS_PAGE_SIZE);
        setHostInfo(`${payload.host.replace(/^https:\/\//, '')} · ${payload.elapsedMs}ms${payload.cached ? ' · cached' : ''}`);
        if (append) setLoadingMore(false);
        else setListStatus('ready');
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (seq !== requestSeqRef.current) return;
        const fetchError: AudiusApiError = { kind: 'network', message: 'Fetch failed.', status: 0 };
        if (append) setLoadingMore(false);
        else setListStatus('error');
        setListError(fetchError);
      }
    },
    [genre, source, submittedQuery, time],
  );

  // Reload page 0 whenever the discovery inputs change (per-source state resets).
  // The fetch is deferred one tick so the effect body never sets state synchronously.
  useEffect(() => {
    const timer = setTimeout(() => void fetchPage(false, 0), 0);
    return () => {
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [fetchPage]);

  // Host status chip (non-blocking transparency).
  const [registryOk, setRegistryOk] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/audius/hosts', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data: { registryOk?: boolean }) => {
        if (!cancelled) setRegistryOk(data.registryOk ?? null);
      })
      .catch(() => {
        if (!cancelled) setRegistryOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const onSourceChange = (next: AudiusSource) => {
    if (next === source) return;
    setSource(next);
    setTracks([]);
    setListStatus('idle');
    setListError(null);
    setHasMore(false);
    setSearchHint(null);
  };

  const submitSearch = () => {
    const q = queryInput.trim();
    if (q.length === 0) {
      setSearchHint('Type a track or artist name to search Audius.');
      return;
    }
    setSearchHint(null);
    setSubmittedQuery(q);
  };

  const handleRowPlay = (track: AudiusTrack, index: number) => {
    if (player.current?.id === track.id) {
      player.toggle();
    } else {
      player.playContext(tracks, index);
    }
  };

  const loadMore = () => {
    if (loadingMore || !hasMore) return;
    void fetchPage(true, nextOffset);
  };

  const current = player.current;
  const duration = player.duration > 0 ? player.duration : current ? current.durationMs / 1000 : 0;
  const seekValue = Math.min(player.currentTime, duration || player.currentTime || 0);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_400px]" data-testid="audius-tab">
      {/* ---- discovery + list (left / below player on mobile) ---- */}
      <section aria-label="Audius track discovery" className="order-2 min-w-0 lg:order-1">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Audius source" className="flex rounded-xl border border-border bg-background/60 p-1">
            {SOURCE_OPTIONS.map((option) => {
              const Icon = option.icon;
              const selected = source === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => onSourceChange(option.value)}
                  className={`relative flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-sm transition-colors ${
                    selected ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {selected && (
                    <motion.span layoutId="audius-source-pill" className="absolute inset-0 rounded-lg bg-primary/15 ring-1 ring-primary/25" transition={{ type: 'spring', stiffness: 420, damping: 34 }} aria-hidden="true" />
                  )}
                  <Icon className="relative h-4 w-4" aria-hidden="true" />
                  <span className="relative">{option.label}</span>
                </button>
              );
            })}
          </div>
          {source === 'trending' && (
            <Select value={time} onValueChange={(v) => setTime(v as AudiusTimeWindow)}>
              <SelectTrigger className="h-9 w-[130px]" aria-label="Trending time window">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TIME_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {source !== 'search' && (
            <Select value={genre} onValueChange={setGenre}>
              <SelectTrigger className="h-9 w-[140px]" aria-label="Genre filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All genres</SelectItem>
                {AUDIUS_GENRES.map((g) => (
                  <SelectItem key={g} value={g}>
                    {g}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {source === 'search' && (
          <form
            className="mb-4 flex gap-2"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              submitSearch();
            }}
          >
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                value={queryInput}
                onChange={(event) => {
                  setQueryInput(event.target.value);
                  if (searchHint) setSearchHint(null);
                }}
                placeholder="Search Audius tracks or artists…"
                aria-label="Search Audius tracks"
                className="pl-9"
                data-testid="audius-search-input"
              />
            </div>
            <Button type="submit" className="min-h-[40px]" data-testid="audius-search-submit">
              Search
            </Button>
          </form>
        )}
        {searchHint && (
          <p className="mb-3 text-xs text-amber-600 dark:text-amber-400" role="status">
            {searchHint}
          </p>
        )}

        {listStatus === 'loading' && <ListSkeleton />}

        {listStatus === 'error' && listError && (
          <EmptyState
            icon={AlertTriangle}
            title="Could not load tracks"
            description={describeListError(listError)}
            action={
              <Button variant="outline" size="sm" className="mt-2" onClick={() => void fetchPage(false, 0)} data-testid="audius-list-retry">
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> Retry
              </Button>
            }
          />
        )}

        {listStatus === 'ready' && tracks.length === 0 && (
          <EmptyState
            icon={source === 'search' ? Search : ListMusic}
            title={source === 'search' ? `No results for “${submittedQuery}”` : 'No tracks found'}
            description={
              source === 'search'
                ? 'Audius full-text search can be strict — try a shorter or different query.'
                : 'The selected filter combination returned no tracks. Try another genre or time window.'
            }
          />
        )}

        {(listStatus === 'ready' || listStatus === 'idle') && tracks.length > 0 && (
          <>
            <div className="rounded-xl border border-border bg-background/40 p-1.5 sm:p-2">
              {tracks.map((track, index) => (
                <AudiusTrackRow
                  key={audiusTrackKey(track)}
                  track={track}
                  index={index}
                  isCurrent={current?.id === track.id}
                  isPlaying={player.isPlaying}
                  onPlay={handleRowPlay}
                />
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {tracks.length} track{tracks.length === 1 ? '' : 's'}
                {hostInfo ? ` · via ${hostInfo}` : ''}
              </p>
              {hasMore && (
                <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore} data-testid="audius-load-more">
                  {loadingMore ? (
                    <>
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Loading…
                    </>
                  ) : (
                    'Load more'
                  )}
                </Button>
              )}
            </div>
            {/* Append failures must never be silent: keep the loaded page, surface an inline retry. */}
            {listError && (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert" data-testid="audius-append-error">
                <span className="min-w-0 truncate">{describeListError(listError)}</span>
                <Button variant="outline" size="sm" className="h-7 shrink-0 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={loadMore} disabled={loadingMore}>
                  <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" /> Retry
                </Button>
              </div>
            )}
          </>
        )}
      </section>

      {/* ---- player (right on desktop, first on mobile) ---- */}
      <aside className="order-1 min-w-0 lg:order-2" aria-label="Audius player">
        <Card className="lg:sticky lg:top-28">
          <CardContent className="p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Now playing · Audius</p>
              <span
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground"
                title={registryOk === null ? 'Checking Audius network…' : registryOk ? 'Audius discovery registry healthy' : 'Using fallback Audius host'}
                data-testid="audius-status-chip"
              >
                <span className={`h-1.5 w-1.5 rounded-full ${registryOk === false ? 'bg-amber-500' : 'bg-emerald-500'}`} aria-hidden="true" />
                {registryOk === false ? 'fallback host' : 'live network'}
              </span>
            </div>

            {/* artwork + buffering overlay */}
            <div className="relative mx-auto mb-4 aspect-square w-full max-w-[240px] overflow-hidden rounded-xl border border-border bg-secondary/40">
              {current ? (
                <>
                  <TrackArtwork track={current} className="h-full w-full" />
                  {player.isBuffering && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/60 backdrop-blur-[2px]" data-testid="audius-buffering">
                      <Loader2 className="h-7 w-7 animate-spin text-primary" aria-label="Buffering" />
                    </div>
                  )}
                </>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
                  <ListMusic className="h-9 w-9" aria-hidden="true" />
                  <p className="px-6 text-center text-xs">Pick any track from search, trending or underground to start real streaming.</p>
                </div>
              )}
            </div>

            <div className="mb-1 truncate text-center text-sm font-semibold" data-testid="audius-player-title">
              {current ? current.title : 'Nothing playing'}
            </div>
            <div className="mb-4 truncate text-center text-xs text-muted-foreground" data-testid="audius-player-artist">
              {current ? current.artist : 'Choose a track to begin'}
            </div>

            {/* seek (buffered range shown as the pale layer behind the slider) */}
            <div className="relative mb-1.5">
              <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full" aria-hidden="true">
                <div
                  className="h-full bg-primary/25 transition-[width] duration-300"
                  style={{ width: duration > 0 ? `${Math.min(100, (player.bufferedSeconds / duration) * 100)}%` : '0%' }}
                  data-testid="audius-buffered"
                />
              </div>
              <Slider
                value={[seekValue]}
                min={0}
                max={duration > 0 ? duration : 1}
                step={1}
                disabled={!current}
                onValueChange={(value) => player.seek(value[0] ?? 0)}
                aria-label="Seek position"
                data-testid="audius-seek"
                className="relative [&_[data-slot=slider-track]]:h-1.5 [&_[data-slot=slider-track]]:bg-secondary"
              />
            </div>
            <div className="mb-4 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground" data-testid="audius-time-labels">
              <span>{formatClock(player.currentTime)}</span>
              <span>{duration > 0 ? formatClock(duration) : '—'}</span>
            </div>

            {/* transport */}
            <div className="mb-4 flex items-center justify-center gap-3">
              <Button variant="outline" size="icon" className="h-10 w-10 rounded-full" onClick={player.previous} disabled={player.queue.length === 0} aria-label="Previous track">
                <SkipBack className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button size="icon" className="h-12 w-12 rounded-full shadow-md" onClick={player.toggle} disabled={!current} aria-label={player.isPlaying ? 'Pause' : 'Play'} data-testid="audius-toggle">
                {player.isBuffering && !player.isPlaying ? (
                  <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                ) : player.isPlaying ? (
                  <Pause className="h-5 w-5" aria-hidden="true" />
                ) : (
                  <Play className="h-5 w-5 translate-x-[1px]" aria-hidden="true" />
                )}
              </Button>
              <Button variant="outline" size="icon" className="h-10 w-10 rounded-full" onClick={player.next} disabled={player.queue.length === 0} aria-label="Next track">
                <SkipForward className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            {/* volume */}
            <div className="mb-3 flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={player.toggleMute} aria-label={player.muted ? 'Unmute' : 'Mute'} data-testid="audius-mute">
                {player.muted || player.volume === 0 ? <VolumeX className="h-4 w-4" aria-hidden="true" /> : <Volume2 className="h-4 w-4" aria-hidden="true" />}
              </Button>
              <Slider
                value={[player.muted ? 0 : Math.round(player.volume * 100)]}
                min={0}
                max={100}
                step={1}
                onValueChange={(value) => player.setVolume((value[0] ?? 0) / 100)}
                aria-label="Volume"
                data-testid="audius-volume"
                className="flex-1 [&_[data-slot=slider-track]]:h-1.5"
              />
              <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">{player.muted ? '0%' : `${Math.round(player.volume * 100)}%`}</span>
            </div>

            {/* playback error + retry */}
            {player.status === 'error' && player.error && (
              <div className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive" role="alert" data-testid="audius-playback-error">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="leading-relaxed">{player.error}</p>
                  <Button variant="outline" size="sm" className="mt-2 h-7 border-destructive/40 text-destructive hover:bg-destructive/10" onClick={player.retry} data-testid="audius-playback-retry">
                    <RotateCcw className="mr-1 h-3 w-3" aria-hidden="true" /> Retry playback
                  </Button>
                </div>
              </div>
            )}

            <p className="text-center text-[10px] leading-relaxed text-muted-foreground">
              Streams resolve via the official Audius API (<span className="font-mono">app_name</span> attribution — no credentials). Content by Audius artists.
            </p>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}
