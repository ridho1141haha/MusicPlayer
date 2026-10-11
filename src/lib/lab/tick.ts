/**
 * Simulated-playback tick decision (WEBLAB-10 tri-state in WEBLAB-11) — pure +
 * unit-tested so repeat behavior is provable without running the browser clock.
 *
 * The prototype's clock ticks +250 ms per beat. computeTick decides what happens
 * for ONE tick; computeNextIndex decides where auto-advance lands.
 *
 * Manual controls stay user-intent (next/previous always move, wrapping) —
 * only AUTOMATIC end-of-track honoring the repeat mode:
 *   'off' → queue ends when the last track ends (stop)
 *   'all' → the queue wraps around forever
 *   'one' → the same track restarts from 0 (still playing)
 */

export type RepeatMode = 'off' | 'all' | 'one';

export type TickAction =
  | { action: 'progress'; progressMs: number }
  | { action: 'advance' }
  | { action: 'restart' };

export function computeTick(
  totalMs: number,
  progressMs: number,
  repeatMode: RepeatMode,
  stepMs = 250,
): TickAction {
  if (totalMs <= 0) return { action: 'advance' };
  const next = progressMs + stepMs;
  if (next < totalMs) return { action: 'progress', progressMs: next };
  return repeatMode === 'one' ? { action: 'restart' } : { action: 'advance' };
}

/**
 * Index the queue advances to when a track ends. Returns -1 → stop playback
 * (repeat off at the end of the queue). Manual next/previous intentionally
 * bypasses this (explicit user intent wraps like every mainstream player).
 */
export function computeNextIndex(queueLength: number, currentIndex: number, repeatMode: RepeatMode): number {
  if (queueLength <= 0) return -1;
  if (currentIndex < 0 || currentIndex >= queueLength) return 0;
  if (repeatMode === 'off' && currentIndex === queueLength - 1) return -1;
  return (currentIndex + 1) % queueLength;
}

/** Human-readable one-liner for the current repeat mode (used by UI + a11y labels). */
export function repeatModeLabel(mode: RepeatMode): string {
  switch (mode) {
    case 'one':
      return 'repeat ONE — the track restarts when it ends';
    case 'all':
      return 'repeat ALL — the queue wraps around when it ends';
    default:
      return 'repeat off — playback stops at the end of the queue';
  }
}

/**
 * Clamped 0–100 playback progress for the mini-player hairline (WEBLAB-12).
 * NaN/Infinity-safe: any degenerate input maps to 0, values above the total
 * clamp to 100 (seeking past the end must never overflow the bar).
 */
export function progressPercent(progressMs: number, totalMs: number): number {
  if (!Number.isFinite(progressMs) || !Number.isFinite(totalMs) || totalMs <= 0 || progressMs <= 0) {
    return 0;
  }
  return Math.min(100, (progressMs / totalMs) * 100);
}

/**
 * 1-based "3/6" position of the current track inside the queue, or null when
 * nothing is playing / the track is not queued (drives the mini-player chip).
 */
export function queuePositionLabel(queue: readonly string[], currentTrackId: string | null): string | null {
  if (currentTrackId === null) return null;
  const idx = queue.indexOf(currentTrackId);
  return idx >= 0 ? `${idx + 1}/${queue.length}` : null;
}
