import { describe, expect, it } from 'vitest';

import {
  apkDistMatch,
  deriveBuildChecks,
  recordedAndroidUnitLine,
  toolchainStatus,
  type EvidenceSuite,
} from '../../src/lib/lab/build-evidence';

const RECORD = '2026-10-11 19:32:49Z';

const GREEN_SUITES: EvidenceSuite[] = [
  { name: 'android unit tests (testDebugUnitTest --rerun)', status: 'pass', passed: 32, failed: 0, exitCode: 0, detail: 'TOTAL: 32 tests, 0 failures, 0 errors, 0 skipped.' },
  { name: 'android lint (lintDebug)', status: 'pass', exitCode: 0, detail: 'lintDebug passed with abortOnError=true (0 lint errors).' },
  { name: 'android build (assembleDebug)', status: 'pass', exitCode: 0, detail: 'assembleDebug BUILD SUCCESSFUL (may be UP-TO-DATE if inputs unchanged).' },
];

const FULL_TOOLCHAIN = toolchainStatus({ gradle: true, androidSdk: true, jdk: true });
const BROKEN_TOOLCHAIN = toolchainStatus({ gradle: false, androidSdk: false, jdk: true });

describe('toolchainStatus', () => {
  it('complete only when all three toolchain paths exist', () => {
    expect(toolchainStatus({ gradle: true, androidSdk: true, jdk: true }).complete).toBe(true);
    expect(toolchainStatus({ gradle: false, androidSdk: true, jdk: true }).complete).toBe(false);
    expect(toolchainStatus({ gradle: true, androidSdk: false, jdk: true }).complete).toBe(false);
    expect(toolchainStatus({ gradle: true, androidSdk: true, jdk: false }).complete).toBe(false);
  });
});

describe('deriveBuildChecks', () => {
  it('derives pass checks from the recorded suites when the toolchain is present', () => {
    const checks = deriveBuildChecks({ suites: GREEN_SUITES, toolchain: FULL_TOOLCHAIN, recordedAt: RECORD });
    expect(checks.map((c) => c.task)).toEqual([':app:testDebugUnitTest', ':app:lintDebug', ':app:assembleDebug', ':app:assembleRelease']);
    expect(checks[0]).toMatchObject({ status: 'pass', recordedAt: RECORD, exitCode: 0 });
    expect(checks[0].detail).toContain('recorded 2026-10-11 19:32:49Z');
    expect(checks[1].status).toBe('pass');
    expect(checks[2].status).toBe('pass');
  });

  it('marks gradle-backed checks toolchain-unavailable but KEEPS the recorded evidence', () => {
    const checks = deriveBuildChecks({ suites: GREEN_SUITES, toolchain: BROKEN_TOOLCHAIN, recordedAt: RECORD });
    for (const check of checks.slice(0, 3)) {
      expect(check.status).toBe('toolchain-unavailable');
      expect(check.recordedAt).toBe(RECORD);
      expect(check.exitCode).toBe(0);
      expect(check.detail).toContain('Toolchain not installed right now (sandbox reset)');
    }
    expect(checks[0].detail).toContain('32 tests');
  });

  it('never fabricates assembleRelease evidence — always unverified', () => {
    const checks = deriveBuildChecks({ suites: GREEN_SUITES, toolchain: FULL_TOOLCHAIN, recordedAt: RECORD, releaseArtifactNote: 'android/dist/app-release-unsigned.apk · 3,079,882 B' });
    const release = checks.find((c) => c.task === ':app:assembleRelease');
    expect(release?.status).toBe('unverified');
    expect(release?.recordedAt).toBeNull();
    expect(release?.detail).toContain('Not part of the run-qa pipeline');
    expect(release?.detail).toContain('android/dist/app-release-unsigned.apk');
  });

  it('marks unverified (not pass) when a suite has no recorded evidence', () => {
    const checks = deriveBuildChecks({ suites: [GREEN_SUITES[0]], toolchain: FULL_TOOLCHAIN, recordedAt: RECORD });
    expect(checks.find((c) => c.task === ':app:lintDebug')?.status).toBe('unverified');
  });

  it('propagates a recorded failure as fail', () => {
    const failing: EvidenceSuite[] = [{ ...GREEN_SUITES[1], status: 'fail', exitCode: 1, detail: 'lint found 2 errors.' }];
    const checks = deriveBuildChecks({ suites: failing, toolchain: FULL_TOOLCHAIN, recordedAt: RECORD });
    expect(checks.find((c) => c.task === ':app:lintDebug')?.status).toBe('fail');
  });
});

describe('apkDistMatch', () => {
  const SHA = '939c938a0657f99487caebb23ded1e3da41bb4064b54650d4e6549c43f2e845b';
  it('match when dist copy sha equals the recorded build sha', () => {
    expect(apkDistMatch(SHA, SHA)).toBe('match');
  });
  it('mismatch when bytes differ', () => {
    expect(apkDistMatch('aaa', SHA)).toBe('mismatch');
  });
  it('honest no-record / no-dist states', () => {
    expect(apkDistMatch(SHA, null)).toBe('no-record');
    expect(apkDistMatch(null, SHA)).toBe('no-dist');
    expect(apkDistMatch(null, null)).toBe('no-dist');
  });
});

describe('recordedAndroidUnitLine', () => {
  it('formats the recorded JVM run honestly with exit code', () => {
    expect(recordedAndroidUnitLine(GREEN_SUITES)).toBe('32/32 tests · exit 0');
  });
  it('null when no android unit suite was recorded', () => {
    expect(recordedAndroidUnitLine([])).toBeNull();
    expect(recordedAndroidUnitLine([{ name: 'web unit tests (vitest)', status: 'pass', passed: 141, failed: 0 }])).toBeNull();
  });
});
