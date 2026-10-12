'use client';

import { AlertTriangle, CheckCircle2, CircleDashed, FlaskConical, PackageOpen, Rocket, ShieldCheck, XCircle, type LucideIcon } from 'lucide-react';

import { formatBytes, formatDate, type BuildCheck, type TestResults, type ApkEntry } from '@/lib/ridho';

interface BuildStatsProps {
  debug: ApkEntry;
  release: ApkEntry;
  tests: TestResults;
  buildChecks: BuildCheck[];
  /** recordedAt of the last recorded run-qa execution (shown on evidence-backed stats). */
  qaRecordedAt?: string | null;
  /** Whether the Gradle/SDK toolchain is installed right now. */
  toolchainComplete?: boolean;
}

interface Stat {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
}

/** Evidence-based badge styling — green only for recorded PASS, never by default. */
function checkVisual(status: BuildCheck['status']): { icon: LucideIcon; iconColor: string; label: string } {
  switch (status) {
    case 'pass':
      return { icon: CheckCircle2, iconColor: 'text-[#7fd8ce]', label: 'pass (recorded)' };
    case 'fail':
      return { icon: XCircle, iconColor: 'text-rose-400', label: 'FAIL (recorded)' };
    case 'unverified':
      return { icon: AlertTriangle, iconColor: 'text-amber-400', label: 'unverified' };
    case 'toolchain-unavailable':
      return { icon: CircleDashed, iconColor: 'text-amber-400', label: 'toolchain down — citing recorded evidence' };
  }
}

export function BuildStats({ debug, release, tests, buildChecks, qaRecordedAt, toolchainComplete = true }: BuildStatsProps) {
  const lintCheck = buildChecks.find((c) => c.task === ':app:lintDebug') ?? null;
  const lintStat: Stat = {
    icon: ShieldCheck,
    label: 'Lint gate',
    value:
      lintCheck === null
        ? '—'
        : lintCheck.status === 'pass'
          ? '0 errors (recorded)'
          : lintCheck.status === 'fail'
            ? 'FAILED'
            : lintCheck.status === 'toolchain-unavailable'
              ? 'toolchain down'
              : 'unverified',
    sub:
      lintCheck === null
        ? 'No lint evidence recorded.'
        : `${lintCheck.detail} · UnstableApiUsage disabled deliberately`,
  };

  const stats: Stat[] = [
    {
      icon: PackageOpen,
      label: 'Debug APK',
      value: debug.available ? formatBytes(debug.sizeBytes) : '—',
      sub: debug.available
        ? `${debug.name} · built ${formatDate(debug.mtime)}`
        : debug.message,
    },
    {
      icon: Rocket,
      label: 'Release APK (R8, unsigned)',
      value: release.available ? formatBytes(release.sizeBytes) : '—',
      sub: release.available
        ? `${release.name} · built ${formatDate(release.mtime)}`
        : release.message,
    },
    {
      icon: FlaskConical,
      label: 'Unit tests (JVM)',
      value: tests.available ? `${tests.totals.passed}/${tests.totals.tests}` : '—',
      sub: tests.available
        ? `${tests.suites.length} suites · ${tests.totals.failures} failures · ${tests.totals.errors} errors`
        : (tests.message ?? 'results not found'),
    },
    lintStat,
  ];

  return (
    <div>
      {!toolchainComplete && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200" role="status">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <p>
            The Android toolchain (Gradle + SDK) is not installed right now — ephemeral sandbox paths were wiped.
            Gradle-backed suites cannot re-run until re-bootstrap; the statuses below cite the <strong>last recorded run</strong>
            {qaRecordedAt ? ` (${qaRecordedAt})` : ''}, not fresh executions.
          </p>
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="flex flex-col justify-between rounded-xl border bg-card p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-muted-foreground">{stat.label}</p>
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-primary/25 bg-primary/10"
                aria-hidden="true"
              >
                <stat.icon className="h-4.5 w-4.5 text-[#7fd8ce]" />
              </span>
            </div>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-foreground">
              {stat.value}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground/85">{stat.sub}</p>
          </div>
        ))}
      </div>

      <ul className="mt-4 flex flex-wrap gap-2" aria-label="Gradle build checks">
        {buildChecks.map((check) => {
          const visual = checkVisual(check.status);
          return (
            <li
              key={check.task}
              title={check.detail}
              className="flex min-h-11 max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-full border border-border bg-background/40 px-4 py-1.5 text-xs"
            >
              <visual.icon className={`h-3.5 w-3.5 shrink-0 ${visual.iconColor}`} aria-hidden="true" />
              <span className="font-mono text-foreground/90">{check.task}</span>
              <span className="sr-only">— {visual.label}</span>
              <span className="text-muted-foreground">{check.detail}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
