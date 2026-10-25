'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpToLine,
  BarChart3,
  ChevronRight,
  CornerDownRight,
  Copy,
  Flame,
  GripVertical,
  Heart,
  Info,
  ListMusic,
  ListPlus,
  Music,
  Pause,
  Play,
  Plus,
  Repeat,
  Repeat1,
  RotateCcw,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  X,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { formatDuration } from '@/lib/lab/format';
import { activeLineIndex, parse as parseLrc, type LrcLyrics } from '@/lib/lab/lrc-parser';
import { progressPercent, queuePositionLabel, queueRowBadge, repeatModeLabel } from '@/lib/lab/tick';
import { effectiveDuration, useLabStore } from '@/lib/lab/store';
import type { LabTrack } from '@/lib/lab/types';

type View = 'search' | 'queue' | 'top' | 'favorites';

const SIMULATION_BANNER =
  'UI simulation — playback here is a timer, not audio. The Android app streams via Media3; YouTube Music playback is currently blocked (LOGIN_REQUIRED, verified 2026-10-11).';

/** ⚡ Bolt Performance Optimization: Wrapped list item components in memo() to prevent unnecessary re-renders when the parent store updates */
const Artwork = memo(function Artwork({ track, className = '' }: { track: LabTrack; className?: string }) {
  if (track.artworkUrl !== null) {
    return (
      <img
        src={track.artworkUrl}
        alt={`Artwork for ${track.title}`}
        loading="lazy"
        referrerPolicy="no-referrer"
        className={`shrink-0 rounded object-cover ${className}`}
      />
    );
  }
  return (
    <div className={`flex shrink-0 items-center justify-center rounded bg-secondary ${className}`} aria-hidden="true">
      <Music className="h-1/2 w-1/2 text-muted-foreground" />
    </div>
  );
});

const FavoriteButton = memo(function FavoriteButton({ trackId, className = '' }: { trackId: string; className?: string }) {
  const isFavorite = useLabStore((s) => s.favorites.includes(trackId));
  const toggleFavorite = useLabStore((s) => s.toggleFavorite);
  return (
    <Button
      variant="ghost"
      size="icon"
      className={`h-11 w-11 shrink-0 ${isFavorite ? 'text-rose-400 hover:text-rose-300' : 'text-muted-foreground'} ${className}`}
      onClick={() => toggleFavorite(trackId)}
      aria-label={isFavorite ? `Remove ${trackId} from favorites` : `Favorite ${trackId}`}
      aria-pressed={isFavorite}
    >
      <Heart className={`h-4 w-4 ${isFavorite ? 'fill-current' : ''}`} aria-hidden="true" />
    </Button>
  );
});

const QueueMenu = memo(function QueueMenu({ track }: { track: LabTrack }) {
  const addToQueue = useLabStore((s) => s.addToQueue);
  const playNextInQueue = useLabStore((s) => s.playNextInQueue);
  const inQueue = useLabStore((s) => s.queue.includes(track.id));
  return (
    <div className="flex shrink-0 items-center">
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 text-muted-foreground"
        onClick={() => playNextInQueue(track.id)}
        aria-label={`Play ${track.title} next in queue`}
        title="Play next"
      >
        <ListPlus className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 text-muted-foreground"
        onClick={() => addToQueue(track.id)}
        disabled={inQueue}
        aria-label={inQueue ? `${track.title} is already in the queue` : `Add ${track.title} to queue`}
        title={inQueue ? 'Already queued' : 'Add to queue'}
      >
        {inQueue ? <Check aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
      </Button>
    </div>
  );
});

function Check({ 'aria-hidden': ariaHidden }: { 'aria-hidden'?: boolean | 'true' | 'false' }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden={ariaHidden}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

const TrackRow = memo(function TrackRow({
  track,
  index,
  onOpenDetail,
}: {
  track: LabTrack;
  index: number;
  onOpenDetail: (track: LabTrack) => void;
}) {
  const isPlaying = useLabStore((s) => s.isPlaying && s.currentTrackId === track.id);
  const togglePlayId = useLabStore((s) => s.togglePlayId);
  return (
    <li>
      <div
        className={`flex items-center gap-2 rounded-md border bg-background/40 p-2 transition-colors hover:bg-secondary/40 ${
          isPlaying ? 'border-primary/60 bg-primary/5 shadow-[inset_2px_0_0_0] shadow-primary' : 'border-border'
        }`}
      >
        <span className="w-5 shrink-0 text-center font-mono text-[11px] text-muted-foreground">{index + 1}</span>
        <Artwork track={track} className="h-11 w-11" />
        <button
          type="button"
          onClick={() => onOpenDetail(track)}
          className="min-w-0 flex-1 rounded px-1 text-left"
          aria-label={`Open details for ${track.title}`}
        >
          <span className="flex items-center gap-1.5">
            <span className="truncate text-sm font-medium">{track.title}</span>
            {isPlaying && (
              <span className="rm-eq shrink-0 text-primary" aria-hidden="true">
                <span /><span /><span /><span />
              </span>
            )}
            {isPlaying && (
              <Badge variant="outline" className="border-primary/40 bg-primary/10 px-1 text-[9px] text-primary">
                playing
              </Badge>
            )}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {track.artist}
            {track.album !== null ? ` · ${track.album}` : ''}
          </span>
        </button>
        <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">
          {formatDuration(track.durationMs)}
        </span>
        <FavoriteButton trackId={track.id} />
        <QueueMenu track={track} />
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 shrink-0 text-primary"
          onClick={() => togglePlayId(track.id)}
          aria-label={`${isPlaying ? 'Pause' : 'Play'} ${track.title} (simulated)`}
        >
          {isPlaying ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>
    </li>
  );
});

const SortableQueueRow = memo(function SortableQueueRow({
  trackId,
  position,
  track,
  onRemove,
}: {
  trackId: string;
  position: number;
  track: LabTrack | undefined;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: trackId });
  const isPlaying = useLabStore((s) => s.isPlaying && s.currentTrackId === trackId);
  const isFavorite = useLabStore((s) => s.favorites.includes(trackId));
  const { toast } = useToast();

  // WEBLAB-14 — per-row playback-relationship badge from the SAME semantics as
  // computeNextIndex, so the badge can never disagree with the tick logic.
  const queueLength = useLabStore((s) => s.queue.length);
  const currentIndex = useLabStore((s) => (s.currentTrackId === null ? -1 : s.queue.indexOf(s.currentTrackId)));
  const repeatMode = useLabStore((s) => s.repeatMode);
  const rowBadge = queueRowBadge(queueLength, position, currentIndex, repeatMode);

  const moveTo = (target: 'top' | 'bottom') => {
    const queue = useLabStore.getState().queue;
    const from = queue.indexOf(trackId);
    if (from < 0) return;
    const to = target === 'top' ? 0 : queue.length - 1;
    if (from === to) return;
    useLabStore.getState().reorderQueue(from, to);
  };

  const copyInfo = async () => {
    if (track === undefined) return;
    const info = `${track.title} — ${track.artist} [${track.id}] (Ridho Music Web Lab, queue position ${position + 1})`;
    try {
      await navigator.clipboard.writeText(info);
      toast({ title: 'Copied to clipboard ✓', description: info });
    } catch {
      toast({ title: 'Clipboard blocked by the browser', description: 'Headless/permission-restricted contexts cannot write the clipboard.', variant: 'destructive' });
    }
  };

  if (track === undefined) {
    return (
      <li
        ref={setNodeRef}
        style={{ transform: CSS.Transform.toString(transform), transition }}
        className="flex items-center gap-2 rounded-md border border-dashed border-border p-2 text-xs text-muted-foreground"
      >
        <span className="w-5 text-center font-mono">{position + 1}</span>
        (track not in catalog: {trackId})
      </li>
    );
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1.5 rounded-md border border-border bg-background/40 p-2 ${
        isDragging ? 'z-10 border-primary/60 shadow-lg' : ''
      }`}
    >
      <button
        type="button"
        className="flex h-11 w-8 shrink-0 cursor-grab touch-none items-center justify-center rounded text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label={`Reorder ${track.title}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={`Queue actions for ${track.title} (right-click or long-press for the context menu)`}
          >
            <span className="w-4 shrink-0 text-center font-mono text-[11px] text-muted-foreground">{position + 1}</span>
            <Artwork track={track} className="h-10 w-10" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{track.title}</span>
                {isPlaying && (
                  <Badge variant="outline" className="border-primary/40 bg-primary/10 px-1 text-[9px] text-primary">
                    playing
                  </Badge>
                )}
                {rowBadge?.kind === 'up-next' && !isPlaying && (
                  <Badge variant="outline" className="gap-0.5 border-teal-500/40 bg-teal-500/10 px-1 text-[9px] text-teal-300">
                    <CornerDownRight className="h-2.5 w-2.5" aria-hidden="true" />
                    up next
                  </Badge>
                )}
                {rowBadge?.kind === 'ends-queue' && (
                  <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 px-1 text-[9px] text-amber-300">
                    ends queue (repeat off)
                  </Badge>
                )}
                {rowBadge?.kind === 'repeats' && (
                  <Badge variant="outline" className="border-violet-500/40 bg-violet-500/10 px-1 text-[9px] text-violet-300">
                    {rowBadge.label}
                  </Badge>
                )}
              </span>
              <span className="block truncate text-xs text-muted-foreground">{track.artist}</span>
            </span>
            <span className="hidden shrink-0 text-[11px] text-muted-foreground sm:block">{formatDuration(track.durationMs)}</span>
          </button>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuItem
            onSelect={() => {
              useLabStore.getState().togglePlayId(trackId);
            }}
          >
            <Play className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            {isPlaying ? 'Pause (simulated)' : 'Play (simulated)'}
            <ContextMenuShortcut>Enter</ContextMenuShortcut>
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => {
              useLabStore.getState().playNextInQueue(trackId);
            }}
          >
            <ListPlus className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Play next
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => useLabStore.getState().shuffleQueue()} disabled={useLabStore.getState().queue.length < 2}>
            <Shuffle className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Shuffle queue (simulated)
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => moveTo('top')} disabled={position === 0}>
            <ArrowUpToLine className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Move to top
          </ContextMenuItem>
          <ContextMenuItem
            onSelect={() => moveTo('bottom')}
            disabled={position === useLabStore.getState().queue.length - 1}
          >
            <ArrowDownToLine className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Move to bottom
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => useLabStore.getState().toggleFavorite(trackId)}>
            <Heart className={`mr-2 h-3.5 w-3.5 ${isFavorite ? 'fill-current text-rose-400' : ''}`} aria-hidden="true" />
            {isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void copyInfo()}>
            <Copy className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Copy track info
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem
            className="text-rose-300 focus:text-rose-200 focus:bg-rose-500/10"
            onSelect={() => onRemove(trackId)}
          >
            <X className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
            Remove from queue
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <Button
        variant="ghost"
        size="icon"
        className="h-11 w-11 shrink-0 text-muted-foreground hover:text-rose-300"
        onClick={() => onRemove(trackId)}
        aria-label={`Remove ${track.title} from queue`}
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </Button>
    </li>
  );
});

/** Animated horizontal play-count chart — WEB-LAB-8. Bars reflect the simulated, browser-local play counter. */
function TopTracksChart({
  entries,
}: {
  entries: Array<{ track: LabTrack; count: number }>;
}) {
  const max = entries.reduce((m, e) => Math.max(m, e.count), 1);
  const shown = entries.slice(0, 8);
  return (
    <div className="space-y-2" role="img" aria-label={`Bar chart of simulated play counts, top ${shown.length} tracks`}>
      {shown.map((entry, index) => {
        const pct = Math.max(4, Math.round((entry.count / max) * 100));
        return (
          <div key={entry.track.id} className="flex items-center gap-2">
            <span className={`w-5 shrink-0 text-right font-mono text-[11px] ${index === 0 ? 'font-bold text-amber-300' : 'text-muted-foreground'}`}>
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs font-medium">{entry.track.title}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {entry.count} {entry.count === 1 ? 'play' : 'plays'}
                </span>
              </div>
              <div className="mt-0.5 h-2 overflow-hidden rounded-full bg-secondary/70">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ type: 'spring', stiffness: 120, damping: 20 }}
                  className={`h-full rounded-full ${
                    index === 0
                      ? 'bg-gradient-to-r from-amber-500/80 to-amber-400/60'
                      : 'bg-gradient-to-r from-primary/80 to-primary/50'
                  }`}
                />
              </div>
            </div>
          </div>
        );
      })}
      <p className="pt-1 text-[10px] text-muted-foreground">
        Chart of the SIMULATED play counter (browser-local). The Android app records real play counts in Room.
      </p>
    </div>
  );
}

export function PrototypeTab() {
  const catalog = useLabStore((s) => s.catalog);
  const catalogStatus = useLabStore((s) => s.catalogStatus);
  const catalogError = useLabStore((s) => s.catalogError);
  const loadCatalog = useLabStore((s) => s.loadCatalog);
  const failureInjection = useLabStore((s) => s.failureInjection);
  const setFailureInjection = useLabStore((s) => s.setFailureInjection);

  // Demo lyrics for the Now Playing sheet (SYNTHETIC fixture, loaded for real).
  const [demoLyrics, setDemoLyrics] = useState<LrcLyrics | null>(null);
  const [lyricsOpen, setLyricsOpen] = useState(true);
  const lyricsListRef = useRef<HTMLDivElement | null>(null);

  const currentTrackId = useLabStore((s) => s.currentTrackId);
  const isPlaying = useLabStore((s) => s.isPlaying);
  const progressMs = useLabStore((s) => s.progressMs);
  const togglePlay = useLabStore((s) => s.togglePlay);
  const seekTo = useLabStore((s) => s.seekTo);
  const next = useLabStore((s) => s.next);
  const previous = useLabStore((s) => s.previous);
  const repeatMode = useLabStore((s) => s.repeatMode);
  const cycleRepeatMode = useLabStore((s) => s.cycleRepeatMode);

  const queue = useLabStore((s) => s.queue);
  const reorderQueue = useLabStore((s) => s.reorderQueue);
  const removeFromQueue = useLabStore((s) => s.removeFromQueue);
  const clearQueue = useLabStore((s) => s.clearQueue);
  const shuffleQueue = useLabStore((s) => s.shuffleQueue);

  const favorites = useLabStore((s) => s.favorites);
  const playCounts = useLabStore((s) => s.playCounts);

  const [view, setView] = useState<View>('search');
  const [query, setQuery] = useState('');
  const [detailTrack, setDetailTrack] = useState<LabTrack | null>(null);
  const [nowPlayingOpen, setNowPlayingOpen] = useState(false);
  const [qaControlsOpen, setQaControlsOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [copiedInfo, setCopiedInfo] = useState<'idle' | 'copied' | 'blocked'>('idle');

  useEffect(() => {
    if (useLabStore.getState().catalogStatus === 'idle') void loadCatalog();
  }, [loadCatalog]);

  // Load the labeled demo .lrc once, when the Now Playing sheet is first opened.
  useEffect(() => {
    if (!nowPlayingOpen || demoLyrics !== null) return;
    void (async () => {
      try {
        const res = await fetch('/api/lab/lrc?name=demo_synced.lrc', { cache: 'force-cache' });
        if (!res.ok) return;
        const data = (await res.json()) as { content: string };
        setDemoLyrics(parseLrc(data.content));
      } catch {
        // Lyrics stay unavailable; the sheet simply hides the section.
      }
    })();
  }, [nowPlayingOpen, demoLyrics]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const currentTrack = useMemo(
    () => catalog.find((t) => t.id === currentTrackId) ?? null,
    [catalog, currentTrackId],
  );
  const totalMs = effectiveDuration(currentTrack ?? undefined);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length === 0) return catalog;
    return catalog.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.album !== null && t.album.toLowerCase().includes(q)),
    );
  }, [catalog, query]);

  const favoriteTracks = useMemo(() => catalog.filter((t) => favorites.includes(t.id)), [catalog, favorites]);

  const lyricActiveIdx = useMemo(() => {
    if (demoLyrics === null || !demoLyrics.synced) return -1;
    return activeLineIndex(demoLyrics.lines, progressMs);
  }, [demoLyrics, progressMs]);

  // Keep the active lyric line visible inside the scroll container.
  useEffect(() => {
    if (!nowPlayingOpen || lyricActiveIdx < 0 || lyricsListRef.current === null) return;
    const container = lyricsListRef.current;
    const activeEl = container.querySelector<HTMLElement>(`[data-lyric-idx="${lyricActiveIdx}"]`);
    if (activeEl !== null) {
      const top = activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2;
      container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    }
  }, [lyricActiveIdx, nowPlayingOpen]);

  const copyTrackInfo = useCallback(async (track: LabTrack) => {
    const info = `${track.title} — ${track.artist}${track.album !== null ? ` · ${track.album}` : ''} [${track.id}] (Ridho Music Web Lab)`;
    let ok = false;
    try {
      await navigator.clipboard.writeText(info);
      ok = true;
    } catch {
      // Clipboard blocked (permissions/insecure context) — surface honestly below.
    }
    setCopiedInfo(ok ? 'copied' : 'blocked');
    window.setTimeout(() => setCopiedInfo('idle'), 2500);
  }, []);

  const topTracks = useMemo(() => {
    return Object.entries(playCounts)
      .map(([id, count]) => ({ track: catalog.find((t) => t.id === id), count }))
      .filter((entry): entry is { track: LabTrack; count: number } => entry.track !== undefined)
      .sort((a, b) => b.count - a.count);
  }, [catalog, playCounts]);

  // WEBLAB-12 mini-player chip — "3/6" when the current track is queued, else hidden.
  const queuePos = useMemo(() => queuePositionLabel(queue, currentTrackId), [queue, currentTrackId]);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over === null || active.id === over.id) return;
    const fromIndex = queue.indexOf(String(active.id));
    const toIndex = queue.indexOf(String(over.id));
    if (fromIndex < 0 || toIndex < 0) return;
    reorderQueue(fromIndex, toIndex);
  };

  const views: Array<{ id: View; label: string; icon: typeof Search; count?: number }> = [
    { id: 'search', label: 'Search', icon: Search, count: catalog.length },
    { id: 'queue', label: 'Queue', icon: ListMusic, count: queue.length },
    { id: 'top', label: 'Top Tracks', icon: Flame, count: topTracks.length },
    { id: 'favorites', label: 'Favorites', icon: Heart, count: favoriteTracks.length },
  ];

  return (
    <div className="space-y-4">
      {/* Honesty banner */}
      <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {SIMULATION_BANNER}
      </div>

      {/* QA controls: labeled failure injection */}
      <Collapsible open={qaControlsOpen} onOpenChange={setQaControlsOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2 text-xs">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
            QA controls
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <Card className="mt-2">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">Simulate catalog failure</p>
                <p className="text-xs text-muted-foreground">
                  Demonstrates the real loading → error → retry flow with a labeled, intentional failure. Turn OFF
                  again and press retry to recover.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={failureInjection}
                  onCheckedChange={(on) => {
                    setFailureInjection(on);
                    void loadCatalog();
                  }}
                  aria-label="Toggle simulated catalog failure"
                />
                <Button variant="outline" size="sm" onClick={() => void loadCatalog()} className="gap-1.5">
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  Reload catalog
                </Button>
              </div>
            </CardContent>
          </Card>
        </CollapsibleContent>
      </Collapsible>

      {/* View switcher */}
      <div className="flex gap-1 overflow-x-auto pb-1" role="tablist" aria-label="Prototype views">
        {views.map((item) => {
          const Icon = item.icon;
          const selected = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => setView(item.id)}
              className={`flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm transition-colors ${
                selected ? 'bg-primary/15 font-medium text-primary' : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
              {item.count !== undefined && item.count > 0 && (
                <Badge variant="outline" className="border-border px-1.5 text-[10px]">
                  {item.count}
                </Badge>
              )}
            </button>
          );
        })}
      </div>

      {/* Catalog states */}
      {catalogStatus === 'loading' && (
        <div className="space-y-2" aria-busy="true" aria-label="Loading catalog">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 rounded-md" />
          ))}
        </div>
      )}

      {catalogStatus === 'error' && (
        <Card className="border-rose-500/30">
          <CardContent className="flex flex-col gap-2 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-rose-300">
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              Catalog failed to load
            </p>
            <p className="font-mono text-xs text-foreground/80">{catalogError}</p>
            <Button variant="outline" size="sm" className="w-fit gap-2" onClick={() => void loadCatalog()}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {catalogStatus === 'ready' && catalog.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
            <Music className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">Catalog is empty</p>
            <p className="max-w-md text-xs text-muted-foreground">
              The fixtures parsed to zero tracks — check the Fixtures & Parser tab for the trace.
            </p>
            <Button variant="outline" size="sm" className="gap-2" onClick={() => void loadCatalog()}>
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {catalogStatus === 'ready' && catalog.length > 0 && (
        <div className="space-y-3 pb-28">
          {view === 'search' && (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Filter by title, artist, or album…"
                  aria-label="Filter catalog"
                  className="min-h-[44px] pl-9"
                />
              </div>
              {filtered.length === 0 ? (
                <Card>
                  <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
                    <Search className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm font-medium">No matches for “{query}”</p>
                    <p className="text-xs text-muted-foreground">Try a different filter or clear it.</p>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-3">
                    <p className="mb-2 text-xs text-muted-foreground">
                      {filtered.length} of {catalog.length} tracks · source: sanitized fixtures via the shared parser
                    </p>
                    <ScrollArea className="rm-scroll max-h-96">
                      <ul className="space-y-1.5 pr-2">
                        {filtered.map((track, index) => (
                          <TrackRow key={track.id} track={track} index={index} onOpenDetail={setDetailTrack} />
                        ))}
                      </ul>
                    </ScrollArea>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {view === 'queue' && (
            <Card>
              <CardContent className="p-3">
                {queue.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 p-6 text-center">
                    <ListMusic className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm font-medium">Queue is empty</p>
                    <p className="max-w-sm text-xs text-muted-foreground">
                      Add tracks from Search (＋ button) or use “Play next”. Drag the handle to reorder once queued.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-muted-foreground">{queue.length} in queue · drag the handle to reorder</p>
                      <div className="flex items-center gap-2">
                        {/* WEBLAB-13 — repeat mode visible in the queue toolbar (same tri-state). */}
                        <Button
                          variant="outline"
                          size="sm"
                          className={`gap-1.5 ${
                            repeatMode === 'off'
                              ? 'text-muted-foreground'
                              : 'rm-repeat-chip-on border-amber-500/40 bg-amber-500/10 text-amber-300 hover:text-amber-200'
                          }`}
                          onClick={cycleRepeatMode}
                          aria-pressed={repeatMode !== 'off'}
                          aria-label={`Cycle repeat mode — currently ${repeatModeLabel(repeatMode)} (simulated)`}
                          title={repeatModeLabel(repeatMode)}
                        >
                          {repeatMode === 'one' ? <Repeat1 className="h-3.5 w-3.5" aria-hidden="true" /> : <Repeat className="h-3.5 w-3.5" aria-hidden="true" />}
                          {repeatMode === 'one' ? 'Repeat 1' : repeatMode === 'all' ? 'Repeat all' : 'Repeat off'}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => shuffleQueue()}
                          disabled={queue.length < 2}
                          aria-label={`Shuffle queue (simulated) — ${queue.length} tracks`}
                          title="Fisher–Yates shuffle; the playing track keeps its slot"
                        >
                          <Shuffle className="h-3.5 w-3.5" aria-hidden="true" />
                          Shuffle
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-rose-300 hover:text-rose-200"
                          onClick={() => {
                            if (confirmClear) {
                              clearQueue();
                              setConfirmClear(false);
                            } else {
                              setConfirmClear(true);
                              window.setTimeout(() => setConfirmClear(false), 4000);
                            }
                          }}
                          aria-label={confirmClear ? 'Confirm clear queue' : 'Clear queue (press again to confirm)'}
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          {confirmClear ? 'Press again to confirm' : 'Clear'}
                        </Button>
                      </div>
                    </div>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                      <SortableContext items={queue} strategy={verticalListSortingStrategy}>
                        <ScrollArea className="rm-scroll max-h-96">
                          <ul className="space-y-1.5 pr-2">
                            {queue.map((trackId, index) => (
                              <SortableQueueRow
                                key={trackId}
                                trackId={trackId}
                                position={index}
                                track={catalog.find((t) => t.id === trackId)}
                                onRemove={removeFromQueue}
                              />
                            ))}
                          </ul>
                        </ScrollArea>
                      </SortableContext>
                    </DndContext>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {view === 'top' && (
            <>
              {topTracks.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <BarChart3 className="h-4 w-4 text-primary" aria-hidden="true" />
                      Play-count chart
                    </p>
                  </CardHeader>
                  <CardContent>
                    <TopTracksChart entries={topTracks} />
                  </CardContent>
                </Card>
              )}
              <Card>
                <CardContent className="p-3">
                {topTracks.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 p-6 text-center">
                    <Flame className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm font-medium">No plays yet</p>
                    <p className="max-w-sm text-xs text-muted-foreground">
                      The play counter is simulated — it increments when you press play in this prototype (persisted in
                      your browser only, not in the Android app).
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="rm-scroll max-h-96">
                    <ul className="space-y-1.5 pr-2">
                      {topTracks.map((entry, index) => (
                        <TrackRow
                          key={entry.track.id}
                          track={entry.track}
                          index={index}
                          onOpenDetail={setDetailTrack}
                        />
                      ))}
                    </ul>
                  </ScrollArea>
                )}
                </CardContent>
              </Card>
            </>
          )}

          {view === 'favorites' && (
            <Card>
              <CardContent className="p-3">
                {favoriteTracks.length === 0 ? (
                  <div className="flex flex-col items-center gap-2 p-6 text-center">
                    <Heart className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
                    <p className="text-sm font-medium">No favorites yet</p>
                    <p className="max-w-sm text-xs text-muted-foreground">
                      Tap the heart on any track. Favorites persist in this browser via localStorage.
                    </p>
                  </div>
                ) : (
                  <ScrollArea className="rm-scroll max-h-96">
                    <ul className="space-y-1.5 pr-2">
                      {favoriteTracks.map((track, index) => (
                        <TrackRow key={track.id} track={track} index={index} onOpenDetail={setDetailTrack} />
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Mini player — WEBLAB-12: progress hairline + repeat chip + queue-position chip */}
      {currentTrack !== null && (
        <div className="rm-mini-player fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
          {/* progress hairline (gradient, mirrors the sheet's seek slider) */}
          <div
            className="rm-mini-progress h-[3px] w-full overflow-hidden rounded-none bg-secondary/70"
            role="progressbar"
            aria-label={`Simulated playback progress — ${formatDuration(progressMs)} of ${formatDuration(totalMs)}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progressPercent(progressMs, totalMs))}
          >
            <div
              className="h-full rounded-none bg-gradient-to-r from-teal-400 to-amber-400 transition-[width] duration-200 ease-linear"
              style={{ width: `${progressPercent(progressMs, totalMs)}%` }}
            />
          </div>
          <div className="mx-auto w-full max-w-6xl px-3 py-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] sm:px-6">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setNowPlayingOpen(true)}
                className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-1 text-left hover:bg-secondary/50"
                aria-label="Open Now Playing"
              >
                <div className="relative">
                  <Artwork track={currentTrack} className="h-10 w-10" />
                  {isPlaying && (
                    <span className="rm-eq rm-eq-overlay absolute -right-1 -top-1 text-primary" aria-hidden="true">
                      <span /><span /><span /><span />
                    </span>
                  )}
                </div>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5">
                    <span className="block truncate text-sm font-medium">{currentTrack.title}</span>
                    {queuePos !== null && (
                      <Badge
                        variant="outline"
                        className="shrink-0 border-border px-1 font-mono text-[9px] text-muted-foreground"
                        title={`Position ${queuePos} in the simulated queue`}
                      >
                        {queuePos}
                      </Badge>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {formatDuration(progressMs)} / {formatDuration(totalMs)} · {currentTrack.artist}
                  </span>
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
              {/* repeat chip — visible OUTSIDE the sheet (WEBLAB-12), cycles the same tri-state */}
              <Button
                variant="ghost"
                size="icon"
                className={`h-11 w-11 shrink-0 ${
                  repeatMode === 'off' ? 'text-muted-foreground' : 'text-amber-300 hover:text-amber-200'
                }`}
                onClick={cycleRepeatMode}
                aria-pressed={repeatMode !== 'off'}
                aria-label={`Cycle repeat mode — currently ${repeatModeLabel(repeatMode)} (simulated)`}
                title={repeatModeLabel(repeatMode)}
              >
                {repeatMode === 'one' ? <Repeat1 className="h-4 w-4" aria-hidden="true" /> : <Repeat className="h-4 w-4" aria-hidden="true" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={previous} aria-label="Previous track (simulated)">
                <SkipBack className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Button size="icon" className="h-11 w-11" onClick={togglePlay} aria-label={isPlaying ? 'Pause (simulated)' : 'Play (simulated)'}>
                {isPlaying ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
              </Button>
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={next} aria-label="Next track (simulated)">
                <SkipForward className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Now Playing sheet */}
      <Sheet open={nowPlayingOpen} onOpenChange={setNowPlayingOpen}>
        <SheetContent side="bottom" className="rm-theme h-[85vh] rounded-t-2xl border-border bg-card sm:max-w-6xl sm:rounded-b-none">
          <SheetHeader className="sr-only">
            <SheetTitle>Now Playing (simulated)</SheetTitle>
            <SheetDescription>Simulated playback controls for the prototype UI.</SheetDescription>
          </SheetHeader>
          {currentTrack !== null && (
            <div className="flex h-full flex-col items-center gap-4 overflow-y-auto p-4 pt-2">
              <div className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
                <Artwork track={currentTrack} className="h-44 w-44 sm:h-56 sm:w-56" />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-2">
                    {isPlaying && (
                      <span className="rm-eq shrink-0 text-primary" aria-hidden="true">
                        <span /><span /><span /><span />
                      </span>
                    )}
                    <p className="truncate text-lg font-semibold">{currentTrack.title}</p>
                  </div>
                  <p className="truncate text-sm text-muted-foreground">
                    {currentTrack.artist}
                    {currentTrack.album !== null ? ` · ${currentTrack.album}` : ''}
                  </p>
                </div>
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300">
                  SIMULATED PLAYBACK — no audio in the web lab
                </Badge>
                <div className="w-full">
                  <Slider
                    value={[Math.min(progressMs, totalMs)]}
                    max={Math.max(totalMs, 1)}
                    step={1000}
                    onValueChange={([value]) => seekTo(value)}
                    aria-label="Seek position (simulated)"
                    className="rm-slider-fill"
                  />
                  <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                    <span>{formatDuration(progressMs)}</span>
                    <span>{formatDuration(totalMs)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <FavoriteButton trackId={currentTrack.id} />
                  <Button variant="outline" size="icon" className="h-12 w-12" onClick={previous} aria-label="Previous (simulated)">
                    <SkipBack className="h-5 w-5" aria-hidden="true" />
                  </Button>
                  <Button size="icon" className="h-14 w-14" onClick={togglePlay} aria-label={isPlaying ? 'Pause (simulated)' : 'Play (simulated)'}>
                    {isPlaying ? <Pause className="h-6 w-6" aria-hidden="true" /> : <Play className="h-6 w-6" aria-hidden="true" />}
                  </Button>
                  <Button variant="outline" size="icon" className="h-12 w-12" onClick={next} aria-label="Next (simulated)">
                    <SkipForward className="h-5 w-5" aria-hidden="true" />
                  </Button>
                  <Button
                    variant={repeatMode === 'off' ? 'outline' : 'default'}
                    size="icon"
                    className={`h-12 w-12 ${repeatMode === 'off' ? '' : 'text-primary-foreground'}`}
                    onClick={cycleRepeatMode}
                    aria-pressed={repeatMode !== 'off'}
                    aria-label={`Repeat mode (simulated): ${repeatModeLabel(repeatMode)}`}
                    title={`Repeat (simulated) — ${repeatModeLabel(repeatMode)}. Click to cycle off → all → one.`}
                  >
                    {repeatMode === 'one' ? (
                      <Repeat1 className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Repeat className={`h-5 w-5 ${repeatMode === 'off' ? 'text-muted-foreground' : ''}`} aria-hidden="true" />
                    )}
                  </Button>
                </div>
                <Badge
                  variant="outline"
                  className={
                    repeatMode === 'off'
                      ? 'border-border text-[10px] text-muted-foreground'
                      : 'border-primary/40 bg-primary/10 text-[10px] text-primary'
                  }
                >
                  {repeatModeLabel(repeatMode)} (simulated)
                </Badge>
                <div className="text-xs text-muted-foreground">
                  <p className="font-mono">{currentTrack.id}</p>
                  <p>plays (simulated): {playCounts[currentTrack.id] ?? 0}</p>
                </div>

                {demoLyrics !== null && demoLyrics.lines.length > 0 && (
                  <div className="w-full max-w-sm">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-foreground/80">Lyrics</p>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[11px] text-muted-foreground"
                        onClick={() => setLyricsOpen((open) => !open)}
                        aria-expanded={lyricsOpen}
                        aria-label={lyricsOpen ? 'Hide demo lyrics' : 'Show demo lyrics'}
                      >
                        {lyricsOpen ? 'Hide' : 'Show'}
                      </Button>
                    </div>
                    {lyricsOpen && (
                      <>
                        <div
                          ref={lyricsListRef}
                          className="rm-scroll max-h-44 overflow-y-auto rounded-md border border-border bg-background/40 p-2"
                          aria-label="Synced demo lyrics"
                        >
                          <ol className="space-y-1">
                            {demoLyrics.lines.map((line, index) => (
                              <li
                                key={`${line.timeMs}-${index}`}
                                data-lyric-idx={index}
                                className={`rounded px-2 py-1 text-xs transition-colors ${
                                  demoLyrics.synced && index === lyricActiveIdx
                                    ? 'bg-primary/15 font-medium text-primary'
                                    : 'text-muted-foreground'
                                }`}
                              >
                                {line.text}
                              </li>
                            ))}
                          </ol>
                        </div>
                        <p className="mt-1 text-[10px] leading-snug text-muted-foreground">
                          Demo lyrics — SYNTHETIC fixture (fixtures/lrc/demo_synced.lrc). Fixtures carry no real lyric
                          sources; highlighting follows the simulated clock.
                        </p>
                      </>
                    )}
                  </div>
                )}
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setNowPlayingOpen(false);
                    setView('queue');
                  }}
                >
                  <ListMusic className="h-4 w-4" aria-hidden="true" />
                  Open queue ({queue.length})
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Track detail dialog */}
      <Dialog open={detailTrack !== null} onOpenChange={(open) => !open && setDetailTrack(null)}>
        <DialogContent className="max-w-sm">
          {detailTrack !== null && (
            <>
              <DialogHeader>
                <DialogTitle className="text-left">Track details</DialogTitle>
                <DialogDescription className="text-left">
                  Metadata straight from the shared fixture pipeline.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-3 pb-2 text-center">
                <Artwork track={detailTrack} className="h-28 w-28" />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold">{detailTrack.title}</p>
                  <p className="truncate text-sm text-muted-foreground">{detailTrack.artist}</p>
                  {detailTrack.album !== null && <p className="truncate text-xs text-muted-foreground">{detailTrack.album}</p>}
                </div>
                <div className="w-full space-y-1 rounded-md border border-border bg-background/40 p-3 text-left text-xs">
                  <p className="flex justify-between gap-3">
                    <span className="text-muted-foreground">id</span>
                    <span className="break-all font-mono">{detailTrack.id}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-muted-foreground">source</span>
                    <span className="font-mono">{detailTrack.sourceId}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-muted-foreground">duration</span>
                    <span>{detailTrack.durationMs > 0 ? formatDuration(detailTrack.durationMs) : '— (flat layout)'}</span>
                  </p>
                  <p className="flex justify-between">
                    <span className="text-muted-foreground">plays (simulated)</span>
                    <span>{playCounts[detailTrack.id] ?? 0}</span>
                  </p>
                </div>
                <div className="flex w-full gap-2">
                  <Button
                    className="flex-1 gap-2"
                    onClick={() => {
                      useLabStore.getState().playTrack(detailTrack.id);
                      setNowPlayingOpen(true);
                      setDetailTrack(null);
                    }}
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    Play (simulated)
                  </Button>
                  <Button
                    variant="outline"
                    className="flex-1 gap-2"
                    onClick={() => {
                      useLabStore.getState().addToQueue(detailTrack.id);
                      setDetailTrack(null);
                    }}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Queue
                  </Button>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-1.5 text-xs text-muted-foreground"
                  onClick={() => void copyTrackInfo(detailTrack)}
                  aria-label={`Copy metadata of ${detailTrack.title} to clipboard`}
                >
                  {copiedInfo === 'copied' && (
                    <>
                      <Check aria-hidden="true" /> Copied to clipboard ✓
                    </>
                  )}
                  {copiedInfo === 'blocked' && (
                    <>
                      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Clipboard blocked by the browser
                    </>
                  )}
                  {copiedInfo === 'idle' && (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" /> Copy track info
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
