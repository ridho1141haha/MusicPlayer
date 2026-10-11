'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { LabTrack } from './types';

export type LabTab = 'dashboard' | 'playground' | 'fixtures' | 'prototype' | 'parity' | 'project';

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

  // ---- favorites / play counts (persisted) -----------------------------------
  favorites: string[];
  toggleFavorite(id: string): void;
  playCounts: Record<string, number>;
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
        const { isPlaying, currentTrackId, progressMs, catalog } = get();
        if (!isPlaying || currentTrackId === null) return;
        const track = catalog.find((t) => t.id === currentTrackId);
        const total = durationOf(track);
        const nextProgress = progressMs + 250;
        if (nextProgress >= total) {
          get().next();
        } else {
          set({ progressMs: nextProgress });
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

      favorites: [],
      toggleFavorite: (id) => {
        const { favorites } = get();
        set({ favorites: favorites.includes(id) ? favorites.filter((f) => f !== id) : [...favorites, id] });
      },
      playCounts: {},
    }),
    {
      name: 'ridho-lab-store',
      storage: createJSONStorage(() => localStorage),
      // Persist only user data; navigation/catalog/simulation stay session-local.
      partialize: (state) => ({ favorites: state.favorites, playCounts: state.playCounts }),
      skipHydration: true,
    },
  ),
);

/** Tracks rendered as "playing" use this helper (simulated progress bar). */
export function effectiveDuration(track: LabTrack | undefined): number {
  return durationOf(track);
}
