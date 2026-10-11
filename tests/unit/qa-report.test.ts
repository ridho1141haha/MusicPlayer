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

  it('renders the non-gating live probe section when recorded (WEBLAB-15)', () => {
    const withProbe: QaResults = {
      ...FIXTURE_QA,
      liveProbe: {
        status: 'drift',
        probed: 2,
        holds: 1,
        drift: 1,
        errors: 0,
        durationMs: 1400,
        recordedAt: '2026-10-11T19:32:49.680Z',
        command: 'bun scripts/live-probe.ts',
        detail: 'LIVE drift observed on 1 of 2 probed fixture(s).',
        entries: [
          {
            fixture: 'a.json',
            query: 'q',
            verdict: 'holds',
            shape: '1 sections · 1 tracks [Videos]',
            httpStatus: 200,
            durationMs: 300,
            failures: [],
            message: null,
          },
          {
            fixture: 'b.json',
            query: 'q2',
            verdict: 'drift',
            shape: '2 sections · 3 tracks',
            httpStatus: 200,
            durationMs: 310,
            failures: ['trackCount: expected 2, got 3'],
            message: null,
          },
        ],
      },
    };
    const md = buildQaMarkdownReport(withProbe, '2026-10-12T01:30:00Z');
    expect(md).toContain('## Live golden probe (non-gating signal)');
    expect(md).toContain('**DRIFT** — 1 holds · 1 drift · 0 errors of 2 probed');
    expect(md).toContain('SIGNAL, not a gate');
    expect(md).toContain('DRIFT  b.json');
    expect(md).toContain('trackCount: expected 2, got 3');
  });

  it('omits the live probe section when the run recorded none (pre-WEBLAB-15 files)', () => {
    const md = buildQaMarkdownReport(FIXTURE_QA, '2026-10-12T01:30:00Z');
    expect(md).not.toContain('## Live golden probe');
  });
});

describe('qaReportFileName', () => {
  it('builds a deterministic filename from the recorded timestamp', () => {
    expect(qaReportFileName('2026-10-11 17:27:00Z')).toBe('ridho-qa-report-2026-10-11T172700Z.md');
  });
});
