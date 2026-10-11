'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FlaskConical, GitBranch, Loader2, Radar, ShieldAlert, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { findSupersedingFixture } from '@/lib/lab/fixture-lineage';
import { evaluateExpectation, liveProbeVerdict, type ExpectationsFile, type LiveProbeVerdict } from '@/lib/lab/expectations';
import type { FixtureMeta } from '@/lib/lab/types';
import type { SearchSection } from '@/lib/lab/types';

type ProbeState =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'done'; verdict: LiveProbeVerdict; failures: string[]; shape: string; durationMs: number | null; httpStatus: number | null; at: number }
  | { phase: 'error'; message: string };

const VERDICT_BADGE: Record<LiveProbeVerdict, { label: string; className: string }> = {
  holds: { label: 'live shape holds ✓', className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' },
  drift: { label: 'LIVE DRIFT', className: 'border-amber-500/40 bg-amber-500/10 text-amber-300' },
  'no-golden': { label: 'no golden contract', className: 'border-border text-muted-foreground' },
  'no-query': { label: 'no stored query', className: 'border-border text-muted-foreground' },
};

/**
 * Live golden probe (WEBLAB-14) — evaluates a LIVE search response against a
 * fixture's recorded golden contract. EXPERIMENTAL: live shapes change over
 * time, so drift here is an investigation signal, never an automatic verdict.
 * The stored-fixture golden suite (run-qa.sh) stays the authoritative alarm.
 */
export function LiveGoldenProbeCard({ fixtures }: { fixtures: FixtureMeta[] }) {
  const [expectations, setExpectations] = useState<ExpectationsFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [probe, setProbe] = useState<ProbeState>({ phase: 'idle' });

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/lab/expectations', { cache: 'no-store' });
        if (!res.ok) {
          setLoadError(`HTTP ${res.status}`);
          return;
        }
        const data = (await res.json()) as { expectations: ExpectationsFile };
        setExpectations(data.expectations);
      } catch {
        setLoadError('Could not reach /api/lab/expectations');
      }
    })();
  }, []);

  // Probed-able fixtures: a golden contract AND a stored query to re-run live.
  const probeable = useMemo(
    () =>
      fixtures.filter((f) => f.name.endsWith('.json') && expectations !== null && f.name in expectations && f.query !== null && f.query.trim().length > 0),
    [fixtures, expectations],
  );

  // Derived default selection (no setState-in-effect): the first probeable
  // fixture wins until the user explicitly picks another one.
  const selectedMeta = useMemo(() => {
    const name = selected ?? probeable[0]?.name ?? null;
    return probeable.find((f) => f.name === name) ?? null;
  }, [probeable, selected]);

  const runProbe = useCallback(async () => {
    if (selectedMeta === null || expectations === null) return;
    const golden = expectations[selectedMeta.name];
    if (golden === undefined) return;
    setProbe({ phase: 'running' });
    try {
      const res = await fetch('/api/lab/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: selectedMeta.query }),
      });
      const data = (await res.json()) as
        | { ok: true; httpStatus: number; durationMs: number | null; sections: SearchSection[] }
        | { ok: false; httpStatus?: number; message: string };
      if (!data.ok) {
        setProbe({ phase: 'error', message: `Live search failed: ${'message' in data ? data.message : `HTTP ${res.status}`}` });
        return;
      }
      const result = evaluateExpectation(data.sections, golden);
      const shape = `${result.actual.sectionCount} sections · ${result.actual.trackCount} tracks${
        result.actual.titles.length > 0 ? ` [${result.actual.titles.join(', ')}]` : ''
      }`;
      setProbe({
        phase: 'done',
        verdict: liveProbeVerdict(true, selectedMeta.query, result),
        failures: result.failures,
        shape,
        durationMs: data.durationMs,
        httpStatus: data.httpStatus,
        at: Date.now(),
      });
    } catch (error) {
      setProbe({ phase: 'error', message: error instanceof Error ? error.message : 'Unknown probe error' });
    }
  }, [selectedMeta, expectations]);

  const done = probe.phase === 'done' ? probe : null;

  // WEBLAB-15 lineage: when the selected fixture has been deliberately replaced
  // by a refreshed capture, say so and offer one-click switch to the successor.
  const successor = useMemo(
    () => (selectedMeta !== null ? findSupersedingFixture(fixtures, selectedMeta.name) : null),
    [fixtures, selectedMeta],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Radar className="h-4 w-4 text-amber-400" aria-hidden="true" />
          Live golden probe
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-300">
            experimental
          </Badge>
        </CardTitle>
        <CardDescription>
          Re-runs a fixture&apos;s stored query against the LIVE API and evaluates the shape against its recorded golden
          contract. Live responses change over time — drift here is a signal to investigate, not automatically a parser
          bug. The stored-fixture suite in <span className="font-mono text-[11px]">run-qa.sh</span> stays authoritative.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {loadError !== null && (
          <p className="flex items-start gap-1.5 text-sm text-amber-300">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {loadError}
          </p>
        )}

        {probeable.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No probeable fixtures yet — a fixture needs BOTH a golden contract and a stored query (captured via the
            Search Playground) to be probed live.
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={selectedMeta?.name ?? undefined} onValueChange={(v) => { setSelected(v); setProbe({ phase: 'idle' }); }}>
                <SelectTrigger className="w-full font-mono text-xs sm:w-80" aria-label="Fixture to probe live">
                  <SelectValue placeholder="Pick a fixture with a golden contract" />
                </SelectTrigger>
                <SelectContent>
                  {probeable.map((f) => (
                    <SelectItem key={f.name} value={f.name} className="font-mono text-xs">
                      {f.name} · “{f.query}”
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={() => void runProbe()} disabled={probe.phase === 'running' || selectedMeta === null} className="gap-2">
                {probe.phase === 'running' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FlaskConical className="h-4 w-4" aria-hidden="true" />}
                Probe live shape
              </Button>
            </div>

            {selectedMeta === null ? (
              <p className="text-xs text-muted-foreground">Pick a fixture above to see its contract details.</p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Contract: <span className="font-mono">{selectedMeta.name}</span> · query{' '}
                <span className="font-mono">“{selectedMeta.query}”</span> · captured {selectedMeta.capturedAt ?? 'unknown date'}
              </p>
            )}

            {successor !== null && (
              <div className="rm-lineage-hint flex flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2">
                <GitBranch className="h-3.5 w-3.5 shrink-0 text-amber-300" aria-hidden="true" />
                <p className="min-w-0 flex-1 text-xs text-amber-200/90">
                  This capture was deliberately replaced (contract refresh) by{' '}
                  <span className="font-mono">{successor.name}</span> — this one is kept frozen as drift history.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 gap-1 border-amber-500/40 text-[11px] text-amber-200 hover:bg-amber-500/10"
                  onClick={() => {
                    setSelected(successor.name);
                    setProbe({ phase: 'idle' });
                  }}
                >
                  Probe the successor
                </Button>
              </div>
            )}

            {probe.phase === 'error' && (
              <p className="text-sm text-rose-300" role="alert">{probe.message}</p>
            )}

            {done !== null && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: 'easeOut' }}
                className={`rounded-md border p-3 ${
                  done.verdict === 'holds' ? 'border-emerald-500/25 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'
                }`}
                aria-live="polite"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge variant="outline" className={`font-mono text-[10px] ${VERDICT_BADGE[done.verdict].className}`}>
                    {VERDICT_BADGE[done.verdict].label}
                  </Badge>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="outline" className="border-border font-mono text-[10px] text-muted-foreground">
                      {done.shape}
                    </Badge>
                    {done.httpStatus !== null && (
                      <Badge variant="outline" className="border-border font-mono text-[10px] text-muted-foreground">
                        live · HTTP {done.httpStatus}
                        {done.durationMs !== null ? ` · ${done.durationMs} ms` : ''}
                      </Badge>
                    )}
                  </span>
                </div>
                {done.failures.length > 0 && (
                  <ul className="mt-2 space-y-0.5">
                    {done.failures.map((failure) => (
                      <li key={failure} className="flex items-start gap-1 text-[11px] text-amber-300">
                        <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                        {failure}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Probed {new Date(done.at).toLocaleTimeString()} — a single live observation. Compare with the stored
                  fixture row above before drawing conclusions.
                </p>
              </motion.div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
