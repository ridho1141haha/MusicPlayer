/**
 * Live-probe summary (WEBLAB-15) — pure aggregation for the non-gating
 * run-qa signal suite (scripts/live-probe.ts) and the dashboard row.
 *
 * The live probe is a SIGNAL, never a gate: live drift must not fail the
 * pipeline, so the summary reduces per-fixture verdicts to one of four
 * honest signals: 'holds' | 'drift' | 'error' | 'skipped'.
 */

export type LiveProbeSignal = 'holds' | 'drift' | 'error' | 'skipped';

export interface LiveProbeEntryInput {
  verdict: 'holds' | 'drift' | 'error';
}

export interface LiveProbeSummary {
  signal: LiveProbeSignal;
  probed: number;
  holds: number;
  drift: number;
  errors: number;
}

/**
 * Reduce probed entries to one summary.
 *  - any error   → 'error'  (infrastructure/transport problem — investigate, not drift)
 *  - any drift   → 'drift'  (the signal the probe exists for)
 *  - else holds  → 'holds'
 * Empty input (nothing probeable / suite skipped) → 'skipped'.
 */
export function summarizeLiveProbe(entries: LiveProbeEntryInput[]): LiveProbeSummary {
  const holds = entries.filter((e) => e.verdict === 'holds').length;
  const drift = entries.filter((e) => e.verdict === 'drift').length;
  const errors = entries.filter((e) => e.verdict === 'error').length;
  const probed = entries.length;
  const signal: LiveProbeSignal =
    probed === 0 ? 'skipped' : errors > 0 ? 'error' : drift > 0 ? 'drift' : 'holds';
  return { signal, probed, holds, drift, errors };
}
