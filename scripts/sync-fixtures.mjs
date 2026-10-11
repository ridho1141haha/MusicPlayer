#!/usr/bin/env node
/**
 * Syncs shared search fixtures from /fixtures/ytm into the Android unit-test
 * resources so both sides (web TS harness + Java parser) keep testing the
 * SAME captured/synthetic data.
 *
 * Only REAL captures (search_live_*.json) are synced into the Android tree —
 * the Java suite intentionally references exactly those. Synthetic fixtures
 * and the web registry index are web-harness-only.
 *
 * Usage: node scripts/sync-fixtures.mjs [--check]
 *   --check : exit 1 if any file differs (used by run-qa.sh for drift detection)
 */
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'fixtures', 'ytm');
const DEST = join(ROOT, 'android', 'app', 'src', 'test', 'resources', 'ytm');

const SYNC_PATTERN = /^search_live_.*\.json$/;
const check = process.argv.includes('--check');

const names = readdirSync(SRC).filter((n) => SYNC_PATTERN.test(n) && statSync(join(SRC, n)).isFile());
if (names.length === 0) {
  console.error('sync-fixtures: no matching fixtures found in', SRC);
  process.exit(1);
}

let drift = 0;
for (const name of names) {
  const srcPath = join(SRC, name);
  const destPath = join(DEST, name);
  const srcHash = createHash('sha256').update(readFileSync(srcPath)).digest('hex');
  try {
    const destHash = createHash('sha256').update(readFileSync(destPath)).digest('hex');
    if (destHash === srcHash) {
      console.log(`  ok        ${name}`);
      continue;
    }
    if (check) {
      console.error(`  DRIFT     ${name} (android copy differs from shared fixture)`);
      drift++;
      continue;
    }
    copyFileSync(srcPath, destPath);
    console.log(`  updated   ${name}`);
  } catch {
    if (check) {
      console.error(`  MISSING   ${name} (not present in android resources)`);
      drift++;
      continue;
    }
    mkdirSync(DEST, { recursive: true });
    copyFileSync(srcPath, destPath);
    console.log(`  copied    ${name}`);
  }
}

if (check) {
  if (drift > 0) {
    console.error(`sync-fixtures: ${drift} drifted file(s) — run "node scripts/sync-fixtures.mjs" to fix`);
    process.exit(1);
  }
  console.log('sync-fixtures: no drift, fixtures identical on both sides');
}
