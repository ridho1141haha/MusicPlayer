import { describe, expect, it } from 'vitest';

import { relativeTime } from '../../src/lib/lab/format';

describe('relativeTime', () => {
  const NOW = new Date('2026-10-12T12:00:00.000Z');

  it('buckets sub-minute deltas as "just now"', () => {
    expect(relativeTime('2026-10-12T11:59:30.000Z', NOW)).toBe('just now');
    // future timestamps (clock skew) are also "just now", never negative
    expect(relativeTime('2026-10-12T12:05:00.000Z', NOW)).toBe('just now');
  });

  it('minutes bucket', () => {
    expect(relativeTime('2026-10-12T11:45:00.000Z', NOW)).toBe('15 min ago');
    expect(relativeTime('2026-10-12T11:01:00.000Z', NOW)).toBe('59 min ago');
  });

  it('hours bucket', () => {
    expect(relativeTime('2026-10-12T09:30:00.000Z', NOW)).toBe('2 h ago');
  });

  it('days bucket', () => {
    expect(relativeTime('2026-10-10T12:00:00.000Z', NOW)).toBe('2 d ago');
  });

  it('invalid ISO is honest: "unknown time"', () => {
    expect(relativeTime('not-a-date', NOW)).toBe('unknown time');
  });
});
