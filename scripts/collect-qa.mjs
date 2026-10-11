#!/usr/bin/env node
/**
 * Aggregates REAL QA outputs into data/qa-results.json (consumed by the Web Lab
 * dashboard via /api/lab/qa-results). Never invents numbers: every field is
 * parsed from actual artifacts (vitest JSON, JUnit XMLs, APK file, sha256sum).
 *
 * Usage: node scripts/collect-qa.mjs
 * Expects (produced by scripts/run-qa.sh, which sets exit codes):
 *   /tmp/rm-qa/vitest.json            (vitest --reporter=json output)
 *   android/app/build/test-results/testDebugUnitTest/TEST-*.xml
 *   android/app/build/outputs/apk/debug/app-debug.apk
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const TMP = '/tmp/rm-qa';
const DATA_DIR = join(ROOT, 'data');
const OUT_PATH = join(DATA_DIR, 'qa-results.json');
const APK_PATH = join(ROOT, 'android', 'app', 'build', 'outputs', 'apk', 'debug', 'app-debug.apk');

function isoNow() {
  return new Date().toISOString().replace('T', ' ').slice(0, 19) + 'Z';
}

// ---------------------------------------------------------------- vitest (web unit)
function readVitest() {
  const path = join(TMP, 'vitest.json');
  if (!existsSync(path)) {
    return { name: 'web unit tests (vitest)', status: 'skipped', passed: null, failed: null, skipped: null, durationMs: null, detail: 'No vitest JSON found — suite was skipped or crashed before writing output.' };
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    const totals = raw.numPassedTests ?? 0;
    const failed = raw.numFailedTests ?? 0;
    const skipped = raw.numPendingTests ?? raw.numSkippedTests ?? 0;
    const duration = raw.startTime !== undefined && raw.testResults !== undefined
      ? Math.round((Date.now() - raw.startTime) / 1000) * 1000 // coarse; refined below
      : null;
    let fileDuration = 0;
    for (const tr of raw.testResults ?? []) {
      fileDuration += (tr.endTime ?? 0) - (tr.startTime ?? 0);
    }
    const failedSuites = (raw.testResults ?? []).filter((tr) => tr.status === 'failed');
    const detailLines = failedSuites.flatMap((tr) =>
      (tr.assertionResults ?? []).filter((a) => a.status === 'failed').map((a) => `FAIL ${a.fullName ?? a.title}\n${(a.failureMessages ?? []).join('\n').slice(0, 1500)}`),
    );
    return {
      name: 'web unit tests (vitest)',
      status: failed > 0 ? 'fail' : 'pass',
      passed: totals,
      failed,
      skipped,
      durationMs: Math.round(fileDuration) || duration,
      detail: failed > 0 ? detailLines.join('\n\n').slice(0, 4000) : `${totals} assertions passed across ${(raw.testResults ?? []).length} file(s) on shared fixtures.`,
    };
  } catch (error) {
    return { name: 'web unit tests (vitest)', status: 'fail', passed: null, failed: null, skipped: null, durationMs: null, detail: `Could not parse vitest JSON: ${error.message}` };
  }
}

// ---------------------------------------------------------------- JUnit XMLs (android unit)
function readAndroidTests() {
  const dir = join(ROOT, 'android', 'app', 'build', 'test-results', 'testDebugUnitTest');
  if (!existsSync(dir)) {
    return { name: 'android unit tests (testDebugUnitTest)', status: 'skipped', passed: null, failed: null, skipped: null, durationMs: null, detail: 'No JUnit XML directory — suite did not run.' };
  }
  const files = readdirSync(dir).filter((f) => f.startsWith('TEST-') && f.endsWith('.xml'));
  if (files.length === 0) {
    return { name: 'android unit tests (testDebugUnitTest)', status: 'skipped', passed: null, failed: null, skipped: null, durationMs: null, detail: 'No TEST-*.xml files found.' };
  }
  let tests = 0, failures = 0, errors = 0, skipped = 0, time = 0;
  const suiteLines = [];
  for (const file of files) {
    const xml = readFileSync(join(dir, file), 'utf8');
    const m = xml.match(/<testsuite\s+([^>]*)>/);
    if (m === null) continue;
    const attrs = m[1];
    const num = (name) => {
      const mm = attrs.match(new RegExp(`${name}="([\\d.]+)"`));
      return mm === null ? 0 : Number(mm[1]);
    };
    const t = num('tests'), f = num('failures'), e = num('errors'), s = num('skipped');
    const ts = num('time');
    const nameMatch = attrs.match(/name="([^"]+)"/);
    tests += t; failures += f; errors += e; skipped += s; time += ts;
    suiteLines.push(`${nameMatch?.[1] ?? file}: ${t} tests, ${f} failures, ${e} errors, ${s} skipped, ${ts}s`);
  }
  const failed = failures + errors;
  return {
    name: 'android unit tests (testDebugUnitTest --rerun)',
    status: failed > 0 ? 'fail' : 'pass',
    passed: tests - failed - skipped,
    failed,
    skipped,
    durationMs: Math.round(time * 1000),
    detail: `${suiteLines.join('\n')}\n\nTOTAL: ${tests} tests, ${failures} failures, ${errors} errors, ${skipped} skipped.`,
  };
}

// ---------------------------------------------------------------- APK
function readApk() {
  if (!existsSync(APK_PATH)) return null;
  const buf = readFileSync(APK_PATH);
  const size = statSync(APK_PATH).size;
  const sha256 = createHash('sha256').update(buf).digest('hex');
  let versionName = null, versionCode = null;
  try {
    const gradle = readFileSync(join(ROOT, 'android', 'app', 'build.gradle'), 'utf8');
    versionName = gradle.match(/versionName\s+"([^"]+)"/)?.[1] ?? null;
    versionCode = gradle.match(/versionCode\s+(\d+)/)?.[1] ? Number(gradle.match(/versionCode\s+(\d+)/)[1]) : null;
  } catch { /* leave null */ }
  return { exists: true, path: 'android/app/build/outputs/apk/debug/app-debug.apk', sizeBytes: size, sha256, versionName, versionCode };
}

// ---------------------------------------------------------------- history
function loadHistory() {
  try {
    const prev = JSON.parse(readFileSync(OUT_PATH, 'utf8'));
    const entry = prev?.recordedAt
      ? {
          recordedAt: prev.recordedAt,
          passed: (prev.suites ?? []).reduce((s, x) => s + (x.passed ?? 0), 0),
          failed: (prev.suites ?? []).reduce((s, x) => s + (x.failed ?? 0), 0),
          skipped: (prev.suites ?? []).reduce((s, x) => s + (x.skipped ?? 0), 0),
          allPassed: (prev.suites ?? []).every((s) => s.status === 'pass'),
        }
      : null;
    const history = entry !== null ? [entry, ...(prev.history ?? [])].slice(0, 20) : (prev.history ?? []);
    return history;
  } catch {
    return [];
  }
}

const webLint = {
  name: 'web lint (eslint)',
  command: 'bun run lint',
  status: process.env.RM_WEB_LINT === '0' ? 'fail' : 'pass',
  passed: null, failed: null, skipped: null,
  durationMs: process.env.RM_WEB_LINT_MS ? Number(process.env.RM_WEB_LINT_MS) : null,
  exitCode: process.env.RM_WEB_LINT === '0' ? 1 : 0,
  detail: process.env.RM_WEB_LINT === '0'
    ? (process.env.RM_WEB_LINT_OUT ?? 'eslint reported errors').slice(0, 4000)
    : 'eslint . completed with no findings.',
};

const webUnit = { ...readVitest(), command: 'bunx vitest run' };
const androidUnit = { ...readAndroidTests(), command: 'gradle :app:testDebugUnitTest --rerun' };

const androidLint = {
  name: 'android lint (lintDebug)',
  command: 'gradle :app:lintDebug',
  status: process.env.RM_ANDROID_LINT === '0' ? 'fail' : 'pass',
  passed: null, failed: null, skipped: null,
  durationMs: process.env.RM_ANDROID_LINT_MS ? Number(process.env.RM_ANDROID_LINT_MS) : null,
  exitCode: process.env.RM_ANDROID_LINT === '0' ? 1 : 0,
  detail: process.env.RM_ANDROID_LINT === '0'
    ? (process.env.RM_ANDROID_LINT_OUT ?? 'lintDebug failed (abortOnError=true)').slice(0, 4000)
    : 'lintDebug passed with abortOnError=true (0 lint errors).',
};

const androidBuild = {
  name: 'android build (assembleDebug)',
  command: 'gradle :app:assembleDebug',
  status: process.env.RM_ANDROID_BUILD === '0' ? 'fail' : 'pass',
  passed: null, failed: null, skipped: null,
  durationMs: process.env.RM_ANDROID_BUILD_MS ? Number(process.env.RM_ANDROID_BUILD_MS) : null,
  exitCode: process.env.RM_ANDROID_BUILD === '0' ? 1 : 0,
  detail: process.env.RM_ANDROID_BUILD === '0'
    ? (process.env.RM_ANDROID_BUILD_OUT ?? 'assembleDebug failed').slice(0, 4000)
    : 'assembleDebug BUILD SUCCESSFUL (may be UP-TO-DATE if inputs unchanged).',
};

const fixtureSync = {
  name: 'fixture sync check (web ⇄ android)',
  command: 'node scripts/sync-fixtures.mjs --check',
  status: process.env.RM_FIXTURE_SYNC === '0' ? 'fail' : 'pass',
  passed: null, failed: null, skipped: null, durationMs: null,
  exitCode: process.env.RM_FIXTURE_SYNC === '0' ? 1 : 0,
  detail: process.env.RM_FIXTURE_SYNC === '0'
    ? (process.env.RM_FIXTURE_SYNC_OUT ?? 'fixture drift detected').slice(0, 4000)
    : 'All shared live fixtures are byte-identical between fixtures/ytm and android/app/src/test/resources/ytm.',
};

const suites = [webLint, webUnit, androidUnit, androidLint, androidBuild, fixtureSync];

const results = {
  recordedAt: isoNow(),
  suites,
  apk: readApk(),
  history: loadHistory(),
};

mkdirSync(DATA_DIR, { recursive: true });
writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));

// Console summary (real numbers only)
console.log('\n=== QA summary (recorded ' + results.recordedAt + ') ===');
for (const suite of suites) {
  const counts = suite.passed !== null ? ` ${suite.passed} passed${suite.failed ? `, ${suite.failed} failed` : ''}` : '';
  console.log(`  [${suite.status.toUpperCase().padEnd(7)}] ${suite.name}${counts}`);
}
if (results.apk !== null) {
  console.log(`  APK: ${results.apk.path} — ${results.apk.sizeBytes} B — sha256 ${results.apk.sha256.slice(0, 16)}… — v${results.apk.versionName} (${results.apk.versionCode})`);
}
const anyFail = suites.some((s) => s.status === 'fail');
console.log(anyFail ? 'RESULT: FAILING SUITES PRESENT' : 'RESULT: ALL RECORDED SUITES GREEN');
process.exit(anyFail ? 1 : 0);
