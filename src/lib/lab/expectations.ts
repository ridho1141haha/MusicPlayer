/**
 * Golden parse expectations — the drift alarm (WEB-LAB-10).
 *
 * A per-fixture contract: "when the harness parser eats THIS fixture, it MUST
 * produce exactly THIS shape". Expectations live in fixtures/ytm/expectations.json
 * (hand-written from the verified-current parse — the same values the Java unit
 * suite locks via YtMusicSearchParserTest). Consumers:
 *
 *  - scripts/check-expectations.ts  (run by scripts/run-qa.sh → a recorded QA
 *    suite; a mismatch = DRIFT = red suite on the dashboard)
 *  - the Fixtures & Parser tab (per-fixture golden badge, computed live)
 *
 * Pure functions only; unit-tested in tests/unit/expectations.test.ts.
 */

import type { SearchSection } from './types';

export interface FixtureExpectation {
  /** Exact number of sections the parse must produce. */
  sectionCount?: number;
  /** Exact total track count across all sections. */
  trackCount?: number;
  /** Exact section titles, in order. */
  sectionTitles?: string[];
  /** Every id here MUST appear somewhere in the parse (tracks or album/artist rows). */
  mustIncludeIds?: string[];
  /** No id here may appear. */
  mustNotIncludeIds?: string[];
  /** One-line human provenance: why this is the golden shape. */
  note?: string;
}

export type ExpectationsFile = Record<string, FixtureExpectation>;

export interface ExpectationResult {
  ok: boolean;
  /** Human-readable, honest failure list — empty when ok. */
  failures: string[];
  actual: {
    sectionCount: number;
    trackCount: number;
    titles: string[];
    ids: string[];
  };
}

/** Structural guard for the expectations file — never trust shape silently. */
export function validateExpectationsFile(value: unknown): { ok: true; expectations: ExpectationsFile } | { ok: false; error: string } {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'expectations.json must be a JSON object keyed by fixture name.' };
  }
  const out: ExpectationsFile = {};
  for (const [name, raw] of Object.entries(value as Record<string, unknown>)) {
    if (name.startsWith('_')) continue; // metadata keys (_comment, …) follow the _meta convention
    if (!name.endsWith('.json')) return { ok: false, error: `Key "${name}" must be a fixture file name ending in .json.` };
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, error: `Expectation for "${name}" must be an object.` };
    }
    const e = raw as Record<string, unknown>;
    const bad = (why: string) => ({ ok: false as const, error: `Expectation "${name}": ${why}` });
    for (const key of ['sectionCount', 'trackCount'] as const) {
      if (e[key] !== undefined && (typeof e[key] !== 'number' || !Number.isInteger(e[key]) || e[key] < 0)) {
        return bad(`${key} must be a non-negative integer.`);
      }
    }
    for (const key of ['mustIncludeIds', 'mustNotIncludeIds', 'sectionTitles'] as const) {
      if (e[key] !== undefined) {
        if (!Array.isArray(e[key]) || e[key].some((v) => typeof v !== 'string')) {
          return bad(`${key} must be an array of strings.`);
        }
      }
    }
    if (e['note'] !== undefined && typeof e['note'] !== 'string') return bad('note must be a string.');
    // At least one real assertion — an empty expectation would silently pass everything.
    const hasAssertion = ['sectionCount', 'trackCount', 'mustIncludeIds', 'mustNotIncludeIds', 'sectionTitles'].some(
      (k) => e[k] !== undefined,
    );
    if (!hasAssertion) return bad('must define at least one assertion.');
    out[name] = e as FixtureExpectation;
  }
  return { ok: true, expectations: out };
}

/**
 * Evaluate one parse against one expectation. Takes the SAME contract as the
 * harness `parse()` (Java-mirrored): `SearchSection[] | null` — null only for
 * a null root. Deterministic, order-stable failures.
 */
export function evaluateExpectation(sections: SearchSection[] | null, expectation: FixtureExpectation): ExpectationResult {
  const safeSections = sections ?? [];
  const ids = safeSections.flatMap((s) => s.tracks.map((t) => t.id));
  const titles = safeSections.map((s) => s.title);
  const actual = { sectionCount: safeSections.length, trackCount: ids.length, titles, ids };
  const failures: string[] = [];

  if (expectation.sectionCount !== undefined && actual.sectionCount !== expectation.sectionCount) {
    failures.push(`sectionCount: expected ${expectation.sectionCount}, got ${actual.sectionCount}`);
  }
  if (expectation.trackCount !== undefined && actual.trackCount !== expectation.trackCount) {
    failures.push(`trackCount: expected ${expectation.trackCount}, got ${actual.trackCount}`);
  }
  if (expectation.sectionTitles !== undefined) {
    const sameLength = actual.titles.length === expectation.sectionTitles.length;
    const sameOrder = sameLength && expectation.sectionTitles.every((t, i) => actual.titles[i] === t);
    if (!sameOrder) {
      failures.push(`sectionTitles: expected [${expectation.sectionTitles.join(' | ')}], got [${actual.titles.join(' | ')}]`);
    }
  }
  for (const id of expectation.mustIncludeIds ?? []) {
    if (!ids.includes(id)) failures.push(`mustIncludeIds: missing "${id}"`);
  }
  for (const id of expectation.mustNotIncludeIds ?? []) {
    if (ids.includes(id)) failures.push(`mustNotIncludeIds: unexpectedly present "${id}"`);
  }
  return { ok: failures.length === 0, failures, actual };
}

/**
 * Verdict for the LIVE golden probe (WEBLAB-14): the recorded contract is
 * evaluated against a LIVE search response instead of the stored fixture.
 * EXPERIMENTAL by nature — live shapes change over time, so drift here is a
 * signal to investigate, not automatically a parser bug (the stored-fixture
 * golden suite remains the authoritative alarm).
 */
export type LiveProbeVerdict = 'holds' | 'drift' | 'no-golden' | 'no-query';

export function liveProbeVerdict(
  hasGolden: boolean,
  query: string | null,
  result: ExpectationResult | null,
): LiveProbeVerdict {
  if (!hasGolden) return 'no-golden';
  if (query === null || query.trim().length === 0) return 'no-query';
  // A null parse (unusable root) vs a contract is drift by definition.
  return result !== null && result.ok ? 'holds' : 'drift';
}
