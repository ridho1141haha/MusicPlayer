import { describe, expect, it } from 'vitest';

import { buildQaMarkdownReport, qaReportFileName } from '../../src/lib/lab/qa-report';
import type { QaResults } from '../../src/lib/lab/types';

const FIXTURE_QA: QaResults = {
  recordedAt: '2026-10-11 17:27:00Z',
  suites: [
    {
      name: 'web unit tests (vitest)',
      command: 'bunx vitest run',
      status: 'pass',
      passed: 43,
      failed: 0,
      skipped: 0,
      durationMs: 635,
      exitCode: 0,
      detail: '43 assertions passed.',
    },
    {
      name: 'android build (assembleDebug)',
      command: 'gradle :app:assembleDebug',
      status: 'pass',
      passed: null,
      failed: null,
      skipped: null,
      durationMs: 13107,
      exitCode: 0,
      detail: 'OK',
    },
  ],
  apk: {
    exists: true,
    path: 'android/app/build/outputs/apk/debug/app-debug.apk',
    sizeBytes: 11_542_468,
    sha256: '939c938a0657f994',
    versionName: '1.2.0',
    versionCode: 3,
  },
  history: [
    { recordedAt: '2026-10-11 17:27:00Z', passed: 72, failed: 0, skipped: 0, allPassed: true },
    { recordedAt: '2026-10-11 17:23:38Z', passed: 72, failed: 0, skipped: 0, allPassed: true },
  ],
};

describe('buildQaMarkdownReport', () => {
  it('includes real numbers, suites table, APK and history', () => {
    const md = buildQaMarkdownReport(FIXTURE_QA, '2026-10-12T01:30:00Z');
    expect(md).toContain('# Ridho Music — QA report');
    expect(md).toContain('Run recorded: **2026-10-11 17:27:00Z**');
    expect(md).toContain('ALL SUITES GREEN');
    expect(md).toContain('43 passed · 0 failed · 0 skipped');
    expect(md).toContain('bunx vitest run');
    expect(md).toContain('app-debug.apk');
    expect(md).toContain('939c938a0657f994');
    expect(md).toContain('1.2.0 (versionCode 3)');
    expect(md).toContain('2026-10-11 17:23:38Z');
    expect(md).toContain('LOGIN_REQUIRED');
    // Honesty section is always present and never claims device/audio coverage.
    expect(md).toContain('does NOT claim');
    expect(md).toContain('No instrumented tests');
  });

  it('reports failing suites instead of green', () => {
    const failing: QaResults = {
      ...FIXTURE_QA,
      suites: [{ ...FIXTURE_QA.suites[0], status: 'fail', failed: 2 }],
    };
    const md = buildQaMarkdownReport(failing, '2026-10-12T01:30:00Z');
    expect(md).toContain('1 suite(s) failing');
  });

  it('omits APK and history sections gracefully when absent', () => {
    const minimal: QaResults = {
      recordedAt: '2026-10-11 10:00:00Z',
      suites: [{ ...FIXTURE_QA.suites[1] }],
      apk: null,
    };
    const md = buildQaMarkdownReport(minimal, '2026-10-12T01:30:00Z');
    expect(md).not.toContain('## APK');
    expect(md).not.toContain('## Run history');
    expect(md).toContain('## Suites');
  });
});

describe('qaReportFileName', () => {
  it('builds a deterministic filename from the recorded timestamp', () => {
    expect(qaReportFileName('2026-10-11 17:27:00Z')).toBe('ridho-qa-report-2026-10-11T172700Z.md');
  });
});
