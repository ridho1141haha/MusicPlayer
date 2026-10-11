import { describe, expect, it } from 'vitest';

import { findSupersededFixture, findSupersedingFixture } from '../../src/lib/lab/fixture-lineage';
import { summarizeLiveProbe } from '../../src/lib/lab/probe-summary';
import { liveSearchRequestInit, LIVE_SEARCH_TIMEOUT_MS } from '../../src/lib/lab/live-search';

import type { FixtureMeta } from '../../src/lib/lab/types';

function meta(partial: Partial<FixtureMeta>): FixtureMeta {
  return {
    name: 'fixture.json',
    origin: 'real-capture',
    capturedAt: null,
    query: null,
    description: '',
    sizeBytes: 0,
    ...partial,
  };
}

const FIXTURES: FixtureMeta[] = [
  meta({ name: 'search_live_2026-10-11_lathi.json', capturedAt: '2026-10-11', query: 'Lathi', supersededBy: 'search_live_2026-10-12_lathi.json' }),
  meta({ name: 'search_live_2026-10-12_lathi.json', capturedAt: '2026-10-12', query: 'Lathi', supersedes: 'search_live_2026-10-11_lathi.json' }),
  meta({ name: 'search_synth_edge_cases.json', origin: 'synthetic' }),
];

describe('fixture lineage (WEBLAB-15)', () => {
  it('finds the successor via the fixture own supersededBy declaration', () => {
    const successor = findSupersedingFixture(FIXTURES, 'search_live_2026-10-11_lathi.json');
    expect(successor?.name).toBe('search_live_2026-10-12_lathi.json');
  });

  it('falls back to scanning supersedes declarations when the back-link is missing', () => {
    const withoutBackLink = FIXTURES.map((f) => (f.name.startsWith('search_live') ? { ...f, supersededBy: null, supersedes: f.supersedes ?? null } : f));
    const successor = findSupersedingFixture(withoutBackLink, 'search_live_2026-10-11_lathi.json');
    expect(successor?.name).toBe('search_live_2026-10-12_lathi.json');
  });

  it('returns null for fixtures nobody replaced', () => {
    expect(findSupersedingFixture(FIXTURES, 'search_live_2026-10-12_lathi.json')).toBeNull();
    expect(findSupersedingFixture(FIXTURES, 'search_synth_edge_cases.json')).toBeNull();
    expect(findSupersedingFixture(FIXTURES, 'not-in-list.json')).toBeNull();
  });

  it('resolves what a fixture replaced via its own supersedes declaration', () => {
    const predecessor = findSupersededFixture(FIXTURES, 'search_live_2026-10-12_lathi.json');
    expect(predecessor?.name).toBe('search_live_2026-10-11_lathi.json');
  });

  it('returns null when a fixture declares nothing (or declares an unknown name)', () => {
    expect(findSupersededFixture(FIXTURES, 'search_live_2026-10-11_lathi.json')).toBeNull();
    expect(findSupersededFixture(FIXTURES, 'search_synth_edge_cases.json')).toBeNull();
    const dangling = [...FIXTURES, meta({ name: 'orphan.json', supersedes: 'ghost.json' })];
    expect(findSupersededFixture(dangling, 'orphan.json')).toBeNull();
  });
});

describe('live probe summary (WEBLAB-15)', () => {
  it('empty input is an honest skip, not a pass', () => {
    expect(summarizeLiveProbe([])).toEqual({ signal: 'skipped', probed: 0, holds: 0, drift: 0, errors: 0 });
  });

  it('all holds → holds', () => {
    expect(summarizeLiveProbe([{ verdict: 'holds' }, { verdict: 'holds' }])).toEqual({
      signal: 'holds',
      probed: 2,
      holds: 2,
      drift: 0,
      errors: 0,
    });
  });

  it('any drift → drift signal (with counts)', () => {
    const summary = summarizeLiveProbe([{ verdict: 'holds' }, { verdict: 'drift' }, { verdict: 'holds' }]);
    expect(summary.signal).toBe('drift');
    expect(summary.probed).toBe(3);
    expect(summary.drift).toBe(1);
  });

  it('errors outrank drift — a transport problem is not drift', () => {
    const summary = summarizeLiveProbe([{ verdict: 'drift' }, { verdict: 'error' }]);
    expect(summary.signal).toBe('error');
  });

  it('drift outranks holds', () => {
    expect(summarizeLiveProbe([{ verdict: 'holds' }, { verdict: 'drift' }]).signal).toBe('drift');
  });
});

describe('live-search shared client (WEBLAB-15)', () => {
  it('builds the EXACT request the Android app sends (WEB_REMIX, no extras)', () => {
    const { url, init } = liveSearchRequestInit('Lathi');
    expect(url).toBe('https://music.youtube.com/youtubei/v1/search?prettyPrint=false');
    expect(init.method).toBe('POST');
    const headers = init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Origin']).toBe('https://music.youtube.com');
    expect(headers['Referer']).toBe('https://music.youtube.com/');
    expect(headers['User-Agent']).toContain('Chrome/128');
    const body = JSON.parse(String(init.body));
    expect(body.query).toBe('Lathi');
    expect(body.context.client.clientName).toBe('WEB_REMIX');
    expect(body.context.client.clientVersion).toBe('1.20241028.01.00');
    // No credentials, no bypass — cache disabled, no extra fields.
    expect(init.cache).toBe('no-store');
  });

  it('exports the same default timeout the route used before extraction', () => {
    expect(LIVE_SEARCH_TIMEOUT_MS).toBe(15_000);
  });
});
