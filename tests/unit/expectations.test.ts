import { describe, expect, it } from 'vitest';

import { evaluateExpectation, liveProbeVerdict, validateExpectationsFile } from '../../src/lib/lab/expectations';
import type { SearchSection } from '../../src/lib/lab/types';

function section(title: string, ids: string[]): SearchSection {
  return {
    title,
    tracks: ids.map((id) => ({
      id,
      sourceId: id.startsWith('ytm:') ? 'ytm' : id.split(':')[0],
      title: `t-${id}`,
      artist: 'a',
      album: null,
      durationMs: 0,
      artworkUrl: null,
    })),
  };
}

describe('evaluateExpectation', () => {
  const parse = [section('Top result', ['ytm:aaa']), section('Songs', ['ytm:bbb', 'ytm:ccc'])];

  it('passes when every assertion holds', () => {
    const result = evaluateExpectation(parse, {
      sectionCount: 2,
      trackCount: 3,
      sectionTitles: ['Top result', 'Songs'],
      mustIncludeIds: ['ytm:aaa', 'ytm:ccc'],
    });
    expect(result.ok).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.actual.trackCount).toBe(3);
  });

  it('reports sectionCount / trackCount drift honestly', () => {
    const result = evaluateExpectation(parse, { sectionCount: 1, trackCount: 99 });
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual([
      'sectionCount: expected 1, got 2',
      'trackCount: expected 99, got 3',
    ]);
  });

  it('checks section titles in order', () => {
    expect(evaluateExpectation(parse, { sectionTitles: ['Top result', 'Songs'] }).ok).toBe(true);
    const swapped = evaluateExpectation(parse, { sectionTitles: ['Songs', 'Top result'] });
    expect(swapped.ok).toBe(false);
    expect(swapped.failures[0]).toContain('sectionTitles');
  });

  it('flags missing mustInclude and present mustNotInclude ids', () => {
    const result = evaluateExpectation(parse, {
      mustIncludeIds: ['ytm:zzz'],
      mustNotIncludeIds: ['ytm:bbb'],
    });
    expect(result.ok).toBe(false);
    expect(result.failures).toEqual(['mustIncludeIds: missing "ytm:zzz"', 'mustNotIncludeIds: unexpectedly present "ytm:bbb"']);
  });

  it('treats a null-root parse (Java contract) as zero sections, not a crash', () => {
    const result = evaluateExpectation(null, { sectionCount: 0, trackCount: 0 });
    expect(result.ok).toBe(true);
    expect(result.actual.sectionCount).toBe(0);
    expect(evaluateExpectation(null, { sectionCount: 1 }).ok).toBe(false);
  });
});

describe('validateExpectationsFile', () => {
  it('accepts a valid file and skips _-prefixed metadata keys', () => {
    const validated = validateExpectationsFile({
      _comment: 'provenance note',
      'a.json': { trackCount: 2 },
      'b.json': { mustIncludeIds: ['ytm:x'], note: 'why' },
    });
    expect(validated.ok).toBe(true);
    if (validated.ok) expect(Object.keys(validated.expectations)).toEqual(['a.json', 'b.json']);
  });

  it('rejects non-objects, non-.json keys, bad numbers and empty expectations', () => {
    expect(validateExpectationsFile(null).ok).toBe(false);
    expect(validateExpectationsFile([1]).ok).toBe(false);
    expect(validateExpectationsFile({ bad: {} }).ok).toBe(false); // key without .json
    expect(validateExpectationsFile({ 'a.json': { trackCount: -1 } }).ok).toBe(false);
    expect(validateExpectationsFile({ 'a.json': { trackCount: 1.5 } }).ok).toBe(false);
    expect(validateExpectationsFile({ 'a.json': { mustIncludeIds: 'x' } }).ok).toBe(false);
    expect(validateExpectationsFile({ 'a.json': { note: 'no assertion at all' } }).ok).toBe(false);
  });
});

describe('liveProbeVerdict (WEBLAB-14 live golden probe)', () => {
  const okResult = { ok: true, failures: [], actual: { sectionCount: 4, trackCount: 8, titles: [], ids: [] } };
  const driftResult = { ok: false, failures: ['trackCount: expected 8, got 15'], actual: { sectionCount: 5, trackCount: 15, titles: [], ids: [] } };

  it('holds when the live parse satisfies the contract', () => {
    expect(liveProbeVerdict(true, 'Lathi', okResult)).toBe('holds');
  });

  it('drifts when the contract fails or the parse is null', () => {
    expect(liveProbeVerdict(true, 'Lathi', driftResult)).toBe('drift');
    expect(liveProbeVerdict(true, 'Lathi', null)).toBe('drift');
  });

  it('honest non-verdicts: no golden contract or no stored query', () => {
    expect(liveProbeVerdict(false, 'Lathi', okResult)).toBe('no-golden');
    expect(liveProbeVerdict(true, null, okResult)).toBe('no-query');
    expect(liveProbeVerdict(true, '   ', okResult)).toBe('no-query');
  });
});
