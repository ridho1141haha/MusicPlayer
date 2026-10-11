'use client';

import { CheckCircle2, FlaskConical, PackageOpen, Rocket, ShieldCheck, type LucideIcon } from 'lucide-react';

import { formatBytes, formatDate, type BuildCheck, type TestResults, type ApkEntry } from '@/lib/ridho';

interface BuildStatsProps {
  debug: ApkEntry;
  release: ApkEntry;
  tests: TestResults;
  buildChecks: BuildCheck[];
}

interface Stat {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
}

export function BuildStats({ debug, release, tests, buildChecks }: BuildStatsProps) {
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
    {
      icon: ShieldCheck,
      label: 'Lint gate',
      value: '0 errors',
      sub: 'abortOnError = true · UnstableApiUsage disabled deliberately',
    },
  ];

  return (
    <div>
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
        {buildChecks.map((check) => (
          <li
            key={check.task}
            className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-0.5 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs"
          >
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#7fd8ce]" aria-hidden="true" />
            <span className="font-mono text-foreground/90">{check.task}</span>
            <span className="text-muted-foreground">{check.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
