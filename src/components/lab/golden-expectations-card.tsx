'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { BadgeCheck, Loader2, RefreshCw, ShieldAlert, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { evaluateExpectation, type ExpectationsFile } from '@/lib/lab/expectations';
import { parse } from '@/lib/lab/yt-search-parser';
import type { FixtureMeta } from '@/lib/lab/types';

interface Row {
  fixture: string;
  ok: boolean;
  shape: string;
  failures: string[];
  note: string | null;
}

/**
 * Golden parse expectations — live view of the drift alarm (WEBLAB-10).
 *
 * Runs the SAME evaluation the run-qa.sh suite does ("bun scripts/check-expectations.ts",
 * recorded on the QA dashboard), but here, in-browser, against the registry right now.
 * A drift row means the parser's output shape no longer matches the contract locked by
 * the Java unit suite — the same red you would see in the recorded QA run.
 */
export function GoldenExpectationsCard({ fixtures }: { fixtures: FixtureMeta[] }) {
  const [expectations, setExpectations] = useState<ExpectationsFile | null>(null);
  const [validateError, setValidateError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noGolden, setNoGolden] = useState<string[]>([]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/lab/expectations', { cache: 'no-store' });
        if (!res.ok) {
          setValidateError(`HTTP ${res.status}`);
          return;
        }
        const data = (await res.json()) as { expectations: ExpectationsFile; validateError: string | null };
        setExpectations(data.expectations);
        setValidateError(data.validateError);
      } catch {
        setValidateError('Could not reach /api/lab/expectations');
      }
    })();
  }, []);

  const run = useCallback(async () => {
    if (expectations === null) return;
    setBusy(true);
    setError(null);
    try {
      const names = Object.keys(expectations);
      const contents = await Promise.all(
        names.map(async (name) => {
          const res = await fetch(`/api/lab/fixtures?name=${encodeURIComponent(name)}`, { cache: 'no-store' });
          if (!res.ok) throw new Error(`Fixture ${name}: HTTP ${res.status}`);
          const data = (await res.json()) as { content: unknown };
          return [name, data.content] as const;
        }),
      );
      const evaluated: Row[] = contents.map(([name, content]) => {
        const result = evaluateExpectation(parse(content), expectations[name]);
        const shape = `${result.actual.sectionCount} sections · ${result.actual.trackCount} tracks${
          result.actual.titles.length > 0 ? ` [${result.actual.titles.join(', ')}]` : ''
        }`;
        return { fixture: name, ok: result.ok, shape, failures: result.failures, note: expectations[name].note ?? null };
      });
      const withGolden = new Set(names);
      setNoGolden(fixtures.filter((f) => f.name.endsWith('.json') && !withGolden.has(f.name)).map((f) => f.name));
      setRows(evaluated);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error evaluating goldens');
      setRows(null);
    } finally {
      setBusy(false);
    }
  }, [expectations, fixtures]);

  const summary = useMemo(() => {
    if (rows === null) return null;
    const passed = rows.filter((r) => r.ok).length;
    return { passed, total: rows.length };
  }, [rows]);

  const hasRows = rows !== null;
  const allOk = hasRows && rows.every((r) => r.ok);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <BadgeCheck className="h-4 w-4 text-primary" aria-hidden="true" />
            Golden parse expectations
          </CardTitle>
          {hasRows && summary !== null && (
            <Badge
              variant="outline"
              className={
                allOk
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
              }
            >
              {allOk ? `${summary.passed}/${summary.total} hold` : `DRIFT: ${summary.passed}/${summary.total} hold`}
            </Badge>
          )}
        </div>
        <CardDescription>
          Per-fixture contracts for the parser&apos;s output shape — the same evaluation the recorded suite
          <span className="font-mono text-[11px]"> golden parse expectations</span> runs in
          <span className="font-mono text-[11px]"> bash scripts/run-qa.sh</span>. A drift here is a red suite on the
          dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {validateError !== null && (
          <p className="flex items-start gap-1.5 text-sm text-amber-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            expectations.json problem: {validateError}
          </p>
        )}
        <div>
          <Button onClick={() => void run()} disabled={busy || expectations === null} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="h-4 w-4" aria-hidden="true" />}
            {hasRows ? 'Re-check goldens' : 'Check goldens now'}
          </Button>
        </div>

        {error !== null && <p className="text-sm text-rose-300" role="alert">{error}</p>}

        {hasRows && (
          <motion.ul
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="space-y-1.5"
            aria-live="polite"
          >
            {rows.map((row) => (
              <li
                key={row.fixture}
                className={`rounded-md border p-2.5 ${
                  row.ok ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-rose-500/40 bg-rose-500/10'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="truncate font-mono text-xs">{row.fixture}</span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="outline" className="border-border font-mono text-[10px] text-muted-foreground">
                      {row.shape}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={
                        row.ok
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                          : 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                      }
                    >
                      {row.ok ? 'golden ✓' : 'DRIFT'}
                    </Badge>
                  </span>
                </div>
                {row.note !== null && <p className="mt-1 text-[11px] text-muted-foreground">{row.note}</p>}
                {row.failures.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5">
                    {row.failures.map((failure) => (
                      <li key={failure} className="flex items-start gap-1 text-[11px] text-rose-300">
                        <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                        {failure}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </motion.ul>
        )}

        {hasRows && noGolden.length > 0 && (
          <p className="text-xs text-muted-foreground">
            No golden yet: <span className="font-mono">{noGolden.join(', ')}</span> — add one to
            <span className="font-mono"> fixtures/ytm/expectations.json</span> or document why the fixture is
            web-harness-only.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
