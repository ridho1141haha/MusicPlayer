import { describe, expect, it } from 'vitest';

import { isValidFixtureName, suggestFixtureName } from '../../src/lib/lab/fixture-name';

describe('suggestFixtureName', () => {
  const NOW = new Date('2026-10-12T03:41:00.000Z');

  it('matches the built-in capture naming convention', () => {
    expect(suggestFixtureName('Lathi', NOW)).toBe('search_live_2026-10-12_lathi.json');
  });

  it('slugs spaces, mixed case and punctuation', () => {
    expect(suggestFixtureName('Test Query!! (live)', NOW)).toBe('search_live_2026-10-12_test_query_live.json');
  });

  it('collapses repeated separators and trims edges', () => {
    expect(suggestFixtureName('  ---weird   name---  ', NOW)).toBe('search_live_2026-10-12_weird_name.json');
  });

  it('falls back to "query" when everything is stripped', () => {
    expect(suggestFixtureName('🎵🎵🎵', NOW)).toBe('search_live_2026-10-12_query.json');
  });

  it('caps the slug at 48 chars so the whole name stays within API limits', () => {
    const long = 'a'.repeat(120);
    const name = suggestFixtureName(long, NOW);
    expect(name.length).toBeLessThanOrEqual(130);
    expect(name.endsWith('.json')).toBe(true);
    expect(isValidFixtureName(name)).toBe(true);
  });

  it('produces names that always pass the API NAME_PATTERN', () => {
    for (const q of ['Lathi', 'test', 'DJ PIMPin PIcek!!', 'пере', 'x+y=z']) {
      const name = suggestFixtureName(q, NOW);
      expect(isValidFixtureName(name)).toBe(true);
    }
  });

  it('uses the date from the injected instant (pure, no clock reads)', () => {
    expect(suggestFixtureName('abc', new Date('2025-01-02T00:00:00Z'))).toBe('search_live_2025-01-02_abc.json');
  });
});

describe('isValidFixtureName', () => {
  it('accepts well-formed names', () => {
    expect(isValidFixtureName('search_live_2026-10-11_lathi.json')).toBe(true);
    expect(isValidFixtureName('A.json')).toBe(true);
  });

  it('rejects traversal and bad shapes', () => {
    expect(isValidFixtureName('..json')).toBe(false);
    expect(isValidFixtureName('a/../b.json')).toBe(false);
    expect(isValidFixtureName('.json')).toBe(false);
    expect(isValidFixtureName('no-extension')).toBe(false);
    expect(isValidFixtureName('name with space.json')).toBe(false);
    expect(isValidFixtureName('')).toBe(false);
  });
});
