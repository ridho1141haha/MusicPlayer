/**
 * Simulated-playback tick decision (WEBLAB-10) — pure + unit-tested so the
 * repeat-one behavior is provable without running the browser clock.
 *
 * The prototype's clock ticks +250 ms per beat. This decides what happens for
 * one tick. "End" (progressMs >= totalMs) normally advances the queue; with
 * repeat-one enabled the SAME track restarts from 0 (still playing).
 */

export type TickAction =
  | { action: 'progress'; progressMs: number }
  | { action: 'advance' }
  | { action: 'restart' };

export function computeTick(
  totalMs: number,
  progressMs: number,
  repeatOne: boolean,
  stepMs = 250,
): TickAction {
  if (totalMs <= 0) return { action: 'advance' };
  const next = progressMs + stepMs;
  if (next < totalMs) return { action: 'progress', progressMs: next };
  return repeatOne ? { action: 'restart' } : { action: 'advance' };
}
