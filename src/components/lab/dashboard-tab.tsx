'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Download,
  FileJson,
  FlaskConical,
  History,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  TerminalSquare,
  Wrench,
} from 'lucide-react';

import { StatusBadge } from '@/components/lab/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { FEATURE_CHECKS, type FeatureCheck } from '@/data/features';
import { formatBytes } from '@/lib/lab/format';
import { buildQaMarkdownReport, qaReportFileName } from '@/lib/lab/qa-report';
import type { QaResults } from '@/lib/lab/types';
import type { ProjectPayload } from '@/lib/ridho';

type DashboardData = {
  qa: QaResults | null;
  qaNote: string | null;
  project: ProjectPayload | null;
  projectError: string | null;
};

interface SuiteDetailViewProps {
  title: string;
  detail: string;
  command: string;
}

/** Opens a readable dialog with the REAL recorded output of a suite. */
function SuiteDetail({ title, detail, command }: SuiteDetailViewProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs" aria-label={`Show ${title} output`}>
          <TerminalSquare className="h-3.5 w-3.5" aria-hidden="true" />
          Output
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="font-mono text-xs">{command || '(command not recorded)'}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="rm-scroll max-h-80 rounded-md border border-border bg-background/60 p-3">
          <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/90">
            {detail || '(no detail recorded)'}
          </pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function FeatureRow({ feature }: { feature: FeatureCheck }) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left transition-colors hover:bg-secondary/60 min-h-[44px]"
          aria-label={`Feature ${feature.name}: ${feature.status}. Show evidence.`}
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{feature.name}</span>
            <span className="text-xs text-muted-foreground">{feature.area}</span>
          </span>
          <StatusBadge status={feature.status} />
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {feature.name} <StatusBadge status={feature.status} />
          </DialogTitle>
          <DialogDescription>Area: {feature.area}</DialogDescription>
        </DialogHeader>
        <p className="text-sm leading-relaxed text-foreground/90">{feature.note}</p>
      </DialogContent>
    </Dialog>
  );
}

function SuiteCard({ qa }: { qa: QaResults | null }) {
  if (qa === null || qa.suites.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-primary" aria-hidden="true" />
            Automated QA run
          </CardTitle>
          <CardDescription>
            No QA run recorded yet — numbers below will appear only after a real execution.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-dashed border-border bg-background/40 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
              <ShieldAlert className="h-4 w-4 text-amber-400" aria-hidden="true" />
              This dashboard never invents results. Run:
            </p>
            <pre className="overflow-x-auto rounded bg-background/80 p-2 font-mono text-xs text-foreground/90">
              bash scripts/run-qa.sh
            </pre>
          </div>
        </CardContent>
      </Card>
    );
  }

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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FlaskConical className="h-4 w-4 text-primary" aria-hidden="true" />
          Automated QA run
          {totals.failedSuites === 0 ? (
            <Badge className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300" variant="outline">
              all suites green
            </Badge>
          ) : (
            <Badge className="border-rose-500/40 bg-rose-500/10 text-rose-300" variant="outline">
              {totals.failedSuites} suite(s) failing
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Recorded {qa.recordedAt} · {totals.passed} passed · {totals.failed} failed · {totals.skipped} skipped
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {qa.suites.map((suite) => (
          <div
            key={suite.name}
            className={`flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-3 py-2 transition-colors hover:bg-secondary/30 ${
              suite.status === 'pass'
                ? 'border-l-2 border-l-emerald-500/70'
                : suite.status === 'fail'
                  ? 'border-l-2 border-l-rose-500/70'
                  : 'border-l-2 border-l-zinc-500/50'
            }`
          }>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{suite.name}</p>
              <p className="truncate font-mono text-[11px] text-muted-foreground">{suite.command}</p>
            </div>
            <div className="flex items-center gap-2">
              {suite.status === 'pass' && (
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                  pass
                </Badge>
              )}
              {suite.status === 'fail' && (
                <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-300">
                  fail (exit {suite.exitCode ?? '?'})
                </Badge>
              )}
              {suite.status === 'skipped' && (
                <Badge variant="outline" className="border-zinc-500/40 bg-zinc-500/10 text-zinc-300">
                  skipped
                </Badge>
              )}
              {suite.passed !== null && (
                <span className="text-xs text-muted-foreground">
                  {suite.passed} passed{suite.failed !== null && suite.failed > 0 ? ` · ${suite.failed} failed` : ''}
                  {suite.durationMs !== null ? ` · ${(suite.durationMs / 1000).toFixed(1)}s` : ''}
                </span>
              )}
              <SuiteDetail title={suite.name} detail={suite.detail} command={suite.command} />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

/** Inline SVG trend of total passed assertions across recorded runs (oldest → newest). Dependency-free. */
function TrendSparkline({ history }: { history: NonNullable<QaResults['history']> }) {
  const points = useMemo(() => {
    const runs = [...history].reverse(); // oldest → newest
    const values = runs.map((h) => h.passed);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const w = 220;
    const h = 44;
    const pad = 4;
    const range = Math.max(max - min, 1);
    const step = values.length > 1 ? (w - pad * 2) / (values.length - 1) : 0;
    const coords = values.map((v, i) => {
      const x = pad + i * step;
      const y = h - pad - ((v - min) / range) * (h - pad * 2);
      return { x, y };
    });
    return { coords, w, h, min, max };
  }, [history]);

  const pathD = points.coords.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const last = points.coords[points.coords.length - 1];

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Passed assertions per run (oldest → newest)</p>
        <span className="font-mono text-[10px] text-muted-foreground">
          min {points.min} · max {points.max}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${points.w} ${points.h}`}
        className="h-11 w-full max-w-xs"
        role="img"
        aria-label={`Trend of passed assertions over ${history.length} runs, from ${points.min} to ${points.max}`}
      >
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-emerald-400/80"
        />
        {last !== undefined && <circle cx={last.x} cy={last.y} r="3" className="fill-emerald-400" />}
      </svg>
    </div>
  );
}

export function DashboardTab() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [exporting, setExporting] = useState(false);
  const { toast } = useToast();

  const reload = useCallback(() => setReloadNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [qaRes, projectRes] = await Promise.allSettled([
        fetch('/api/lab/qa-results', { cache: 'no-store' }),
        fetch('/api/project', { cache: 'no-store' }),
      ]);
      if (cancelled) return;

      const next: DashboardData = { qa: null, qaNote: null, project: null, projectError: null };

      if (qaRes.status === 'fulfilled' && qaRes.value.ok) {
        const qa = (await qaRes.value.json()) as QaResults & { note?: string };
        next.qa = qa.recordedAt === null ? null : qa;
        next.qaNote = qa.note ?? null;
      } else {
        next.qaNote = 'QA results endpoint unreachable.';
      }

      if (projectRes.status === 'fulfilled' && projectRes.value.ok) {
        next.project = (await projectRes.value.json()) as ProjectPayload;
      } else {
        next.projectError = 'Could not load /api/project (Android build stats).';
      }

      setData(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

  const loading = data === null;

  const exportReport = useCallback(() => {
    if (data?.qa === null || data?.qa === undefined) {
      toast({ title: 'Nothing to export yet', description: 'Run `bash scripts/run-qa.sh` first — this lab never invents data.' });
      return;
    }
    setExporting(true);
    try {
      const generatedAt = new Date().toISOString();
      const markdown = buildQaMarkdownReport(data.qa, generatedAt);
      const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = qaReportFileName(data.qa.recordedAt);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({ title: 'Report downloaded ✓', description: `${anchor.download} — generated from the recorded run only.` });
    } catch (error) {
      toast({ title: 'Export failed', description: error instanceof Error ? error.message : 'Unknown error', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }, [data, toast]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true" aria-label="Loading dashboard">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const qa = data?.qa ?? null;
  const project = data?.project ?? null;
  const apk = project?.apks.debug ?? null;
  const tests = project?.tests ?? null;

  return (
    <div className="space-y-6">
      {/* Top row: QA suites + Android build facts */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <SuiteCard qa={qa} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              Android build (live from android/)
            </CardTitle>
            <CardDescription>Parsed from real APK files and JUnit XMLs on disk — no hardcoded numbers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {project === null ? (
              <p className="text-sm text-rose-300">{data?.projectError ?? 'Project data unavailable.'}</p>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border bg-background/40 p-3">
                    <p className="text-xs text-muted-foreground">Debug APK</p>
                    <p className="mt-1 text-sm font-semibold">
                      {apk !== null && apk.available
                        ? `${formatBytes(apk.sizeBytes)} · ${new Date(apk.mtime).toLocaleString()}`
                        : 'not built yet'}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-background/40 p-3">
                    <p className="text-xs text-muted-foreground">Unit tests (JUnit XML)</p>
                    <p className="mt-1 text-sm font-semibold">
                      {tests !== null && tests.available
                        ? `${tests.totals.passed}/${tests.totals.tests} passed`
                        : 'no XMLs found'}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {(project.buildChecks ?? []).map((check) => (
                    <Badge key={check.task} variant="outline" className="border-border bg-background/40 text-xs">
                      {check.task}: {check.status}
                    </Badge>
                  ))}
                </div>
                {qa?.apk !== null && qa?.apk !== undefined && (
                  <div className="rounded-md border border-border bg-background/40 p-3 text-xs text-muted-foreground">
                    <p className="mb-1 flex items-center gap-1.5 font-medium text-foreground/80">
                      <FileJson className="h-3.5 w-3.5" aria-hidden="true" />
                      Last recorded run APK
                    </p>
                    <p className="break-all font-mono">{qa.apk.path}</p>
                    <p>
                      {formatBytes(qa.apk.sizeBytes)} · sha256{' '}
                      <span className="break-all font-mono">{qa.apk.sha256 ?? 'n/a'}</span>
                    </p>
                    <p>
                      version {qa.apk.versionName ?? '?'} (versionCode {qa.apk.versionCode ?? '?'})
                    </p>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Feature checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
            Feature checklist
          </CardTitle>
          <CardDescription>
            Status per feature with real evidence — tap a row for the supporting note. "needs device" means this
            sandbox has no emulator or hardware.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-2 sm:p-3">
          <div className="grid grid-cols-1 gap-1 md:grid-cols-2">
            {FEATURE_CHECKS.map((feature) => (
              <FeatureRow key={feature.id} feature={feature} />
            ))}
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4 text-primary" aria-hidden="true" />
            Run history
          </CardTitle>
          <CardDescription>Newest first, recorded by scripts/run-qa.sh on every execution.</CardDescription>
        </CardHeader>
        <CardContent>
          {qa?.history === undefined || qa.history.length === 0 ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Activity className="h-4 w-4" aria-hidden="true" />
              No history yet — the first run will start the log.
            </p>
          ) : (
            <>
              <TrendSparkline history={qa.history} />
              <Separator className="my-3" />
              <div className="hidden grid-cols-4 gap-2 px-3 pb-1 text-xs text-muted-foreground sm:grid">
                <span>When</span>
                <span className="text-right">Passed</span>
                <span className="text-right">Failed</span>
                <span className="text-right">Skipped</span>
              </div>
              <Separator className="mb-2 sm:block" />
              <ScrollArea className="rm-scroll max-h-56">
                <div className="space-y-1">
                  {qa.history.map((entry) => {
                    const total = entry.passed + entry.failed + entry.skipped;
                    const passPct = total > 0 ? Math.round((entry.passed / total) * 100) : 0;
                    return (
                      <div
                        key={entry.recordedAt}
                        className="grid grid-cols-2 items-center gap-2 rounded-md px-3 py-2 text-sm hover:bg-secondary/40 sm:grid-cols-5"
                      >
                        <span className="text-foreground/90">{entry.recordedAt}</span>
                        <span className="text-right text-emerald-300 sm:text-right">{entry.passed} passed</span>
                        <span className={`text-right ${entry.failed > 0 ? 'text-rose-300' : 'text-muted-foreground'}`}>
                          {entry.failed} failed
                        </span>
                        <span className="text-right text-muted-foreground">{entry.skipped} skipped</span>
                        <span
                          className="hidden h-1.5 w-full overflow-hidden rounded-full bg-rose-500/50 sm:block"
                          role="img"
                          aria-label={`${passPct}% of assertions passed in run ${entry.recordedAt}`}
                        >
                          <span className="block h-full rounded-full bg-emerald-500/80" style={{ width: `${passPct}%` }} />
                        </span>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" size="sm" onClick={exportReport} disabled={exporting || qa === null} className="gap-2">
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Export report (Markdown)
        </Button>
        <Button variant="outline" size="sm" onClick={reload} className="gap-2">
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Refresh data
        </Button>
      </div>
    </div>
  );
}
