'use client';

import { useCallback, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowDownUp,
  GitCompareArrows,
  Loader2,
  MinusCircle,
  PencilLine,
  PlusCircle,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { diffFixtureParses, type FixtureDiff } from '@/lib/lab/fixture-diff';
import type { FixtureMeta } from '@/lib/lab/types';
import { parseWithTrace } from '@/lib/lab/yt-search-parser';

/**
 * A/B diff of two fixture parses (WEB-LAB-8).
 * Classic demo: legacy inline fixture (musicShelfRenderer) vs a live 2026 capture
 * (musicCardShelfRenderer + itemSectionRenderer) — makes the format migration visible.
 */
export function FixtureDiffPanel({ fixtures }: { fixtures: FixtureMeta[] }) {
  const [nameA, setNameA] = useState<string>('search_legacy_shelf.json');
  const [nameB, setNameB] = useState<string>('search_live_2026-10-11_lathi.json');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<FixtureDiff | null>(null);
  const [loadedNames, setLoadedNames] = useState<{ a: string; b: string } | null>(null);

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
      const [contentA, contentB] = await Promise.all([fetchContent(nameA), fetchContent(nameB)]);
      const parsedA = parseWithTrace(contentA);
      const parsedB = parseWithTrace(contentB);
      setDiff(diffFixtureParses(parsedA, parsedB));
      setLoadedNames({ a: nameA, b: nameB });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown diff error');
      setDiff(null);
    } finally {
      setBusy(false);
    }
  }, [nameA, nameB]);

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
          Diff two fixtures
        </CardTitle>
        <CardDescription>
          Compare two parses side-by-side — track adds/removals/changes, section deltas, renderer-census movement.
          Deterministic and offline. Classic demo: legacy shelf layout vs the 2026 flat layout.
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
            aria-label="Swap fixture A and B"
            title="Swap A and B"
          >
            <ArrowDownUp className="h-4 w-4" aria-hidden="true" />
          </Button>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Label htmlFor="diff-b">Fixture B (after)</Label>
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
          </div>
          <Button onClick={() => void run()} disabled={busy} className="gap-2 sm:mb-0">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <GitCompareArrows className="h-4 w-4" aria-hidden="true" />}
            Run diff
          </Button>
        </div>

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
                {loadedNames.a} <span className="text-primary">→</span> {loadedNames.b}
              </span>
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
