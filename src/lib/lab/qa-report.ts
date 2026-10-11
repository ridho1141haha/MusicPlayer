/**
 * QA report → Markdown, built client-side from REAL recorded run data only.
 * Pure function (unit-tested). The report deliberately includes an honesty
 * section listing what the pipeline does NOT verify (device/audio etc.).
 */

import type { QaResults } from './types';

const NOT_VERIFIED = [
  'No instrumented tests or real-device verification (this sandbox has no emulator/hardware).',
  'No real audio playback verification — YouTube Music player endpoint returns LOGIN_REQUIRED for unauthenticated clients (verified 2026-10-11); the lab refuses to bypass YouTube protections by policy.',
  'Web Lab browser checks are manual/E2E sessions, not part of this pipeline file.',
];

function pad(value: string | number, width: number): string {
  const s = String(value);
  return s.length >= width ? s : s + ' '.repeat(width - s.length);
}

export function buildQaMarkdownReport(qa: QaResults, generatedAt: string): string {
  const totals = qa.suites.reduce(
    (acc, s) => {
      acc.passed += s.passed ?? 0;
      acc.failed += s.failed ?? 0;
      acc.skipped += s.skipped ?? 0;
      if (s.status === 'fail') acc.failedSuites += 1;
      return acc;
    },
    { passed: 0, failed: 0, skipped: 0, failedSuites: 0 },
  );

  const lines: string[] = [];
  lines.push('# Ridho Music — QA report');
  lines.push('');
  lines.push(`- Run recorded: **${qa.recordedAt}**`);
  lines.push(`- Report generated: **${generatedAt}**`);
  lines.push(`- Result: **${totals.failedSuites === 0 ? 'ALL SUITES GREEN' : `${totals.failedSuites} suite(s) failing`}**`);
  lines.push(`- Assertions: ${totals.passed} passed · ${totals.failed} failed · ${totals.skipped} skipped`);
  lines.push('');

  lines.push('## Suites');
  lines.push('');
  lines.push(
    `${pad('Suite', 44)}${pad('Status', 9)}${pad('Passed', 8)}${pad('Failed', 8)}${pad('Skipped', 9)}${pad('Time', 9)}Command`,
  );
  lines.push(`${'-'.repeat(44)}${'-'.repeat(9)}${'-'.repeat(8)}${'-'.repeat(8)}${'-'.repeat(9)}${'-'.repeat(9)}-------`);
  for (const s of qa.suites) {
    const time = s.durationMs !== null ? `${(s.durationMs / 1000).toFixed(1)}s` : '—';
    lines.push(
      [
        pad(s.name.slice(0, 43), 44),
        pad(s.status.toUpperCase(), 9),
        pad(s.passed ?? '—', 8),
        pad(s.failed ?? '—', 8),
        pad(s.skipped ?? '—', 9),
        pad(time, 9),
        s.command || '(not recorded)',
      ].join(''),
    );
  }
  lines.push('');

  if (qa.apk !== null && qa.apk.exists) {
    lines.push('## APK');
    lines.push('');
    lines.push(`- Path: \`${qa.apk.path}\``);
    lines.push(`- Size: ${qa.apk.sizeBytes ?? '?'} bytes`);
    lines.push(`- sha256: \`${qa.apk.sha256 ?? 'n/a'}\``);
    lines.push(`- Version: ${qa.apk.versionName ?? '?'} (versionCode ${qa.apk.versionCode ?? '?'})`);
    lines.push('');
  }

  if (qa.history !== undefined && qa.history.length > 0) {
    lines.push('## Run history (newest first)');
    lines.push('');
    lines.push(`${pad('Recorded at', 24)}${pad('Passed', 8)}${pad('Failed', 8)}${pad('Skipped', 9)}All green`);
    lines.push(`${'-'.repeat(24)}${'-'.repeat(8)}${'-'.repeat(8)}${'-'.repeat(9)}---------`);
    for (const h of qa.history) {
      lines.push(
        [pad(h.recordedAt, 24), pad(h.passed, 8), pad(h.failed, 8), pad(h.skipped, 9), h.allPassed ? 'yes' : 'NO'].join(''),
      );
    }
    lines.push('');
  }

  // WEBLAB-15 — the non-gating LIVE probe signal, when this run recorded one.
  if (qa.liveProbe !== undefined) {
    const lp = qa.liveProbe;
    lines.push('## Live golden probe (non-gating signal)');
    lines.push('');
    lines.push(
      `- Status: **${lp.status.toUpperCase()}** — ${lp.holds} holds · ${lp.drift} drift · ${lp.errors} errors of ${lp.probed} probed`,
    );
    lines.push('- This is a SIGNAL, not a gate: live drift never fails the pipeline; the stored-fixture suites stay authoritative.');
    if (lp.recordedAt !== null) lines.push(`- Probed at: ${lp.recordedAt}`);
    for (const entry of lp.entries) {
      const shape = entry.shape ?? entry.message ?? 'no shape';
      lines.push(`  - ${entry.verdict.toUpperCase().padEnd(6)} ${entry.fixture} — ${shape}`);
      for (const failure of entry.failures) lines.push(`      ${failure}`);
    }
    lines.push('');
  }

  lines.push('## Honest scope — what this report does NOT claim');
  lines.push('');
  for (const item of NOT_VERIFIED) lines.push(`- ${item}`);
  lines.push('');

  return lines.join('\n');
}

export function qaReportFileName(recordedAt: string): string {
  // recordedAt looks like "2026-10-11 17:27:00Z" → ridho-qa-report-2026-10-11T1727.md
  const stamp = recordedAt.replace(/[: ]/g, (m) => (m === ' ' ? 'T' : ''));
  return `ridho-qa-report-${stamp}.md`;
}
