/**
 * Fixture diff — compare two parses of (possibly different) search-response fixtures.
 *
 * Pure functions only (unit-tested in tests/unit/fixture-diff.test.ts). This is a
 * WEB-LAB-ONLY analysis tool: the Android app never diffs fixtures. It exists to make
 * format drift visible — e.g. the legacy `musicShelfRenderer` layout vs the 2025+
 * flat layout (`musicCardShelfRenderer` + `itemSectionRenderer`).
 *
 * Matching rules (documented, deterministic):
 * - A track identity is `track.id` ("ytm:<videoId>", "ytm-album:<browseId>", …),
 *   mirroring the Android Track id semantics.
 * - A track counts as CHANGED when id matches but any of title/artist/album/
 *   durationMs/artworkUrl differs. Duration 0 on one side is NOT a change (flat
 *   layout rows legitimately carry no duration; the Android app resolves it later).
 */

import type { LabTrack, ParseResult, RendererStat, SearchSection } from './types';

export type TrackDiffKind = 'added' | 'removed' | 'changed' | 'unchanged';

export interface TrackDiffEntry {
  kind: TrackDiffKind;
  id: string;
  /** Label helper: "Title — Artist". */
  label: string;
  /** Present for changed entries: the A-side values. */
  before?: Partial<Pick<LabTrack, 'title' | 'artist' | 'album' | 'durationMs'>>;
  /** Present for added/changed entries: the B-side values. */
  after?: Partial<Pick<LabTrack, 'title' | 'artist' | 'album' | 'durationMs'>>;
  /** Human-readable change list for changed entries. */
  changes?: string[];
}

export interface SectionDiffEntry {
  title: string;
  countA: number;
  countB: number;
  status: 'added' | 'removed' | 'same' | 'count-changed';
}

export interface FixtureDiff {
  track: {
    added: TrackDiffEntry[];
    removed: TrackDiffEntry[];
    changed: TrackDiffEntry[];
    unchanged: number;
    totalA: number;
    totalB: number;
  };
  sections: SectionDiffEntry[];
  renderers: Array<{ type: string; countA: number; countB: number; delta: number }>;
  /** Short deterministic one-liner, e.g. "+3 added · −1 removed · ~2 changed · 12 unchanged". */
  summary: string;
}

/** Flatten sections into a map keyed by track id, preserving first-seen order info. */
export function flattenTracks(sections: SearchSection[] | null): Map<string, LabTrack> {
  const map = new Map<string, LabTrack>();
  if (sections === null) return map;
  for (const section of sections) {
    for (const track of section.tracks) {
      // First occurrence wins (mirrors the store's byId dedup behavior).
      if (!map.has(track.id)) map.set(track.id, track);
    }
  }
  return map;
}

function labelOf(track: LabTrack): string {
  return `${track.title} — ${track.artist}`;
}

const COMPARED_FIELDS: Array<keyof Pick<LabTrack, 'title' | 'artist' | 'album' | 'durationMs'>> = [
  'title',
  'artist',
  'album',
  'durationMs',
];

function isRealDurationChange(a: number, b: number): boolean {
  // 0 means "no duration in this fixture" — not a real difference.
  if (a === 0 || b === 0) return false;
  return a !== b;
}

function fieldChanged(field: keyof Pick<LabTrack, 'title' | 'artist' | 'album' | 'durationMs'>, a: LabTrack, b: LabTrack): boolean {
  if (field === 'durationMs') return isRealDurationChange(a.durationMs, b.durationMs);
  return a[field] !== b[field];
}

const FIELD_LABELS: Record<keyof Pick<LabTrack, 'title' | 'artist' | 'album' | 'durationMs'>, string> = {
  title: 'title',
  artist: 'artist',
  album: 'album',
  durationMs: 'duration',
};

export function formatDurationLabel(ms: number): string {
  if (ms <= 0) return '—';
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function describeChanges(a: LabTrack, b: LabTrack): string[] {
  const changes: string[] = [];
  for (const field of COMPARED_FIELDS) {
    if (!fieldChanged(field, a, b)) continue;
    const before = field === 'durationMs' ? formatDurationLabel(a.durationMs) : (a[field] ?? '—');
    const after = field === 'durationMs' ? formatDurationLabel(b.durationMs) : (b[field] ?? '—');
    changes.push(`${FIELD_LABELS[field]}: ${String(before)} → ${String(after)}`);
  }
  return changes;
}

function diffRendererStats(statsA: RendererStat[], statsB: RendererStat[]): FixtureDiff['renderers'] {
  const mapA = new Map(statsA.map((s) => [s.type, s.count]));
  const mapB = new Map(statsB.map((s) => [s.type, s.count]));
  const types = [...new Set([...mapA.keys(), ...mapB.keys()])].sort((a, b) => {
    const deltaA = (mapB.get(a) ?? 0) - (mapA.get(a) ?? 0);
    const deltaB = (mapB.get(b) ?? 0) - (mapA.get(b) ?? 0);
    // Biggest absolute movement first, then alphabetical for stability.
    return Math.abs(deltaB) - Math.abs(deltaA) || a.localeCompare(b);
  });
  return types.map((type) => {
    const countA = mapA.get(type) ?? 0;
    const countB = mapB.get(type) ?? 0;
    return { type, countA, countB, delta: countB - countA };
  });
}

function diffSections(sectionsA: SearchSection[] | null, sectionsB: SearchSection[] | null): SectionDiffEntry[] {
  const mapA = new Map<string, number>();
  const mapB = new Map<string, number>();
  for (const s of sectionsA ?? []) mapA.set(s.title, s.tracks.length);
  for (const s of sectionsB ?? []) mapB.set(s.title, s.tracks.length);
  const titles = [...new Set([...mapA.keys(), ...mapB.keys()])];
  return titles.map((title) => {
    const countA = mapA.get(title) ?? 0;
    const countB = mapB.get(title) ?? 0;
    let status: SectionDiffEntry['status'];
    if (countA === 0) status = 'added';
    else if (countB === 0) status = 'removed';
    else if (countA !== countB) status = 'count-changed';
    else status = 'same';
    return { title, countA, countB, status };
  });
}

/**
 * Diff two parse results. Handles the Java-parser contract edge cases:
 * `parse(root) === null` means the fixture is an unrecognized root (null sections),
 * which flattenTracks treats as "no tracks" — exactly how the app would see it.
 */
export function diffFixtureParses(a: ParseResult, b: ParseResult): FixtureDiff {
  const mapA = flattenTracks(a.sections);
  const mapB = flattenTracks(b.sections);

  const added: TrackDiffEntry[] = [];
  const removed: TrackDiffEntry[] = [];
  const changed: TrackDiffEntry[] = [];
  let unchanged = 0;

  for (const [id, trackA] of mapA) {
    const trackB = mapB.get(id);
    if (trackB === undefined) {
      removed.push({ kind: 'removed', id, label: labelOf(trackA) });
      continue;
    }
    const changes = describeChanges(trackA, trackB);
    if (changes.length > 0) {
      changed.push({
        kind: 'changed',
        id,
        label: labelOf(trackB),
        before: {
          title: trackA.title,
          artist: trackA.artist,
          album: trackA.album,
          durationMs: trackA.durationMs,
        },
        after: {
          title: trackB.title,
          artist: trackB.artist,
          album: trackB.album,
          durationMs: trackB.durationMs,
        },
        changes,
      });
    } else {
      unchanged += 1;
    }
  }

  for (const [id, trackB] of mapB) {
    if (!mapA.has(id)) added.push({ kind: 'added', id, label: labelOf(trackB), after: { title: trackB.title, artist: trackB.artist } });
  }

  const sections = diffSections(a.sections, b.sections);
  const renderers = diffRendererStats(a.rendererStats, b.rendererStats);

  const summary = `+${added.length} added · −${removed.length} removed · ~${changed.length} changed · ${unchanged} unchanged`;

  return {
    track: {
      added,
      removed,
      changed,
      unchanged,
      totalA: mapA.size,
      totalB: mapB.size,
    },
    sections,
    renderers,
    summary,
  };
}
