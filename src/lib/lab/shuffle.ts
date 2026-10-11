/**
 * Queue shuffle — WEB-LAB-9 (simulated playback context).
 *
 * Pure + unit-tested. Semantics match common music-app behavior:
 * - the currently playing track KEEPS its position;
 * - every other entry is Fisher–Yates shuffled with the provided RNG
 *   (injectable so tests are deterministic);
 * - a queue without a current track (or size < 2) is returned as a copy, unchanged.
 *
 * The Android app does NOT shuffle on the web side — this powers the prototype's
 * clearly-labeled "Shuffle (simulated)" control.
 */

export type Rng = () => number;

function fisherYates<T>(input: T[], rng: Rng): T[] {
  const arr = [...input];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

/**
 * Shuffle a queue of track ids. Never mutates the input.
 * Deterministic given a deterministic rng.
 */
export function shuffledQueue(queue: string[], currentTrackId: string | null, rng: Rng): string[] {
  if (queue.length < 2) return [...queue];
  if (currentTrackId === null || !queue.includes(currentTrackId)) {
    return fisherYates(queue, rng);
  }
  const others = queue.filter((id) => id !== currentTrackId);
  const shuffledOthers = fisherYates(others, rng);
  const anchor = queue.indexOf(currentTrackId);
  // Rebuild: slots before the anchor take shuffled items in order, then the
  // current track, then the rest — i.e. the anchor keeps its INDEX.
  const before = shuffledOthers.slice(0, anchor);
  const after = shuffledOthers.slice(anchor);
  return [...before, currentTrackId, ...after];
}
