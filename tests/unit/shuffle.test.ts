import { describe, expect, it } from 'vitest';

import { shuffledQueue, type Rng } from '../../src/lib/lab/shuffle';

/** Deterministic LCG for reproducible tests. */
function lcg(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

describe('shuffledQueue', () => {
  it('returns a copy for empty / single-item queues', () => {
    expect(shuffledQueue([], null, lcg(1))).toEqual([]);
    expect(shuffledQueue(['a'], 'a', lcg(1))).toEqual(['a']);
  });

  it('keeps the current track at its index and shuffles the rest (deterministic with seed)', () => {
    const queue = ['a', 'b', 'c', 'd', 'e'];
    const out = shuffledQueue(queue, 'c', lcg(42));
    expect(out).toHaveLength(5);
    expect(out[2]).toBe('c'); // anchor keeps its index
    expect([...out].sort()).toEqual([...queue].sort()); // same members
    expect(out).not.toBe(queue); // no mutation
    // Deterministic: same seed → same result
    expect(shuffledQueue(queue, 'c', lcg(42))).toEqual(out);
  });

  it('shuffles the whole queue when there is no current track', () => {
    const queue = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const out = shuffledQueue(queue, null, lcg(7));
    expect([...out].sort()).toEqual([...queue].sort());
  });

  it('shuffles the whole queue when current track is not in the queue', () => {
    const queue = ['a', 'b', 'c'];
    const out = shuffledQueue(queue, 'zzz', lcg(3));
    expect([...out].sort()).toEqual(['a', 'b', 'c']);
  });

  it('eventually produces a different order for a 6-item queue (sanity, seeded rng)', () => {
    const queue = ['a', 'b', 'c', 'd', 'e', 'f'];
    let sawDifference = false;
    for (let seed = 1; seed <= 20; seed += 1) {
      if (shuffledQueue(queue, null, lcg(seed)).join(',') !== queue.join(',')) {
        sawDifference = true;
        break;
      }
    }
    expect(sawDifference).toBe(true);
  });

  it('anchor at index 0 stays first; anchor at last index stays last', () => {
    const queue = ['a', 'b', 'c'];
    expect(shuffledQueue(queue, 'a', lcg(99))[0]).toBe('a');
    expect(shuffledQueue(queue, 'c', lcg(99))[2]).toBe('c');
  });
});
