/**
 * Golden parse expectations — drift alarm suite (WEBLAB-10).
 *
 * Runs the REAL TS harness parser against every fixture that has a golden
 * expectation and fails (exit 1) on ANY mismatch. Wired into scripts/run-qa.sh
 * as the "golden parse expectations" suite; a red here means the parser's
 * output shape drifted from the contract locked by the Java unit suite.
 *
 * Writes /tmp/rm-qa/golden.json (a real machine-readable summary) for
 * scripts/collect-qa.mjs — the dashboard only shows what this actually checked.
 *
 * Usage: bun scripts/check-expectations.ts
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { evaluateExpectation, validateExpectationsFile } from '../src/lib/lab/expectations';
import { parse } from '../src/lib/lab/yt-search-parser';

const ROOT = process.cwd();
const DIR = join(ROOT, 'fixtures', 'ytm');
const OUT = '/tmp/rm-qa/golden.json';

interface Entry {
  fixture: string;
  ok: boolean;
  failures: string[];
  actual: { sectionCount: number; trackCount: number; titles: string[] };
}

let expectations: Record<string, unknown>;
try {
  expectations = JSON.parse(readFileSync(join(DIR, 'expectations.json'), 'utf8'));
} catch (error) {
  console.error(`check-expectations: could not read expectations.json — ${error instanceof Error ? error.message : 'unknown'}`);
  process.exit(1);
}

const validated = validateExpectationsFile(expectations);
if (!validated.ok) {
  console.error(`check-expectations: invalid expectations file — ${validated.error}`);
  process.exit(1);
}

const entries: Entry[] = [];
let missing = 0;

for (const [name, expectation] of Object.entries(validated.expectations)) {
  const path = join(DIR, name);
  if (!existsSync(path)) {
    entries.push({ fixture: name, ok: false, failures: ['fixture file missing on disk'], actual: { sectionCount: 0, trackCount: 0, titles: [] } });
    missing += 1;
    continue;
  }
  let content: unknown;
  try {
    content = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    entries.push({ fixture: name, ok: false, failures: [`fixture is not valid JSON: ${error instanceof Error ? error.message : 'unknown'}`], actual: { sectionCount: 0, trackCount: 0, titles: [] } });
    missing += 1;
    continue;
  }
  const parsed = parse(content);
  const result = evaluateExpectation(parsed, expectation);
  entries.push({
    fixture: name,
    ok: result.ok,
    failures: result.failures,
    actual: { sectionCount: result.actual.sectionCount, trackCount: result.actual.trackCount, titles: result.actual.titles },
  });
}

// Fixtures WITHOUT an expectation are reported (visibility, not failure): a new
// fixture should either get a golden or be explicitly web-harness-only.
const expectedNames = new Set(Object.keys(validated.expectations));
const unexpectated = readdirSync(DIR)
  .filter((n) => n.endsWith('.json') && n !== 'index.json' && n !== 'expectations.json' && !expectedNames.has(n));

const passed = entries.filter((e) => e.ok).length;
const failed = entries.length - passed;

console.log('golden parse expectations (fixture ↔ parser contract)');
for (const entry of entries) {
  const shape = `${entry.actual.sectionCount} sections · ${entry.actual.trackCount} tracks${
    entry.actual.titles.length > 0 ? ` [${entry.actual.titles.join(', ')}]` : ''
  }`;
  if (entry.ok) {
    console.log(`  ok        ${entry.fixture} — ${shape}`);
  } else {
    console.log(`  DRIFT     ${entry.fixture} — ${shape}`);
    for (const failure of entry.failures) console.log(`              ${failure}`);
  }
}
for (const name of unexpectated) console.log(`  (no golden) ${name} — fixture has no expectation; add one or document why`);

mkdirSync('/tmp/rm-qa', { recursive: true });
writeFileSync(OUT, JSON.stringify({ checked: entries.length, passed, failed, unexpectated: unexpectated.length, entries }, null, 2));

if (failed > 0 || missing > 0) {
  console.error(`check-expectations: ${failed} drift / ${missing} unreadable of ${entries.length}`);
  process.exit(1);
}
console.log(`check-expectations: ${passed}/${entries.length} golden expectations hold${unexpectated.length > 0 ? ` (${unexpectated.length} fixture(s) without golden)` : ''}`);
