'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { removeLrcEntry, upsertLrcEntry, type SavedLrcEntry } from './lrc-library';
import { shuffledQueue } from './shuffle';
import { computeNextIndex, computeTick, type RepeatMode } from './tick';
import type { LabTrack } from './types';

export type LabTab = 'dashboard' | 'playground' | 'fixtures' | 'lyrics' | 'prototype' | 'parity' | 'project';

export type CatalogStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Simulated fallback duration for flat-layout tracks that carry no durationMs. */
export const SIMULATED_FALLBACK_DURATION_MS = 205_000;

interface LabStore {
  // ---- navigation ----------------------------------------------------------
  activeTab: LabTab;
  setActiveTab(tab: LabTab): void;
  /** Fixture preselected from the Fixtures tab ("run in playground"). */
  playgroundFixture: string | null;
  setPlaygroundFixture(name: string | null): void;
  /** Search Playground data source. */
  playgroundMode: 'live' | 'fixture';
  setPlaygroundMode(mode: 'live' | 'fixture'): void;
  /** Query the dashboard history hands to the playground (consumed once, WEBLAB-13). */
  replayQuery: string | null;
  setReplayQuery(query: string | null): void;

  // ---- prototype catalog (fixture-derived, fetched for real) ----------------
  catalog: LabTrack[];
  catalogStatus: CatalogStatus;
  catalogError: string | null;
  /** Labeled failure injection so loading/error/retry states are demonstrable honestly. */
  failureInjection: boolean;
  setFailureInjection(on: boolean): void;
  loadCatalog(): Promise<void>;

  // ---- simulated playback ---------------------------------------------------
  currentTrackId: string | null;
  isPlaying: boolean;
  progressMs: number;
  /** Tri-state simulated repeat (WEBLAB-11): 'off' stops at queue end, 'all' wraps, 'one' restarts. */
  repeatMode: RepeatMode;
  cycleRepeatMode(): void;
  playTrack(id: string): void;
  togglePlay(): void;
  togglePlayId(id: string): void;
  seekTo(ms: number): void;
  tick(): void;
  next(): void;
  previous(): void;

  // ---- queue ----------------------------------------------------------------
  queue: string[];
  addToQueue(id: string): void;
  playNextInQueue(id: string): void;
  removeFromQueue(id: string): void;
  reorderQueue(fromIndex: number, toIndex: number): void;
  clearQueue(): void;
  /** Simulated shuffle: keeps the current track at its index, shuffles the rest (WEB-LAB-9). */
  shuffleQueue(): void;

  // ---- favorites / play counts (persisted) -----------------------------------
  favorites: string[];
  toggleFavorite(id: string): void;
  playCounts: Record<string, number>;

  // ---- search history (persisted in this browser, WEB-LAB-10/11) -------------
  searchHistory: SearchHistoryEntry[];
  addSearchHistory(entry: SearchHistoryEntry): void;
  clearSearchHistory(): void;

  // ---- saved LRC library (persisted in this browser, WEBLAB-12) ---------------
  lrcLibrary: SavedLrcEntry[];
  /** Returns the failure reason on rejection (empty name / too large), else null. */
  saveLrc(name: string, content: string): 'empty-name' | 'too-large' | null;
  removeLrc(name: string): void;
}

export interface SearchHistoryEntry {
  query: string;
  at: number;
  ok: boolean;
  httpStatus: number | null;
  durationMs: number | null;
  trackCount: number | null;
  errorKind: string | null;
}

function durationOf(track: LabTrack | undefined): number {
  if (!track) return SIMULATED_FALLBACK_DURATION_MS;
  return track.durationMs > 0 ? track.durationMs : SIMULATED_FALLBACK_DURATION_MS;
}

const BUILTIN_FIXTURES = [
  'search_live_2026-10-11_test.json',
  'search_live_2026-10-11_lathi.json',
] as const;

export const useLabStore = create<LabStore>()(
  persist(
    (set, get) => ({
      activeTab: 'dashboard',
      setActiveTab: (tab) => set({ activeTab: tab }),
      playgroundFixture: null,
      setPlaygroundFixture: (name) => set({ playgroundFixture: name }),
      playgroundMode: 'live',
      setPlaygroundMode: (mode) => set({ playgroundMode: mode }),
      replayQuery: null,
      setReplayQuery: (query) => set({ replayQuery: query }),

      catalog: [],
      catalogStatus: 'idle',
      catalogError: null,
      failureInjection: false,
      setFailureInjection: (on) => set({ failureInjection: on }),
      loadCatalog: async () => {
        if (get().catalogStatus === 'loading') return;
        set({ catalogStatus: 'loading', catalogError: null });
        try {
          if (get().failureInjection) {
            throw new Error('Failure injection is ON — this is a simulated network failure for UI-state testing.');
          }
          const results = await Promise.all(
            BUILTIN_FIXTURES.map(async (name) => {
              const res = await fetch(`/api/lab/fixtures?name=${encodeURIComponent(name)}`, { cache: 'no-store' });
              if (!res.ok) throw new Error(`Fixture ${name}: HTTP ${res.status}`);
              const data = (await res.json()) as { content?: unknown };
              // Parse with the SAME harness parser used everywhere in the lab.
              const { parse } = await import('./yt-search-parser');
              return parse(data.content) ?? [];
            }),
          );
          const byId = new Map<string, LabTrack>();
          for (const sections of results) {
            for (const section of sections) {
              for (const track of section.tracks) byId.set(track.id, track);
            }
          }
          set({ catalog: [...byId.values()], catalogStatus: 'ready', catalogError: null });
        } catch (error) {
          set({
            catalogStatus: 'error',
            catalogError: error instanceof Error ? error.message : 'Unknown catalog error',
          });
        }
      },

      currentTrackId: null,
      isPlaying: false,
      progressMs: 0,
      repeatMode: 'off',
      cycleRepeatMode: () => {
        const order: RepeatMode[] = ['off', 'all', 'one'];
        const nextMode = order[(order.indexOf(get().repeatMode) + 1) % order.length];
        set({ repeatMode: nextMode });
      },
      playTrack: (id) => {
        const { currentTrackId, playCounts } = get();
        set({
          currentTrackId: id,
          isPlaying: true,
          progressMs: currentTrackId === id ? get().progressMs : 0,
          playCounts: { ...playCounts, [id]: (playCounts[id] ?? 0) + 1 },
        });
      },
      togglePlay: () => set({ isPlaying: !get().isPlaying }),
      togglePlayId: (id) => {
        const { currentTrackId, isPlaying } = get();
        if (currentTrackId === id) {
          set({ isPlaying: !isPlaying });
        } else {
          get().playTrack(id);
        }
      },
      seekTo: (ms) => set({ progressMs: Math.max(0, ms) }),
      tick: () => {
        const { isPlaying, currentTrackId, progressMs, catalog, repeatMode, queue } = get();
        if (!isPlaying || currentTrackId === null) return;
        const track = catalog.find((t) => t.id === currentTrackId);
        const total = durationOf(track);
        const decision = computeTick(total, progressMs, repeatMode);
        if (decision.action === 'progress') {
          set({ progressMs: decision.progressMs });
        } else if (decision.action === 'restart') {
          set({ progressMs: 0 }); // repeat-one: same track, still playing
        } else {
          // Auto-advance honors the repeat mode (manual next() keeps wrap-around).
          const idx = queue.indexOf(currentTrackId);
          const nextIdx = computeNextIndex(queue.length, idx, repeatMode);
          if (nextIdx < 0 || !catalog.some((t) => t.id === queue[nextIdx])) {
            set({ isPlaying: false, progressMs: 0 }); // honest stop at queue end
            return;
          }
          set({ currentTrackId: queue[nextIdx], progressMs: 0, isPlaying: true });
        }
      },
      next: () => {
        const { queue, currentTrackId, catalog } = get();
        const idx = currentTrackId === null ? -1 : queue.indexOf(currentTrackId);
        const nextId = idx >= 0 && idx + 1 < queue.length ? queue[idx + 1] : (queue[0] ?? null);
        if (nextId === null || !catalog.some((t) => t.id === nextId)) {
          set({ isPlaying: false, progressMs: 0 });
          return;
        }
        set({ currentTrackId: nextId, progressMs: 0, isPlaying: true });
      },
      previous: () => {
        const { queue, currentTrackId } = get();
        if (get().progressMs > 3000) {
          set({ progressMs: 0 });
          return;
        }
        const idx = currentTrackId === null ? -1 : queue.indexOf(currentTrackId);
        const prevId = idx > 0 ? queue[idx - 1] : (queue[queue.length - 1] ?? null);
        if (prevId === null) {
          set({ progressMs: 0 });
          return;
        }
        set({ currentTrackId: prevId, progressMs: 0, isPlaying: true });
      },

      queue: [],
      addToQueue: (id) => {
        const { queue } = get();
        if (queue.includes(id)) return;
        set({ queue: [...queue, id] });
      },
      playNextInQueue: (id) => {
        const { queue } = get();
        const without = queue.filter((q) => q !== id);
        const idx = without.indexOf(get().currentTrackId ?? '');
        const insertAt = idx >= 0 ? idx + 1 : 0;
        set({ queue: [...without.slice(0, insertAt), id, ...without.slice(insertAt)] });
      },
      removeFromQueue: (id) => set({ queue: get().queue.filter((q) => q !== id) }),
      reorderQueue: (fromIndex, toIndex) => {
        const queue = [...get().queue];
        if (fromIndex < 0 || fromIndex >= queue.length || toIndex < 0 || toIndex >= queue.length) return;
        const [moved] = queue.splice(fromIndex, 1);
        queue.splice(toIndex, 0, moved);
        set({ queue });
      },
      clearQueue: () => set({ queue: [], isPlaying: false, progressMs: 0, currentTrackId: null }),
      shuffleQueue: () => {
        const { queue, currentTrackId } = get();
        set({ queue: shuffledQueue(queue, currentTrackId, Math.random) });
      },

      favorites: [],
      toggleFavorite: (id) => {
        const { favorites } = get();
        set({ favorites: favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id] });
      },
      playCounts: {},

      searchHistory: [],
      addSearchHistory: (entry) => {
        const { searchHistory } = get();
        // Skip exact consecutive duplicates (same query, same result shape) — a re-run
        // of the same query REPLACES the previous entry so the cap stays useful.
        const prev = searchHistory[0];
        if (prev !== undefined && prev.query === entry.query && prev.ok === entry.ok && prev.trackCount === entry.trackCount && prev.errorKind === entry.errorKind) {
          set({ searchHistory: [entry, ...searchHistory.slice(1)] });
          return;
        }
        set({ searchHistory: [entry, ...searchHistory.filter((h) => h.query !== entry.query)].slice(0, 8) });
      },
      clearSearchHistory: () => set({ searchHistory: [] }),

      lrcLibrary: [],
      saveLrc: (name, content) => {
        const { lrcLibrary } = get();
        const result = upsertLrcEntry(lrcLibrary, { name, content, savedAt: Date.now() });
        if (!result.ok) return result.reason;
        set({ lrcLibrary: result.library });
        return null;
      },
      removeLrc: (name) => set({ lrcLibrary: removeLrcEntry(get().lrcLibrary, name) }),
    }),
    {
      name: 'ridho-lab-store',
      storage: createJSONStorage(() => localStorage),
      // Persist only user data; navigation/catalog/simulation stay session-local.
      // WEBLAB-11: search history now persists too (real outcomes survive reloads).
      partialize: (state) => ({
        favorites: state.favorites,
        playCounts: state.playCounts,
        searchHistory: state.searchHistory,
        lrcLibrary: state.lrcLibrary,
      }),
      skipHydration: true,
    },
  ),
);

/** Tracks rendered as "playing" use this helper (simulated progress bar). */
export function effectiveDuration(track: LabTrack | undefined): number {
  return durationOf(track);
}
