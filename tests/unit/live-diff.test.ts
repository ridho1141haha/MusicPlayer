import { describe, expect, it } from 'vitest';

import { isLiveSearchPayload, parseResultFromLivePayload } from '../../src/lib/lab/live-diff';

const GOOD = {
  ok: true,
  httpStatus: 200,
  durationMs: 453,
  query: 'Lathi',
  byteLength: 211_000,
  sections: [{ title: 'Songs', tracks: [] }],
  trace: [{ path: 'tabs[0]', kind: 'info', reason: 'root' }],
  rendererStats: [{ type: 'musicCardShelfRenderer', count: 1 }],
  continuationToken: null,
  note: null,
};

describe('isLiveSearchPayload', () => {
  it('accepts a well-formed payload', () => {
    expect(isLiveSearchPayload(GOOD)).toBe(true);
  });

  it('accepts sections === null (null-root parse contract)', () => {
    expect(isLiveSearchPayload({ ...GOOD, sections: null })).toBe(true);
  });

  it('rejects failures, wrong types and malformed sections', () => {
    expect(isLiveSearchPayload(null)).toBe(false);
    expect(isLiveSearchPayload('nope')).toBe(false);
    expect(isLiveSearchPayload({ ...GOOD, ok: false })).toBe(false);
    expect(isLiveSearchPayload({ ...GOOD, httpStatus: '200' })).toBe(false);
    expect(isLiveSearchPayload({ ...GOOD, trace: 'x' })).toBe(false);
    expect(isLiveSearchPayload({ ...GOOD, sections: [{ nope: true }] })).toBe(false);
    expect(isLiveSearchPayload({ ...GOOD, sections: [{ title: 3, tracks: [] }] })).toBe(false);
    expect(isLiveSearchPayload({ ...GOOD, query: undefined })).toBe(false);
  });
});

describe('parseResultFromLivePayload', () => {
  it('reassembles a ParseResult with all four fields', () => {
    const result = parseResultFromLivePayload(GOOD);
    expect(result).not.toBeNull();
    expect(result?.sections).toEqual(GOOD.sections);
    expect(result?.trace).toEqual(GOOD.trace);
    expect(result?.rendererStats).toEqual(GOOD.rendererStats);
    expect(result?.continuationToken).toBeNull();
  });

  it('preserves a null-root sections contract', () => {
    const result = parseResultFromLivePayload({ ...GOOD, sections: null });
    expect(result?.sections).toBeNull();
  });

  it('returns null (honest) on malformed payloads — never an empty parse', () => {
    expect(parseResultFromLivePayload({ hello: 1 })).toBeNull();
    expect(parseResultFromLivePayload(null)).toBeNull();
  });
});
