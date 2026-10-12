/**
 * Evidence-based build/test status derivation (WEBLAB-16).
 *
 * The Android build card used to present HARDCODED 'SUCCESS' strings that were
 * sourced from a worklog entry written the day before — so after a sandbox
 * reset wiped the Gradle/SDK toolchain, the dashboard still showed a fresh
 * green build while nothing could actually run. This module derives every
 * status from (a) the last RECORDED run-qa execution (data/qa-results.json:
 * real exit codes + timestamps) and (b) the CURRENT toolchain presence on
 * disk, and says exactly which is which. No hardcoded verdicts.
 */

/** Minimal suite shape shared with data/qa-results.json (QaResults). */
export interface EvidenceSuite {
  name: string;
  status: string;
  passed?: number | null;
  failed?: number | null;
  skipped?: number | null;
  exitCode?: number | null;
  detail?: string;
}

export interface ToolchainStatus {
  gradle: boolean;
  androidSdk: boolean;
  jdk: boolean;
  complete: boolean;
}

export type EvidenceCheckStatus = 'pass' | 'fail' | 'unverified' | 'toolchain-unavailable';

export interface EvidenceBuildCheck {
  task: string;
  status: EvidenceCheckStatus;
  detail: string;
  /** recordedAt of the run-qa execution backing this check (null = no record). */
  recordedAt: string | null;
  exitCode: number | null;
}

/** run-qa suite name → gradle task it evidences. */
export const SUITE_TASK_MAP: ReadonlyArray<{ task: string; suiteName: string }> = [
  { task: ':app:testDebugUnitTest', suiteName: 'android unit tests (testDebugUnitTest --rerun)' },
  { task: ':app:lintDebug', suiteName: 'android lint (lintDebug)' },
  { task: ':app:assembleDebug', suiteName: 'android build (assembleDebug)' },
];

export function toolchainStatus(paths: { gradle: boolean; androidSdk: boolean; jdk: boolean }): ToolchainStatus {
  const complete = paths.gradle && paths.androidSdk && paths.jdk;
  return { ...paths, complete };
}

const firstLine = (detail: string | undefined): string => (detail ?? '').split('\n')[0] ?? '';

/**
 * Derive the gradle-task build checks from the recorded run-qa suites.
 *
 * - Toolchain incomplete NOW → every gradle-backed check is marked
 *   'toolchain-unavailable' and carries the recorded evidence it DOES have,
 *   so the UI can say "last verified at X, cannot re-run right now".
 * - assembleRelease is not part of the run-qa pipeline → 'unverified' with a
 *   pointer to the persisted artifact instead of a fabricated SUCCESS.
 */
export function deriveBuildChecks(params: {
  suites: EvidenceSuite[];
  toolchain: ToolchainStatus;
  recordedAt: string | null;
  releaseArtifactNote?: string | null;
}): EvidenceBuildCheck[] {
  const { suites, toolchain, recordedAt } = params;
  const checks: EvidenceBuildCheck[] = [];

  for (const { task, suiteName } of SUITE_TASK_MAP) {
    const suite = suites.find((s) => s.name === suiteName) ?? null;
    if (suite === null) {
      checks.push({
        task,
        status: 'unverified',
        detail: 'No recorded pipeline evidence for this task.',
        recordedAt: null,
        exitCode: null,
      });
      continue;
    }
    const evidence = `${firstLine(suite.detail)} — recorded ${recordedAt ?? 'unknown time'} (exit ${suite.exitCode ?? '?'})`;
    if (!toolchain.complete) {
      checks.push({
        task,
        status: 'toolchain-unavailable',
        detail: `Toolchain not installed right now (sandbox reset) — last evidence: ${evidence}`,
        recordedAt,
        exitCode: suite.exitCode ?? null,
      });
      continue;
    }
    checks.push({
      task,
      status: suite.status === 'pass' ? 'pass' : 'fail',
      detail: evidence,
      recordedAt,
      exitCode: suite.exitCode ?? null,
    });
  }

  const releaseNote = params.releaseArtifactNote ?? null;
  checks.push({
    task: ':app:assembleRelease',
    status: 'unverified',
    detail:
      releaseNote === null
        ? 'Not part of the run-qa pipeline — no recorded execution evidence.'
        : `Not part of the run-qa pipeline — no recorded execution evidence. Persisted artifact: ${releaseNote}`,
    recordedAt: null,
    exitCode: null,
  });

  return checks;
}

/** Compares the git-tracked dist copy against the recorded run's APK sha256. */
export function apkDistMatch(distSha256: string | null, recordedSha256: string | null | undefined): 'match' | 'mismatch' | 'no-record' | 'no-dist' {
  if (distSha256 === null) return 'no-dist';
  if (recordedSha256 === null || recordedSha256 === undefined) return 'no-record';
  return distSha256 === recordedSha256 ? 'match' : 'mismatch';
}

/** The android JUnit suite line for the dashboard's honest "no XMLs" state. */
export function recordedAndroidUnitLine(suites: EvidenceSuite[]): string | null {
  const suite = suites.find((s) => s.name.startsWith('android unit tests'));
  if (suite === undefined) return null;
  const total = (suite.passed ?? 0) + (suite.failed ?? 0) + (suite.skipped ?? 0);
  return `${suite.passed ?? 0}/${total} tests · exit ${suite.exitCode ?? '?'}`;
}

// ------------------------------------------------------------------ WEBLAB-16: totals arithmetic footnote

export interface TotalsBreakdown {
  web: { passed: number; files: number | null } | null;
  android: { passed: number; classes: number | null } | null;
  golden: { passed: number } | null;
  total: number;
}

/**
 * Explains WHERE the QA total comes from (141 + 32 + 8 = 181) so the number
 * can never be misread. The three categories run in separate PROCESSES:
 * - web: vitest assertions (files parsed from the recorded detail line)
 * - android: JUnit tests (classes = detail lines of the form "Class: N tests, …")
 * - golden: expectations evaluated by scripts/check-expectations.ts (1 script)
 * Overlap note: the Android golden-parity tests inside the JVM count
 * deliberately re-evaluate the SAME frozen contracts on the Java parser —
 * parity by design, not a double count of the same execution.
 */
export function totalsBreakdown(suites: EvidenceSuite[]): TotalsBreakdown | null {
  const webSuite = suites.find((s) => s.name.startsWith('web unit tests'));
  const androidSuite = suites.find((s) => s.name.startsWith('android unit tests'));
  const goldenSuite = suites.find((s) => s.name.startsWith('golden parse expectations'));
  if (webSuite === undefined && androidSuite === undefined && goldenSuite === undefined) return null;

  const web =
    webSuite === undefined
      ? null
      : {
          passed: webSuite.passed ?? 0,
          files: Number(/across (\d+) file/.exec(webSuite.detail ?? '')?.[1] ?? NaN) || null,
        };
  const android =
    androidSuite === undefined
      ? null
      : {
          passed: androidSuite.passed ?? 0,
          classes: (androidSuite.detail ?? '').match(/^\s*(?!TOTAL)\S.*?:\s*\d+ tests,/gm)?.length ?? null,
        };
  const golden = goldenSuite === undefined ? null : { passed: goldenSuite.passed ?? 0 };

  const total = (web?.passed ?? 0) + (android?.passed ?? 0) + (golden?.passed ?? 0);
  return { web, android, golden, total };
}

/** One-line human explanation of the totals arithmetic (honest, from recorded data). */
export function totalsBreakdownLine(b: TotalsBreakdown): string {
  const parts: string[] = [];
  if (b.web !== null) parts.push(`${b.web.passed} web assertions${b.web.files !== null ? ` across ${b.web.files} vitest files` : ''}`);
  if (b.android !== null) parts.push(`${b.android.passed} JVM tests${b.android.classes !== null ? ` across ${b.android.classes} JUnit classes` : ''}`);
  if (b.golden !== null) parts.push(`${b.golden.passed} golden expectations (1 script)`);
  const sum = parts.join(' + ');
  const overlap =
    b.android !== null
      ? ' The JVM count includes golden-parity tests that re-check the same frozen contracts on the Java parser (parity by design, not a double count).'
      : '';
  return `${b.total} = ${sum}.${overlap}`;
}
