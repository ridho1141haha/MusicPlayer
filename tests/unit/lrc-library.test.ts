import { describe, expect, it } from 'vitest';

import {
  MAX_LRC_CONTENT_BYTES,
  removeLrcEntry,
  sortLrcLibrary,
  upsertLrcEntry,
  type SavedLrcEntry,
} from '../../src/lib/lab/lrc-library';

const entry = (name: string, savedAt: number, content = `[00:01.00]${name}`): { name: string; content: string; savedAt: number } => ({
  name,
  content,
  savedAt,
});

describe('upsertLrcEntry (browser-local LRC library, WEBLAB-12)', () => {
  it('prepends a new entry', () => {
    const result = upsertLrcEntry([], entry('a.lrc', 1));
    expect(result).toEqual({ ok: true, library: [expect.objectContaining({ name: 'a.lrc' })], replaced: false });
    expect(result.ok && result.library[0].sizeBytes).toBeGreaterThan(0);
  });

  it('re-saving the same name REPLACES in place (position preserved)', () => {
    const initial: SavedLrcEntry[] = [
      { name: 'a.lrc', content: 'old', savedAt: 1, sizeBytes: 3 },
      { name: 'b.lrc', content: 'b', savedAt: 2, sizeBytes: 1 },
    ];
    const result = upsertLrcEntry(initial, entry('a.lrc', 9, 'new content'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.replaced).toBe(true);
    expect(result.library.map((e) => e.name)).toEqual(['a.lrc', 'b.lrc']);
    expect(result.library[0]).toMatchObject({ content: 'new content', savedAt: 9 });
  });

  it('trims to the cap by dropping the OLDEST tail', () => {
    const library: SavedLrcEntry[] = Array.from({ length: 12 }, (_, i) => ({
      name: `t${i}.lrc`,
      content: 'x',
      savedAt: i,
      sizeBytes: 1,
    }));
    const result = upsertLrcEntry(library, entry('new.lrc', 100));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.library.length).toBe(12);
    expect(result.library[0].name).toBe('new.lrc');
    expect(result.library.at(-1)?.name).toBe('t10.lrc'); // t11 (oldest) fell off
  });

  it('rejects empty names and oversized content with honest reasons', () => {
    expect(upsertLrcEntry([], entry('   ', 1))).toEqual({ ok: false, reason: 'empty-name' });
    const huge = 'x'.repeat(MAX_LRC_CONTENT_BYTES + 1);
    expect(upsertLrcEntry([], entry('big.lrc', 1, huge))).toEqual({ ok: false, reason: 'too-large' });
  });

  it('name is trimmed before storing', () => {
    const result = upsertLrcEntry([], entry('  spaced.lrc  ', 1));
    expect(result.ok && result.library[0].name).toBe('spaced.lrc');
  });
});

describe('removeLrcEntry', () => {
  it('removes by name and is idempotent for unknown names', () => {
    const library: SavedLrcEntry[] = [
      { name: 'a.lrc', content: '', savedAt: 1, sizeBytes: 0 },
      { name: 'b.lrc', content: '', savedAt: 2, sizeBytes: 0 },
    ];
    expect(removeLrcEntry(library, 'a.lrc').map((e) => e.name)).toEqual(['b.lrc']);
    expect(removeLrcEntry(library, 'nope.lrc').length).toBe(2);
  });
});

describe('sortLrcLibrary', () => {
  it('sorts newest first with name A→Z tie-break', () => {
    const sorted = sortLrcLibrary([
      { name: 'b.lrc', content: '', savedAt: 5, sizeBytes: 0 },
      { name: 'z.lrc', content: '', savedAt: 5, sizeBytes: 0 },
      { name: 'a.lrc', content: '', savedAt: 9, sizeBytes: 0 },
    ]);
    expect(sorted.map((e) => e.name)).toEqual(['a.lrc', 'b.lrc', 'z.lrc']);
  });

  it('does not mutate the input', () => {
    const library: SavedLrcEntry[] = [{ name: 'b.lrc', content: '', savedAt: 1, sizeBytes: 0 }];
    sortLrcLibrary(library);
    expect(library[0].name).toBe('b.lrc');
  });
});
