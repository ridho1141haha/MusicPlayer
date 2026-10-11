import { describe, expect, it } from 'vitest';

import { computeTick } from '../../src/lib/lab/tick';

describe('computeTick (simulated playback, repeat-one)', () => {
  const TOTAL = 200_000;
  const STEP = 250;

  it('advances by the step while inside the track', () => {
    const result = computeTick(TOTAL, 0, false, STEP);
    expect(result).toEqual({ action: 'progress', progressMs: STEP });
  });

  it('ends → advance when repeat-one is off', () => {
    expect(computeTick(TOTAL, TOTAL - 1, false, STEP)).toEqual({ action: 'advance' });
    expect(computeTick(TOTAL, TOTAL, false, STEP)).toEqual({ action: 'advance' });
    expect(computeTick(TOTAL, TOTAL + 5_000, false, STEP)).toEqual({ action: 'advance' });
  });

  it('ends → restart (same track from 0) when repeat-one is on', () => {
    expect(computeTick(TOTAL, TOTAL - 1, true, STEP)).toEqual({ action: 'restart' });
    expect(computeTick(TOTAL, TOTAL + 5_000, true, STEP)).toEqual({ action: 'restart' });
  });

  it('non-positive total always advances (guards zero-length tracks)', () => {
    expect(computeTick(0, 0, true, STEP)).toEqual({ action: 'advance' });
    expect(computeTick(-1, 0, false, STEP)).toEqual({ action: 'advance' });
  });

  it('custom step is honored', () => {
    expect(computeTick(TOTAL, 0, false, 500)).toEqual({ action: 'progress', progressMs: 500 });
  });
});
