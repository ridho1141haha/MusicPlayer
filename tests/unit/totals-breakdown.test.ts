import { describe, expect, it } from 'vitest';

import { totalsBreakdown, totalsBreakdownLine, type EvidenceSuite } from '../../src/lib/lab/build-evidence';

const SUITES: EvidenceSuite[] = [
  { name: 'web lint (eslint)', status: 'pass', exitCode: 0 },
  {
    name: 'web unit tests (vitest)',
    status: 'pass',
    passed: 141,
    failed: 0,
    skipped: 0,
    exitCode: 0,
    detail: '141 assertions passed across 12 file(s) on shared fixtures.',
  },
  {
    name: 'android unit tests (testDebugUnitTest --rerun)',
    status: 'pass',
    passed: 32,
    failed: 0,
    skipped: 0,
    exitCode: 0,
    detail:
      'TrackTest: 4 tests, 0 failures, 0 errors, 0 skipped, 0.015s\nLrcParserTest: 7 tests, 0 failures, 0 errors, 0 skipped, 0.005s\nGoldenExpectationsTest: 3 tests, 0 failures, 0 errors, 0 skipped, 0.083s\nYouTubeMusicSourceTest: 7 tests, 0 failures, 0 errors, 0 skipped, 0.326s\nYtMusicSearchParserTest: 11 tests, 0 failures, 0 errors, 0 skipped, 0.049s\n\nTOTAL: 32 tests, 0 failures, 0 errors, 0 skipped.',
  },
  { name: 'golden parse expectations (fixture ↔ parser contract)', status: 'pass', passed: 8, failed: 0, exitCode: 0 },
];

describe('totalsBreakdown (WEBLAB-16 arithmetic audit)', () => {
  it('verifies 141 + 32 + 8 = 181 from the recorded suites without double counting', () => {
    const b = totalsBreakdown(SUITES);
    expect(b).not.toBeNull();
    expect(b!.web).toEqual({ passed: 141, files: 12 });
    expect(b!.android).toEqual({ passed: 32, classes: 5 });
    expect(b!.golden).toEqual({ passed: 8 });
    expect(b!.total).toBe(181);
  });

  it('the line names every category and flags the intentional golden-parity overlap', () => {
    const line = totalsBreakdownLine(totalsBreakdown(SUITES)!);
    expect(line).toContain('181 = 141 web assertions across 12 vitest files + 32 JVM tests across 5 JUnit classes + 8 golden expectations (1 script).');
    expect(line).toContain('parity by design, not a double count');
    expect(line).toContain('Java parser');
  });

  it('null when no numeric suites are recorded', () => {
    expect(totalsBreakdown([{ name: 'web lint (eslint)', status: 'pass' }])).toBeNull();
  });

  it('tolerates missing categories without inventing numbers', () => {
    const b = totalsBreakdown([SUITES[1]]);
    expect(b!.android).toBeNull();
    expect(b!.golden).toBeNull();
    expect(b!.total).toBe(141);
  });
});
