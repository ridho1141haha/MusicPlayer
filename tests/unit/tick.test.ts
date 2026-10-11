import { describe, expect, it } from 'vitest';

import { computeNextIndex, computeTick, progressPercent, queuePositionLabel, repeatModeLabel } from '../../src/lib/lab/tick';

describe('computeTick (simulated playback, repeat tri-state)', () => {
  const TOTAL = 200_000;
  const STEP = 250;

  it('advances by the step while inside the track', () => {
    const result = computeTick(TOTAL, 0, 'off', STEP);
    expect(result).toEqual({ action: 'progress', progressMs: STEP });
  });

  it('ends → advance when repeat is off or all (advance target decided by computeNextIndex)', () => {
    expect(computeTick(TOTAL, TOTAL - 1, 'off', STEP)).toEqual({ action: 'advance' });
    expect(computeTick(TOTAL, TOTAL, 'off', STEP)).toEqual({ action: 'advance' });
    expect(computeTick(TOTAL, TOTAL + 5_000, 'all', STEP)).toEqual({ action: 'advance' });
  });

  it('ends → restart (same track from 0) when repeat is one', () => {
    expect(computeTick(TOTAL, TOTAL - 1, 'one', STEP)).toEqual({ action: 'restart' });
    expect(computeTick(TOTAL, TOTAL + 5_000, 'one', STEP)).toEqual({ action: 'restart' });
  });

  it('non-positive total always advances (guards zero-length tracks)', () => {
    expect(computeTick(0, 0, 'one', STEP)).toEqual({ action: 'advance' });
    expect(computeTick(-1, 0, 'off', STEP)).toEqual({ action: 'advance' });
  });

  it('custom step is honored', () => {
    expect(computeTick(TOTAL, 0, 'off', 500)).toEqual({ action: 'progress', progressMs: 500 });
  });
});

describe('computeNextIndex (auto-advance target, WEBLAB-11)', () => {
  const Q = 4;

  it('empty queue → stop', () => {
    expect(computeNextIndex(0, 0, 'all')).toBe(-1);
    expect(computeNextIndex(0, -1, 'off')).toBe(-1);
  });

  it('mid-queue advances by one regardless of mode', () => {
    expect(computeNextIndex(Q, 0, 'off')).toBe(1);
    expect(computeNextIndex(Q, 1, 'all')).toBe(2);
    expect(computeNextIndex(Q, 2, 'one')).toBe(3); // 'one' only matters via computeTick restart
  });

  it("repeat 'off' at the last track → stop (-1)", () => {
    expect(computeNextIndex(Q, 3, 'off')).toBe(-1);
  });

  it("repeat 'all' at the last track → wraps to 0", () => {
    expect(computeNextIndex(Q, 3, 'all')).toBe(0);
    expect(computeNextIndex(1, 0, 'all')).toBe(0);
  });

  it('out-of-range current index falls back to the first track', () => {
    expect(computeNextIndex(Q, -5, 'off')).toBe(0);
    expect(computeNextIndex(Q, 99, 'all')).toBe(0);
  });

  it('single-track queue with repeat off → stop', () => {
    expect(computeNextIndex(1, 0, 'off')).toBe(-1);
  });
});

describe('repeatModeLabel (a11y + badge copy)', () => {
  it('labels all three modes honestly', () => {
    expect(repeatModeLabel('off')).toContain('repeat off');
    expect(repeatModeLabel('all')).toContain('repeat ALL');
    expect(repeatModeLabel('one')).toContain('repeat ONE');
  });
});

describe('progressPercent (mini-player hairline, WEBLAB-12)', () => {
  it('maps progress to a clamped 0–100 percentage', () => {
    expect(progressPercent(0, 200_000)).toBe(0);
    expect(progressPercent(50_000, 200_000)).toBe(25);
    expect(progressPercent(200_000, 200_000)).toBe(100);
  });

  it('clamps progress beyond the end to 100 (never overflows the bar)', () => {
    expect(progressPercent(250_000, 200_000)).toBe(100);
  });

  it('degenerate inputs map to 0 (NaN/Infinity/negative/zero-total safe)', () => {
    expect(progressPercent(NaN, 200_000)).toBe(0);
    expect(progressPercent(50_000, NaN)).toBe(0);
    expect(progressPercent(Infinity, Infinity)).toBe(0);
    expect(progressPercent(-1, 200_000)).toBe(0);
    expect(progressPercent(50_000, 0)).toBe(0);
  });
});

describe('queuePositionLabel (mini-player chip, WEBLAB-12)', () => {
  const queue = ['a', 'b', 'c'];

  it('shows a 1-based position for a queued track', () => {
    expect(queuePositionLabel(queue, 'b')).toBe('2/3');
    expect(queuePositionLabel(queue, 'a')).toBe('1/3');
  });

  it('returns null when nothing is playing or the track is not queued', () => {
    expect(queuePositionLabel(queue, null)).toBeNull();
    expect(queuePositionLabel(queue, 'zzz')).toBeNull();
    expect(queuePositionLabel([], 'a')).toBeNull();
  });
});
