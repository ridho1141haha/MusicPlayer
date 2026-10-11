import { describe, expect, it } from 'vitest';

import { diffFixtureParses, flattenTracks, formatDurationLabel, type FixtureDiff } from '../../src/lib/lab/fixture-diff';
import type { LabTrack, ParseResult, SearchSection } from '../../src/lib/lab/types';

function track(overrides: Partial<LabTrack> & { id: string }): LabTrack {
  return {
    sourceId: 'ytm',
    title: `Track ${overrides.id}`,
    artist: 'Artist',
    album: null,
    durationMs: 0,
    artworkUrl: null,
    ...overrides,
  };
}

function section(title: string, tracks: LabTrack[]): SearchSection {
  return { title, tracks };
}

function result(sections: SearchSection[] | null, rendererStats: Array<{ type: string; count: number }> = []): ParseResult {
  return { sections, trace: [], rendererStats, continuationToken: null };
}

describe('flattenTracks', () => {
  it('returns an empty map for null sections (Java null-root contract)', () => {
    expect(flattenTracks(null).size).toBe(0);
  });

  it('dedupes repeated ids keeping the first occurrence', () => {
    const sections = [
      section('Songs', [track({ id: 'ytm:a', title: 'First' })]),
      section('Videos', [track({ id: 'ytm:a', title: 'Second' }), track({ id: 'ytm:b' })]),
    ];
    const map = flattenTracks(sections);
    expect(map.size).toBe(2);
    expect(map.get('ytm:a')?.title).toBe('First');
  });
});

describe('formatDurationLabel', () => {
  it('formats ms as m:ss and dashes zero/negative', () => {
    expect(formatDurationLabel(187_000)).toBe('3:07');
    expect(formatDurationLabel(0)).toBe('—');
    expect(formatDurationLabel(-5)).toBe('—');
  });
});

describe('diffFixtureParses', () => {
  it('reports added/removed/changed/unchanged correctly', () => {
    const a = result([
      section('Songs', [track({ id: 'ytm:keep' }), track({ id: 'ytm:gone', title: 'Removed song' }), track({ id: 'ytm:mut' })]),
    ]);
    const b = result([
      section('Songs', [track({ id: 'ytm:keep' }), track({ id: 'ytm:mut', title: 'Renamed song' }), track({ id: 'ytm:new' })]),
    ]);
    const diff = diffFixtureParses(a, b);
    expect(diff.track.added.map((e) => e.id)).toEqual(['ytm:new']);
    expect(diff.track.removed.map((e) => e.id)).toEqual(['ytm:gone']);
    expect(diff.track.changed.map((e) => e.id)).toEqual(['ytm:mut']);
    expect(diff.track.changed[0]?.changes).toEqual(['title: Track ytm:mut → Renamed song']);
    expect(diff.track.unchanged).toBe(1);
    expect(diff.track.totalA).toBe(3);
    expect(diff.track.totalB).toBe(3);
    expect(diff.summary).toBe('+1 added · −1 removed · ~1 changed · 1 unchanged');
  });

  it('does NOT treat missing duration (0) on one side as a change', () => {
    const a = result([section('Songs', [track({ id: 'ytm:x', durationMs: 0 })])]);
    const b = result([section('Songs', [track({ id: 'ytm:x', durationMs: 205_000 })])]);
    const diff = diffFixtureParses(a, b);
    expect(diff.track.changed.length).toBe(0);
    expect(diff.track.unchanged).toBe(1);
  });

  it('treats a real duration difference as a change with a formatted label', () => {
    const a = result([section('Songs', [track({ id: 'ytm:x', durationMs: 180_000 })])]);
    const b = result([section('Songs', [track({ id: 'ytm:x', durationMs: 187_000 })])]);
    const diff = diffFixtureParses(a, b);
    expect(diff.track.changed[0]?.changes).toEqual(['duration: 3:00 → 3:07']);
  });

  it('treats album null vs set as a change and null as "—"', () => {
    const a = result([section('Songs', [track({ id: 'ytm:x', album: null })])]);
    const b = result([section('Songs', [track({ id: 'ytm:x', album: 'New Album' })])]);
    const diff = diffFixtureParses(a, b);
    expect(diff.track.changed[0]?.changes).toEqual(['album: — → New Album']);
  });

  it('handles legacy→live migration: everything added when A is null-root', () => {
    const a = result(null); // e.g. legacy fixture that parses to null
    const b = result([section('Songs', [track({ id: 'ytm:1' }), track({ id: 'ytm:2' })])]);
    const diff = diffFixtureParses(a, b);
    expect(diff.track.added.length).toBe(2);
    expect(diff.track.removed.length).toBe(0);
    expect(diff.track.totalA).toBe(0);
  });

  it('handles both sides empty/null without throwing', () => {
    const diff = diffFixtureParses(result(null), result([]));
    expect(diff.track.totalA).toBe(0);
    expect(diff.track.totalB).toBe(0);
    expect(diff.summary).toBe('+0 added · −0 removed · ~0 changed · 0 unchanged');
  });

  it('computes section statuses incl. added/removed/count-changed', () => {
    const a = result([
      section('Songs', [track({ id: 'ytm:1' }), track({ id: 'ytm:2' })]),
      section('Videos', [track({ id: 'ytm:3' })]),
    ]);
    const b = result([
      section('Songs', [track({ id: 'ytm:1' })]),
      section('Artists', [track({ id: 'ytm-album:q' })]),
    ]);
    const diff = diffFixtureParses(a, b);
    const byTitle = Object.fromEntries(diff.sections.map((s) => [s.title, s]));
    expect(byTitle['Songs']).toMatchObject({ countA: 2, countB: 1, status: 'count-changed' });
    expect(byTitle['Videos']).toMatchObject({ countA: 1, countB: 0, status: 'removed' });
    expect(byTitle['Artists']).toMatchObject({ countA: 0, countB: 1, status: 'added' });
  });

  it('computes renderer census delta sorted by movement', () => {
    const a = result([section('Songs', [])], [
      { type: 'musicShelfRenderer', count: 4 },
      { type: 'itemSectionRenderer', count: 0 },
    ]);
    const b = result([section('Songs', [])], [
      { type: 'itemSectionRenderer', count: 29 },
      { type: 'musicCardShelfRenderer', count: 1 },
      { type: 'musicShelfRenderer', count: 0 },
    ]);
    const diff = diffFixtureParses(a, b);
    expect(diff.renderers[0]).toMatchObject({ type: 'itemSectionRenderer', countA: 0, countB: 29, delta: 29 });
    const shelf = diff.renderers.find((r) => r.type === 'musicShelfRenderer');
    expect(shelf).toMatchObject({ countA: 4, countB: 0, delta: -4 });
  });

  it('is deterministic across repeated runs (QA-lab requirement)', () => {
    const a = result([section('Songs', [track({ id: 'ytm:1' }), track({ id: 'ytm:2' })])]);
    const b = result([section('Songs', [track({ id: 'ytm:2' }), track({ id: 'ytm:3' })])]);
    const run1 = JSON.stringify(diffFixtureParses(a, b));
    const run2 = JSON.stringify(diffFixtureParses(a, b));
    expect(run1).toBe(run2);
    const diff: FixtureDiff = JSON.parse(run1) as FixtureDiff;
    // Stable ordering: added ids follow B's map order (ytm:3), removed follow A's order (ytm:1).
    expect(diff.track.added[0]?.id).toBe('ytm:3');
    expect(diff.track.removed[0]?.id).toBe('ytm:1');
  });
});
