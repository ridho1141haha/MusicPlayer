'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  Clock,
  Database,
  Info,
  Loader2,
  Play,
  Radio,
  RefreshCw,
  Search,
  WifiOff,
  XCircle,
} from 'lucide-react';

import { StatusBadge } from '@/components/lab/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatDuration } from '@/lib/lab/format';
import { parseWithTrace } from '@/lib/lab/yt-search-parser';
import type { FixtureMeta, LabTrack, SearchSection, TraceEntry } from '@/lib/lab/types';
import { useLabStore } from '@/lib/lab/store';

type SourceMode = 'live' | 'fixture';

type LiveSuccess = {
  ok: true;
  httpStatus: number;
  durationMs: number;
  query: string;
  byteLength: number;
  sections: SearchSection[];
  trace: TraceEntry[];
  rendererStats: Array<{ type: string; count: number }>;
  continuationToken: string | null;
  note: string | null;
};

type LiveFailure = {
  ok: false;
  errorKind: 'bad-request' | 'network' | 'timeout' | 'http' | 'parse';
  message: string;
  httpStatus?: number;
  durationMs?: number;
};

type LiveState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'success'; data: LiveSuccess }
  | { phase: 'failure'; failure: LiveFailure };

type FixtureState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'success'; data: LiveSuccess; fixtureName: string }
  | { phase: 'failure'; message: string };

const ERROR_ICON: Record<LiveFailure['errorKind'], typeof AlertTriangle> = {
  'bad-request': AlertTriangle,
  network: WifiOff,
  timeout: Clock,
  http: Ban,
  parse: XCircle,
};

function SectionRendererStats({ stats }: { stats: Array<{ type: string; count: number }> }) {
  const top = stats.slice(0, 6);
  return (
    <div className="flex flex-wrap gap-1.5">
      {top.map((s) => (
        <Badge key={s.type} variant="outline" className="border-border bg-background/40 font-mono text-[10px]">
          {s.type} ×{s.count}
        </Badge>
      ))}
      {stats.length > top.length && (
        <Badge variant="outline" className="border-border bg-background/40 text-[10px]">
          +{stats.length - top.length} more
        </Badge>
      )}
    </div>
  );
}

function TracePanel({ trace }: { trace: TraceEntry[] }) {
  const [filter, setFilter] = useState<'all' | 'accepted' | 'rejected'>('all');
  const visible = trace.filter((entry) => (filter === 'all' ? true : entry.kind === filter));
  const counts = useMemo(
    () => ({
      accepted: trace.filter((t) => t.kind === 'accepted').length,
      rejected: trace.filter((t) => t.kind === 'rejected').length,
      info: trace.filter((t) => t.kind === 'info').length,
    }),
    [trace],
  );

  return (
    <Collapsible>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="gap-2">
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            Parser trace ({counts.accepted} accepted · {counts.rejected} rejected · {counts.info} info)
          </Button>
        </CollapsibleTrigger>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="h-6 text-xs">all</TabsTrigger>
            <TabsTrigger value="accepted" className="h-6 text-xs">accepted</TabsTrigger>
            <TabsTrigger value="rejected" className="h-6 text-xs">rejected</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <CollapsibleContent>
        <ScrollArea className="rm-scroll mt-2 max-h-72 rounded-md border border-border bg-background/40 p-2">
          <ul className="space-y-1">
            {visible.map((entry, index) => (
              <li key={`${entry.path}-${index}`} className="flex items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-secondary/40">
                {entry.kind === 'accepted' ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                ) : entry.kind === 'rejected' ? (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden="true" />
                ) : (
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-300" aria-hidden="true" />
                )}
                <span className="min-w-0">
                  <span className="font-mono text-[11px] text-muted-foreground">{entry.path}</span>
                  <span className="ml-2 text-foreground/90">{entry.reason}</span>
                  {entry.detail !== undefined && <span className="ml-1 text-muted-foreground">({entry.detail})</span>}
                </span>
              </li>
            ))}
            {visible.length === 0 && <li className="px-2 py-3 text-xs text-muted-foreground">No entries for this filter.</li>}
          </ul>
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  );
}

function ResultList({ sections }: { sections: SearchSection[] }) {
  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <div key={section.title}>
          <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {section.title}
            <Badge variant="outline" className="border-border text-[10px]">
              {section.tracks.length}
            </Badge>
          </h4>
          <ScrollArea className="rm-scroll max-h-96">
            <ul className="space-y-1 pr-2">
              {section.tracks.map((track) => (
                <TrackRow key={`${section.title}-${track.id}`} track={track} />
              ))}
            </ul>
          </ScrollArea>
        </div>
      ))}
    </div>
  );
}

function TrackRow({ track }: { track: LabTrack }) {
  const idSuffix = track.id.includes(':') ? track.id.slice(track.id.indexOf(':') + 1) : track.id;
  return (
    <li className="flex items-center gap-3 rounded-md border border-border bg-background/40 p-2 transition-colors hover:bg-secondary/40">
      {track.artworkUrl !== null ? (
        <img
          src={track.artworkUrl}
          alt={`Artwork for ${track.title}`}
          loading="lazy"
          referrerPolicy="no-referrer"
          className="h-10 w-10 shrink-0 rounded object-cover"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-secondary" aria-hidden="true">
          <Search className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{track.title}</p>
        <p className="truncate text-xs text-muted-foreground">
          {track.artist}
          {track.album !== null ? ` · ${track.album}` : ''}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge
          variant="outline"
          className="border-border bg-background/60 font-mono text-[10px] text-muted-foreground"
          title={`Full id: ${track.id}`}
        >
          {idSuffix}
        </Badge>
        <span className="text-[11px] text-muted-foreground">{formatDuration(track.durationMs)}</span>
      </div>
    </li>
  );
}

function MetaBar({
  httpStatus,
  durationMs,
  byteLength,
  stats,
  continuationToken,
}: {
  httpStatus: number;
  durationMs: number;
  byteLength: number | null;
  stats: Array<{ type: string; count: number }>;
  continuationToken: string | null;
}) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-background/40 p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
          HTTP {httpStatus}
        </Badge>
        <Badge variant="outline" className="border-border">{durationMs} ms</Badge>
        {byteLength !== null && (
          <Badge variant="outline" className="border-border">{(byteLength / 1024).toFixed(0)} KB</Badge>
        )}
        {continuationToken !== null && (
          <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300">
            continuation present
          </Badge>
        )}
        <span className="text-muted-foreground">renderer stats:</span>
      </div>
      <SectionRendererStats stats={stats} />
    </div>
  );
}

export function SearchPlaygroundTab() {
  const mode = useLabStore((s) => s.playgroundMode);
  const setMode = useLabStore((s) => s.setPlaygroundMode);
  // A fixture "opened" from the Fixtures tab lands in the store; local picks win after that.
  const storeFixture = useLabStore((s) => s.playgroundFixture);

  const [query, setQuery] = useState('Lathi');
  const [live, setLive] = useState<LiveState>({ phase: 'idle' });
  const [localFixtureName, setLocalFixtureName] = useState<string | null>(null);
  const [fixtureList, setFixtureList] = useState<FixtureMeta[]>([]);
  const [fixture, setFixture] = useState<FixtureState>({ phase: 'idle' });
  const [fixtureContent, setFixtureContent] = useState<unknown>(null);

  const fixtureName = localFixtureName ?? storeFixture;

  // Load fixture list once (all state updates happen after await boundaries).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/lab/fixtures', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { builtIn: FixtureMeta[]; user: FixtureMeta[] };
        if (!cancelled) setFixtureList([...data.builtIn, ...data.user]);
      } catch {
        // honest: list simply stays empty; fixture mode will error if used
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const runLive = async () => {
    setLive({ phase: 'loading' });
    try {
      const res = await fetch('/api/lab/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
      });
      const data = (await res.json()) as LiveSuccess | LiveFailure;
      if (data.ok) setLive({ phase: 'success', data });
      else setLive({ phase: 'failure', failure: data });
    } catch (error) {
      setLive({
        phase: 'failure',
        failure: {
          ok: false,
          errorKind: 'network',
          message: `Could not reach the lab API: ${error instanceof Error ? error.message : 'unknown'}`,
        },
      });
    }
  };

  const runFixture = async () => {
    if (fixtureName === null) {
      setFixture({ phase: 'failure', message: 'Pick a fixture first.' });
      return;
    }
    setFixture({ phase: 'loading' });
    try {
      const res = await fetch(`/api/lab/fixtures?name=${encodeURIComponent(fixtureName)}`, { cache: 'no-store' });
      if (!res.ok) {
        setFixture({ phase: 'failure', message: `Fixture endpoint: HTTP ${res.status}` });
        return;
      }
      const data = (await res.json()) as { content: unknown };
      setFixtureContent(data.content);
      const started = performance.now();
      const result = parseWithTrace(data.content);
      const durationMs = Math.round(performance.now() - started);
      const stats = Object.entries(
        result.rendererStats.reduce<Record<string, number>>((acc, s) => ({ ...acc, [s.type]: s.count }), {}),
      ).map(([type, count]) => ({ type, count }));
      setFixture({
        phase: 'success',
        fixtureName,
        durationMs,
        data: {
          ok: true,
          httpStatus: 0, // offline: no HTTP involved
          durationMs,
          query: `(fixture) ${fixtureName}`,
          byteLength: JSON.stringify(data.content).length,
          sections: result.sections ?? [],
          trace: result.trace,
          rendererStats: stats,
          continuationToken: result.continuationToken,
          note: null,
        },
      });
    } catch (error) {
      setFixture({
        phase: 'failure',
        message: error instanceof Error ? error.message : 'Unknown fixture error',
      });
    }
  };

  const activeState: LiveState | FixtureState = mode === 'live' ? live : fixture;
  const successData = activeState.phase === 'success' ? activeState.data : null;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-primary" aria-hidden="true" />
            Search Playground
          </CardTitle>
          <CardDescription>
            Live mode sends the exact unauthenticated InnerTube request the Android app sends, then parses with the
            same parser port. Fixture mode is fully offline and deterministic.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Tabs value={mode} onValueChange={(v) => setMode(v as SourceMode)} className="shrink-0">
              <TabsList className="h-10">
                <TabsTrigger value="live" className="gap-1.5 px-3">
                  <Radio className="h-3.5 w-3.5" aria-hidden="true" /> Live API
                </TabsTrigger>
                <TabsTrigger value="fixture" className="gap-1.5 px-3">
                  <Database className="h-3.5 w-3.5" aria-hidden="true" /> Fixture
                </TabsTrigger>
              </TabsList>
            </Tabs>
            {mode === 'live' ? (
              <div className="flex flex-1 gap-2">
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && query.trim().length > 0 && live.phase !== 'loading') void runLive();
                  }}
                  placeholder='Try "Lathi", "test", or a gibberish string'
                  aria-label="Search query"
                  className="min-h-[40px]"
                />
                <Button onClick={() => void runLive()} disabled={query.trim().length === 0 || live.phase === 'loading'} className="gap-2 min-h-[40px]">
                  {live.phase === 'loading' ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Play className="h-4 w-4" aria-hidden="true" />
                  )}
                  Run
                </Button>
              </div>
            ) : (
              <div className="flex flex-1 gap-2">
                <Select value={fixtureName ?? ''} onValueChange={(v) => setLocalFixtureName(v)}>
                  <SelectTrigger className="min-h-[40px] flex-1" aria-label="Pick a fixture">
                    <SelectValue placeholder="Pick a fixture…" />
                  </SelectTrigger>
                  <SelectContent>
                    {fixtureList.map((fixtureMeta) => (
                      <SelectItem key={fixtureMeta.name} value={fixtureMeta.name}>
                        <span className="flex items-center gap-2">
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${
                              fixtureMeta.origin === 'real-capture'
                                ? 'border-emerald-500/40 text-emerald-300'
                                : fixtureMeta.origin === 'synthetic'
                                  ? 'border-amber-500/40 text-amber-300'
                                  : 'border-teal-500/40 text-teal-300'
                            }`}
                          >
                            {fixtureMeta.origin}
                          </Badge>
                          <span className="font-mono text-xs">{fixtureMeta.name}</span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button onClick={() => void runFixture()} disabled={fixture.phase === 'loading'} className="gap-2 min-h-[40px]">
                  {fixture.phase === 'loading' ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Play className="h-4 w-4" aria-hidden="true" />
                  )}
                  Parse
                </Button>
              </div>
            )}
          </div>

          {mode === 'live' && (
            <p className="text-xs text-muted-foreground">
              No credentials, cookies, or bypass of any YouTube protection are involved. Failures are surfaced as-is.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Live failure — typed and honest */}
      {mode === 'live' && live.phase === 'failure' && (
        <Card className="border-rose-500/30">
          <CardContent className="flex flex-col gap-2 p-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-rose-300">
              {(() => {
                const Icon = ERROR_ICON[live.failure.errorKind] ?? AlertTriangle;
                return <Icon className="h-4 w-4" aria-hidden="true" />;
              })()}
              {live.failure.errorKind === 'timeout'
                ? 'Timeout'
                : live.failure.errorKind === 'network'
                  ? 'Network failure'
                  : live.failure.errorKind === 'http'
                    ? `HTTP error${live.failure.httpStatus !== undefined ? ` ${live.failure.httpStatus}` : ''}`
                    : live.failure.errorKind === 'parse'
                      ? 'Parse error'
                      : 'Bad request'}
            </p>
            <p className="text-sm text-foreground/90">{live.failure.message}</p>
            <Button variant="outline" size="sm" className="w-fit gap-2" onClick={() => void runLive()}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Fixture failure */}
      {mode === 'fixture' && fixture.phase === 'failure' && (
        <Card className="border-rose-500/30">
          <CardContent className="p-4">
            <p className="text-sm text-rose-300">{fixture.message}</p>
          </CardContent>
        </Card>
      )}

      {/* Loading skeleton */}
      {activeState.phase === 'loading' && (
        <Card>
          <CardContent className="space-y-3 p-4" aria-busy="true">
            <Skeleton className="h-5 w-40" />
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 rounded-md" />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Success */}
      {successData !== null && activeState.phase === 'success' && (
        <div className="space-y-4">
          {activeState.phase === 'success' && 'httpStatus' in activeState.data && activeState.data.httpStatus === 0 && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Database className="h-3.5 w-3.5" aria-hidden="true" />
              Offline fixture mode — no HTTP request was made.
            </div>
          )}
          <MetaBar
            httpStatus={successData.httpStatus}
            durationMs={successData.durationMs}
            byteLength={successData.byteLength}
            stats={successData.rendererStats}
            continuationToken={successData.continuationToken}
          />
          {successData.note !== null && (
            <div className="flex items-start gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {successData.note}
            </div>
          )}
          {successData.sections.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 p-8 text-center">
                <StatusBadge status="untested" />
                <p className="text-sm font-medium">0 results parsed</p>
                <p className="max-w-md text-xs text-muted-foreground">
                  The request/response completed, but the parser produced no sections. For live responses this is the
                  AUDIT-1 Finding A signature (layout drift); for fixtures check the trace below.
                </p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  {successData.sections.reduce((sum, s) => sum + s.tracks.length, 0)} items in{' '}
                  {successData.sections.length} section(s)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResultList sections={successData.sections} />
              </CardContent>
            </Card>
          )}
          <TracePanel trace={successData.trace} />
          {fixtureContent !== null && mode === 'fixture' && (
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> Raw fixture JSON
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <ScrollArea className="rm-scroll mt-2 max-h-96 rounded-md border border-border bg-background/60 p-3">
                  <pre className="font-mono text-[11px] leading-relaxed">
                    {JSON.stringify(fixtureContent, null, 2)}
                  </pre>
                </ScrollArea>
              </CollapsibleContent>
            </Collapsible>
          )}
        </div>
      )}
    </div>
  );
}
