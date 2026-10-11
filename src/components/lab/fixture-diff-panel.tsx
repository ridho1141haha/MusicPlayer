'use client';

import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownUp,
  Database,
  GitCompareArrows,
  Loader2,
  MinusCircle,
  PencilLine,
  PlusCircle,
  Radio,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { diffFixtureParses, type FixtureDiff } from '@/lib/lab/fixture-diff';
import { parseResultFromLivePayload } from '@/lib/lab/live-diff';
import type { FixtureMeta } from '@/lib/lab/types';
import { parseWithTrace } from '@/lib/lab/yt-search-parser';

/**
 * A/B diff (WEB-LAB-8/9). Side A is always a stored fixture (the "before"),
 * side B is either another fixture (offline, deterministic) or a LIVE InnerTube
 * search — which makes layout drift inspectable the moment it happens.
 */
type SideBKind = 'fixture' | 'live';

export function FixtureDiffPanel({ fixtures }: { fixtures: FixtureMeta[] }) {
  const [nameA, setNameA] = useState<string>('search_legacy_shelf.json');
  const [nameB, setNameB] = useState<string>('search_live_2026-10-11_lathi.json');
  const [kindB, setKindB] = useState<SideBKind>('fixture');
  const [liveQuery, setLiveQuery] = useState('Lathi');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<FixtureDiff | null>(null);
  const [loadedNames, setLoadedNames] = useState<{ a: string; b: string; live: boolean; liveMs: number | null } | null>(
    null,
  );

  // Only offer fixtures whose names look like YTM search responses (the diff is search-specific).
  const selectable = useMemo(
    () => fixtures.filter((f) => f.name.endsWith('.json')),
    [fixtures],
  );

  const run = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const fetchContent = async (name: string): Promise<unknown> => {
        const res = await fetch(`/api/lab/fixtures?name=${encodeURIComponent(name)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`Fixture ${name}: HTTP ${res.status}`);
        const data = (await res.json()) as { content?: unknown };
        return data.content ?? null;
      };

      const contentA = await fetchContent(nameA);
      const parsedA = parseWithTrace(contentA);

      let parsedB: ReturnType<typeof parseWithTrace>;
      let labelB: string;
      let liveMs: number | null = null;
      if (kindB === 'fixture') {
        const contentB = await fetchContent(nameB);
        parsedB = parseWithTrace(contentB);
        labelB = nameB;
      } else {
        const q = liveQuery.trim();
        if (q.length === 0) throw new Error('Enter a query for the live search.');
        // EXACT same request the playground/app uses; parsed server-side by the same parser.
        const res = await fetch('/api/lab/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: q }),
        });
        const payload: unknown = await res.json();
        const parsed = parseResultFromLivePayload(payload);
        if (parsed === null) {
          throw new Error(
            `Live search did not return a usable payload (HTTP ${res.status}) — failure is surfaced as-is.`,
          );
        }
        const okPayload = payload as { ok?: boolean; errorKind?: string; message?: string; durationMs?: number };
        if (okPayload.ok !== true) {
          throw new Error(`Live search failed (${okPayload.errorKind ?? 'unknown'}): ${okPayload.message ?? 'no message'}`);
        }
        parsedB = parsed;
        labelB = `LIVE "${q}"`;
        liveMs = typeof okPayload.durationMs === 'number' ? okPayload.durationMs : null;
      }

      setDiff(diffFixtureParses(parsedA, parsedB));
      setLoadedNames({ a: nameA, b: labelB, live: kindB === 'live', liveMs });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown diff error');
      setDiff(null);
    } finally {
      setBusy(false);
    }
  }, [nameA, nameB, kindB, liveQuery]);

  const swap = () => {
    setNameA(nameB);
    setNameB(nameA);
    setDiff(null);
    setLoadedNames(null);
  };

  const hasDiff = diff !== null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompareArrows className="h-4 w-4 text-primary" aria-hidden="true" />
          Diff two parses
        </CardTitle>
        <CardDescription>
          Compare two parses side-by-side — track adds/removals/changes, section deltas, renderer-census movement.
          Side B can be a stored fixture (offline, deterministic) or a{' '}
          <span className="text-amber-300">live InnerTube search</span> — layout drift becomes visible the moment it
          happens.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="diff-a">Fixture A (before)</Label>
            <Select value={nameA} onValueChange={(v) => { setNameA(v); setDiff(null); }}>
              <SelectTrigger id="diff-a" className="w-full font-mono text-xs" aria-label="Fixture A">
                <SelectValue placeholder="Pick fixture A" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {selectable.map((f) => (
                  <SelectItem key={f.name} value={f.name} className="font-mono text-xs">
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-10 w-10 shrink-0 self-center sm:self-end"
            onClick={swap}
            disabled={kindB === 'live'}
            aria-label={kindB === 'live' ? 'Swap is unavailable while side B is live' : 'Swap fixture A and B'}
            title={kindB === 'live' ? 'Swap needs two fixtures' : 'Swap A and B'}
          >
            <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label htmlFor="diff-b">Side B (after)</Label>
              <Tabs value={kindB} onValueChange={(v) => { setKindB(v as SideBKind); setDiff(null); setLoadedNames(null); }}>
                <TabsList className="h-6">
                  <TabsTrigger value="fixture" className="h-5 gap-1 px-2 text-[10px]">
                    <Database className="h-3 w-3" aria-hidden="true" /> fixture
                  </TabsTrigger>
                  <TabsTrigger value="live" className="h-5 gap-1 px-2 text-[10px]">
                    <Radio className="h-3 w-3" aria-hidden="true" /> live
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
            {kindB === 'fixture' ? (
              <Select value={nameB} onValueChange={(v) => { setNameB(v); setDiff(null); }}>
                <SelectTrigger id="diff-b" className="w-full font-mono text-xs" aria-label="Fixture B">
                  <SelectValue placeholder="Pick fixture B" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {selectable.map((f) => (
                    <SelectItem key={f.name} value={f.name} className="font-mono text-xs">
                      {f.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="diff-b-live"
                value={liveQuery}
                onChange={(event) => setLiveQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && liveQuery.trim().length > 0 && !busy) void run();
                }}
                placeholder='Live search query — try "Lathi"'
                aria-label="Live search query for side B"
                className="min-h-[40px] font-mono text-xs"
                autoComplete="off"
              />
            )}
          </div>
          <Button onClick={() => void run()} disabled={busy || (kindB === 'live' && liveQuery.trim().length === 0)} className="gap-2 sm:mb-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <GitCompareArrows className="h-4 w-4" aria-hidden="true" />}
            Run diff
          </Button>
        </div>
        {kindB === 'live' && (
          <p className="flex items-start gap-1.5 text-xs text-amber-300/90">
            <Radio className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
            Side B hits the real catalog right now (same unauthenticated request the app sends). Results change over
            time — a stored fixture is the deterministic baseline.
          </p>
        )}

        {error !== null && (
          <p className="text-sm text-rose-300" role="alert">{error}</p>
        )}

        {hasDiff && loadedNames !== null && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="space-y-4"
            aria-live="polite"
          >
            {/* Summary strip */}
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background/40 p-3">
              <span className="font-mono text-[11px] text-muted-foreground">
                {loadedNames.a} <span className="text-primary">→</span>{' '}
                <span className={loadedNames.live ? 'text-amber-300' : ''}>{loadedNames.b}</span>
              </span>
              {loadedNames.live && loadedNames.liveMs !== null && (
                <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300">
                  <Radio className="mr-1 h-3 w-3" aria-hidden="true" /> live · {loadedNames.liveMs} ms
                </Badge>
              )}
              <Separator orientation="vertical" className="hidden h-4 sm:block" />
              <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                +{diff.track.added.length} added
              </Badge>
              <Badge variant="outline" className="border-rose-500/40 bg-rose-500/10 text-rose-300">
                −{diff.track.removed.length} removed
              </Badge>
              <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300">
                ~{diff.track.changed.length} changed
              </Badge>
              <Badge variant="outline" className="border-zinc-500/40 bg-zinc-500/10 text-zinc-300">
                {diff.track.unchanged} unchanged
              </Badge>
              <Badge variant="outline" className="border-border">
                {diff.track.totalA} → {diff.track.totalB} items
              </Badge>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {/* Track diff */}
              <div className="space-y-2">
                <p className="text-sm font-medium">Tracks</p>
                {diff.track.added.length + diff.track.removed.length + diff.track.changed.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-background/40 p-4 text-sm text-muted-foreground">
                    No track-level differences — the two fixtures produce identical catalogs.
                  </p>
                ) : (
                  <ScrollArea className="rm-scroll max-h-72 rounded-md border border-border bg-background/40">
                    <ul className="divide-y divide-border/60 p-1 pr-2">
                      {diff.track.added.map((entry) => (
                        <DiffRow key={`add-${entry.id}`} entry={entry} />
                      ))}
                      {diff.track.removed.map((entry) => (
                        <DiffRow key={`rem-${entry.id}`} entry={entry} />
                      ))}
                      {diff.track.changed.map((entry) => (
                        <DiffRow key={`chg-${entry.id}`} entry={entry} />
                      ))}
                    </ul>
                  </ScrollArea>
                )}
              </div>

              {/* Sections + renderer delta */}
              <div className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Sections</p>
                  <div className="space-y-1">
                    {diff.sections.length === 0 && (
                      <p className="rounded-md border border-dashed border-border bg-background/40 p-3 text-xs text-muted-foreground">
                        Neither parse produced sections.
                      </p>
                    )}
                    {diff.sections.map((s) => (
                      <div
                        key={s.title}
                        className="flex items-center justify-between gap-2 rounded-md border border-border bg-background/40 px-3 py-1.5 text-xs"
                      >
                        <span className="truncate">{s.title}</span>
                        <span className="flex shrink-0 items-center gap-1.5 font-mono">
                          <span className="text-muted-foreground">{s.countA}</span>
                          <span className="text-primary">→</span>
                          <span className={s.countB > s.countA ? 'text-emerald-300' : s.countB < s.countA ? 'text-rose-300' : ''}>
                            {s.countB}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-medium">Renderer census movement</p>
                  <div className="flex flex-wrap gap-1.5">
                    {diff.renderers.slice(0, 10).map((r) => (
                      <Badge
                        key={r.type}
                        variant="outline"
                        className={`font-mono text-[10px] ${
                          r.delta > 0
                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                            : r.delta < 0
                              ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                              : 'border-border bg-background/40 text-muted-foreground'
                        }`}
                      >
                        {r.type} {r.countA}→{r.countB}
                        {r.delta !== 0 && ` (${r.delta > 0 ? '+' : ''}${r.delta})`}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}

function DiffRow({ entry }: { entry: FixtureDiff['track']['added'][number] }) {
  const meta =
    entry.kind === 'added'
      ? { Icon: PlusCircle, cls: 'text-emerald-400', bg: 'bg-emerald-500/5', sign: '+' }
      : entry.kind === 'removed'
        ? { Icon: MinusCircle, cls: 'text-rose-400', bg: 'bg-rose-500/5', sign: '−' }
        : { Icon: PencilLine, cls: 'text-amber-400', bg: 'bg-amber-500/5', sign: '~' };
  const { Icon, cls, bg, sign } = meta;
  return (
    <motion.li
      initial={{ opacity: 0, x: entry.kind === 'removed' ? -6 : 6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className={`flex items-start gap-2 rounded px-2 py-2 ${bg}`}
    >
      <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${cls}`} aria-hidden="true" />
      <div className="min-w-0">
        <p className="truncate text-xs font-medium">
          <span className={`mr-1 font-mono ${cls}`}>{sign}</span>
          {entry.label}
        </p>
        <p className="truncate font-mono text-[10px] text-muted-foreground">{entry.id}</p>
        {entry.changes !== undefined && entry.changes.length > 0 && (
          <ul className="mt-0.5 space-y-0.5">
            {entry.changes.map((change) => (
              <li key={change} className="text-[10px] text-amber-200/90">{change}</li>
            ))}
          </ul>
        )}
      </div>
    </motion.li>
  );
}
