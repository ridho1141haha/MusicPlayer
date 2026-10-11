/**
 * Live golden probe — NON-GATING recorded QA signal suite (WEBLAB-15).
 *
 * For every fixture that has BOTH a golden contract and a stored query, this
 * re-runs the query against the LIVE API (via the same shared client the app's
 * route uses) and evaluates the live shape against the recorded contract.
 *
 * GATING POLICY (by design): this suite NEVER affects the run-qa exit code.
 * Live responses change over time — drift here is an investigation signal,
 * not automatically a parser bug. The stored-fixture golden suite
 * (scripts/check-expectations.ts) stays the authoritative alarm. The script
 * therefore always exits 0 and writes /tmp/rm-qa/live-probe.json for
 * scripts/collect-qa.mjs; even transport errors are recorded, never thrown.
 *
 * Opt out: RM_LIVE_PROBE=skip bash scripts/run-qa.sh  (records status 'skipped').
 *
 * Usage: bun scripts/live-probe.ts
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { evaluateExpectation, validateExpectationsFile } from '../src/lib/lab/expectations';
import { liveSearch } from '../src/lib/lab/live-search';
import { summarizeLiveProbe, type LiveProbeSignal } from '../src/lib/lab/probe-summary';
import { parse } from '../src/lib/lab/yt-search-parser';

const ROOT = process.cwd();
const DIR = join(ROOT, 'fixtures', 'ytm');
const USER_DIR = join(ROOT, 'data', 'fixtures-user');
const OUT = '/tmp/rm-qa/live-probe.json';

interface Entry {
  fixture: string;
  query: string | null;
  verdict: 'holds' | 'drift' | 'error';
  shape: string | null;
  httpStatus: number | null;
  durationMs: number | null;
  failures: string[];
  message: string | null;
}

const startedAll = Date.now();

if (process.env.RM_LIVE_PROBE === 'skip') {
  mkdirSync('/tmp/rm-qa', { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      { status: 'skipped', probed: 0, holds: 0, drift: 0, errors: 0, durationMs: null, recordedAt: new Date().toISOString(), command: 'bun scripts/live-probe.ts', detail: 'Skipped via RM_LIVE_PROBE=skip.', entries: [] },
      null,
      2,
    ),
  );
  console.log('live probe: skipped (RM_LIVE_PROBE=skip)');
  process.exit(0);
}

// ---- load the golden contract (missing/invalid → skipped, never a gate) ----
let expectations: Record<string, unknown> | null = null;
try {
  expectations = JSON.parse(readFileSync(join(DIR, 'expectations.json'), 'utf8'));
} catch {
  expectations = null;
}
const validated = expectations !== null ? validateExpectationsFile(expectations) : null;
// A flat narrowed handle TS can track across blocks (validated?.ok narrowing
// does not survive past the if-block that guards it).
const contract = validated !== null && validated.ok ? validated.expectations : null;

// ---- probeable fixtures: built-ins with a query + user captures with a query ----
interface Probeable {
  name: string;
  query: string;
}
const probeable: Probeable[] = [];
if (contract !== null) {
  // Built-ins: the registry index declares the query per fixture.
  try {
    const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8'));
    for (const f of Array.isArray(index.fixtures) ? index.fixtures : []) {
      if (typeof f?.name === 'string' && typeof f?.query === 'string' && f.query.trim().length > 0 && f.query !== '(n/a)' && f.name in contract) {
        probeable.push({ name: f.name, query: f.query });
      }
    }
  } catch {
    // no registry → no built-in probes
  }
  // User captures: _meta.query lives inside the fixture file itself.
  if (existsSync(USER_DIR)) {
    for (const name of readdirSync(USER_DIR)) {
      if (!name.endsWith('.json') || !(name in contract)) continue;
      try {
        const content = JSON.parse(readFileSync(join(USER_DIR, name), 'utf8'));
        const q = content?._meta?.query;
        if (typeof q === 'string' && q.trim().length > 0) probeable.push({ name, query: q });
      } catch {
        // unreadable user fixture — skip honestly
      }
    }
  }
}

if (contract === null || probeable.length === 0) {
  mkdirSync('/tmp/rm-qa', { recursive: true });
  writeFileSync(
    OUT,
    JSON.stringify(
      {
        status: 'skipped',
        probed: 0,
        holds: 0,
        drift: 0,
        errors: 0,
        durationMs: null,
        recordedAt: new Date().toISOString(),
        command: 'bun scripts/live-probe.ts',
        detail: validated !== null && !validated.ok ? `Skipped: expectations file invalid — ${validated.error}` : 'Skipped: no fixture has both a golden contract and a stored query.',
        entries: [],
      },
      null,
      2,
    ),
  );
  console.log('live probe: skipped (no probeable fixtures)');
  process.exit(0);
}

console.log('live golden probe (LIVE shape vs recorded contract — non-gating signal)');
const entries: Entry[] = [];
for (const { name, query } of probeable) {
  const golden = contract[name];
  const live = await liveSearch(query);
  if (!live.ok) {
    entries.push({
      fixture: name,
      query,
      verdict: 'error',
      shape: null,
      httpStatus: live.httpStatus,
      durationMs: live.durationMs,
      failures: [],
      message: `${live.errorKind}: ${live.message}`,
    });
    console.log(`  ERROR     ${name} — ${live.errorKind}: ${live.message}`);
    continue;
  }
  const parsed = parse(live.root);
  const result = evaluateExpectation(parsed, golden);
  const shape = `${result.actual.sectionCount} sections · ${result.actual.trackCount} tracks${
    result.actual.titles.length > 0 ? ` [${result.actual.titles.join(', ')}]` : ''
  }`;
  entries.push({
    fixture: name,
    query,
    verdict: result.ok ? 'holds' : 'drift',
    shape,
    httpStatus: live.httpStatus,
    durationMs: live.durationMs,
    failures: result.failures,
    message: null,
  });
  if (result.ok) {
    console.log(`  holds     ${name} — ${shape} (HTTP ${live.httpStatus} · ${live.durationMs} ms)`);
  } else {
    console.log(`  DRIFT     ${name} — ${shape} (HTTP ${live.httpStatus} · ${live.durationMs} ms)`);
    for (const failure of result.failures) console.log(`              ${failure}`);
  }
}

const summary = summarizeLiveProbe(entries);
const signal: LiveProbeSignal = summary.signal;
const detailLines = entries.map((e) => {
  const shape = e.shape ?? (e.message ?? 'no shape');
  const head = `${e.verdict.toUpperCase().padEnd(6)} ${e.fixture} — ${shape}${e.httpStatus !== null ? ` (HTTP ${e.httpStatus} · ${e.durationMs ?? '?'} ms)` : ''}`;
  return e.failures.length > 0 ? `${head}\n        ${e.failures.join('\n        ')}` : head;
});
const detail =
  signal === 'drift'
    ? `LIVE drift observed on ${summary.drift} of ${summary.probed} probed fixture(s) — investigation signal, NOT a pipeline failure. The stored-fixture golden suite stays authoritative.\n\n${detailLines.join('\n')}`
    : signal === 'holds'
      ? `All ${summary.probed} probed fixture(s) match their recorded contracts against the LIVE API right now.\n\n${detailLines.join('\n')}`
      : signal === 'error'
        ? `LIVE probe could not complete for ${summary.errors} of ${summary.probed} fixture(s) (transport/API error — recorded, non-gating).\n\n${detailLines.join('\n')}`
        : 'Skipped.';

mkdirSync('/tmp/rm-qa', { recursive: true });
writeFileSync(
  OUT,
  JSON.stringify(
    {
      status: signal,
      probed: summary.probed,
      holds: summary.holds,
      drift: summary.drift,
      errors: summary.errors,
      durationMs: Date.now() - startedAll,
      recordedAt: new Date().toISOString(),
      command: 'bun scripts/live-probe.ts',
      detail,
      entries,
    },
    null,
    2,
  ),
);
console.log(`live probe: ${signal} — ${summary.holds} holds / ${summary.drift} drift / ${summary.errors} errors of ${summary.probed} (non-gating; exit 0 by design)`);
process.exit(0);
