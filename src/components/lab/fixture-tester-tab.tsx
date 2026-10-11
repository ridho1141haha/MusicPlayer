'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Database,
  FilePlus2,
  Info,
  Loader2,
  Play,
  ScrollText,
  XCircle,
} from 'lucide-react';

import { FixtureDiffPanel } from '@/components/lab/fixture-diff-panel';
import { GoldenExpectationsCard } from '@/components/lab/golden-expectations-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { formatBytes } from '@/lib/lab/format';
import { parseWithTrace } from '@/lib/lab/yt-search-parser';
import type { FixtureMeta } from '@/lib/lab/types';
import { useLabStore } from '@/lib/lab/store';

type ParseSummary = {
  sections: Array<{ title: string; count: number }>;
  totalTracks: number;
  rendererStats: Array<{ type: string; count: number }>;
  continuationToken: string | null;
  traceCount: { accepted: number; rejected: number; info: number };
};

function OriginBadge({ origin }: { origin: FixtureMeta['origin'] }) {
  const className =
    origin === 'real-capture'
      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
      : origin === 'synthetic'
        ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
        : origin === 'user-added'
          ? 'border-teal-500/40 bg-teal-500/10 text-teal-300'
          : 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300';
  return (
    <Badge variant="outline" className={`text-[9px] uppercase ${className}`}>
      {origin.replace('-', ' ')}
    </Badge>
  );
}

function AddFixtureDialog({ onAdded }: { onAdded: (name: string) => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [json, setJson] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const jsonPreview = useMemo(() => {
    if (json.trim().length === 0) return null;
    try {
      return JSON.parse(json) as unknown;
    } catch {
      return 'invalid';
    }
  }, [json]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      let content: unknown;
      try {
        content = JSON.parse(json);
      } catch {
        throw new Error('Content is not valid JSON.');
      }
      if (content === null || typeof content !== 'object' || Array.isArray(content)) {
        throw new Error('Content must be a JSON object (a response root).');
      }
      const res = await fetch('/api/lab/fixtures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), content }),
      });
      const data = (await res.json()) as { error?: string; fixture?: { name: string } };
      if (!res.ok || data.error !== undefined) throw new Error(data.error ?? `HTTP ${res.status}`);
      toast({ title: 'Fixture saved', description: `${data.fixture?.name} is now selectable everywhere.` });
      onAdded(data.fixture!.name);
      setOpen(false);
      setName('');
      setDescription('');
      setJson('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <FilePlus2 className="h-3.5 w-3.5" aria-hidden="true" /> Add fixture
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a fixture</DialogTitle>
          <DialogDescription>
            Paste a sanitized response JSON (no cookies, tokens, or private data). It becomes available offline in
            this lab and is stored on local disk under <span className="font-mono text-xs">data/fixtures-user/</span>.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fixture-name">File name</Label>
            <Input
              id="fixture-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="search_live_2026-10-12_myquery.json"
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fixture-desc">Description (provenance matters — be honest)</Label>
            <Input
              id="fixture-desc"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Sanitized trim of a real response for query …, captured …"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="fixture-json">Response JSON</Label>
            <Textarea
              id="fixture-json"
              value={json}
              onChange={(event) => setJson(event.target.value)}
              placeholder='{ "contents": { … } }'
              className="rm-scroll max-h-64 min-h-32 font-mono text-xs"
            />
            {jsonPreview === 'invalid' && <p className="text-xs text-rose-300">Content is not valid JSON.</p>}
            {jsonPreview !== null && jsonPreview !== 'invalid' && (
              <p className="text-xs text-emerald-300">Valid JSON ✓</p>
            )}
          </div>
          {error !== null && <p className="text-sm text-rose-300">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={busy || name.trim().length === 0 || json.trim().length === 0}>
            {busy && <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
            Save fixture
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function FixtureTesterTab() {
  const [fixtures, setFixtures] = useState<FixtureMeta[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState<unknown>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [parseBusy, setParseBusy] = useState(false);
  const [summary, setSummary] = useState<ParseSummary | null>(null);
  const setPlaygroundFixture = useLabStore((s) => s.setPlaygroundFixture);
  const setPlaygroundMode = useLabStore((s) => s.setPlaygroundMode);
  const setActiveTab = useLabStore((s) => s.setActiveTab);

  const refreshList = useCallback(async () => {
    try {
      const res = await fetch('/api/lab/fixtures', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { builtIn: FixtureMeta[]; user: FixtureMeta[] };
      setFixtures([...data.builtIn, ...data.user]);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load fixture list');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshList();
  }, [refreshList]);

  const loadFixture = useCallback(async (name: string) => {
    setSelected(name);
    setSummary(null);
    setLoadError(null);
    try {
      const res = await fetch(`/api/lab/fixtures?name=${encodeURIComponent(name)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Fixture endpoint: HTTP ${res.status}`);
      const data = (await res.json()) as { content: unknown };
      setContent(data.content);
    } catch (error) {
      setContent(null);
      setLoadError(error instanceof Error ? error.message : 'Unknown error');
    }
  }, []);

  const runParse = async () => {
    if (content === null) return;
    setParseBusy(true);
    try {
      const result = parseWithTrace(content);
      const sections = (result.sections ?? []).map((s) => ({ title: s.title, count: s.tracks.length }));
      setSummary({
        sections,
        totalTracks: sections.reduce((sum, s) => sum + s.count, 0),
        rendererStats: result.rendererStats,
        continuationToken: result.continuationToken,
        traceCount: {
          accepted: result.trace.filter((t) => t.kind === 'accepted').length,
          rejected: result.trace.filter((t) => t.kind === 'rejected').length,
          info: result.trace.filter((t) => t.kind === 'info').length,
        },
      });
    } finally {
      setParseBusy(false);
    }
  };

  const selectedMeta = fixtures.find((f) => f.name === selected) ?? null;

  return (
    <div className="space-y-4">
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* Left: registry */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" aria-hidden="true" />
              Fixture registry
            </CardTitle>
            <AddFixtureDialog onAdded={() => void refreshList()} />
          </div>
          <CardDescription>
            Built-ins are sanitized trims of REAL captures (or clearly labeled synthetics). User fixtures are stored
            on local disk.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-md bg-secondary/60" />
              ))}
            </div>
          ) : loadError !== null ? (
            <div className="space-y-2">
              <p className="text-sm text-rose-300">{loadError}</p>
              <Button variant="outline" size="sm" onClick={() => void refreshList()}>
                Retry
              </Button>
            </div>
          ) : (
            <ScrollArea className="rm-scroll max-h-[28rem]">
              <ul className="space-y-1.5 pr-2">
                {fixtures.map((fixture) => (
                  <li key={fixture.name}>
                    <button
                      type="button"
                      onClick={() => void loadFixture(fixture.name)}
                      className={`w-full rounded-md border p-2.5 text-left transition-colors min-h-[44px] ${
                        selected === fixture.name
                          ? 'border-primary/60 bg-primary/10'
                          : 'border-border bg-background/40 hover:bg-secondary/50'
                      }`}
                    >
                      <span className="mb-1 flex items-center justify-between gap-2">
                        <span className="truncate font-mono text-xs">{fixture.name}</span>
                        <OriginBadge origin={fixture.origin} />
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {formatBytes(fixture.sizeBytes)}
                        {fixture.query !== null ? ` · query: ${fixture.query}` : ''}
                        {fixture.capturedAt !== null ? ` · ${fixture.capturedAt}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Right: parser output */}
      <div className="space-y-4 lg:col-span-3">
        {selected === null ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
              <ScrollText className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Pick a fixture to inspect what the parser does with it.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="break-all font-mono text-sm">{selected}</CardTitle>
                {selectedMeta !== null && <CardDescription>{selectedMeta.description}</CardDescription>}
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button onClick={() => void runParse()} disabled={parseBusy || content === null} className="gap-2">
                  {parseBusy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                  Run parser
                </Button>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setPlaygroundFixture(selected);
                    setPlaygroundMode('fixture');
                    setActiveTab('playground');
                  }}
                >
                  Open in Search Playground
                </Button>
                {loadError !== null && <p className="w-full text-sm text-rose-300">{loadError}</p>}
              </CardContent>
            </Card>

            {summary !== null && (
              <>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground">Sections</p>
                    <p className="text-2xl font-semibold text-primary">{summary.sections.length}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground">Tracks</p>
                    <p className="text-2xl font-semibold text-primary">{summary.totalTracks}</p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground">Accepted / rejected</p>
                    <p className="text-2xl font-semibold">
                      <span className="text-emerald-300">{summary.traceCount.accepted}</span>
                      {' / '}
                      <span className="text-rose-300">{summary.traceCount.rejected}</span>
                    </p>
                  </Card>
                  <Card className="p-4">
                    <p className="text-xs text-muted-foreground">Continuation</p>
                    <p className="text-sm font-semibold">
                      {summary.continuationToken === null ? (
                        <span className="text-muted-foreground">none (as verified live)</span>
                      ) : (
                        <span className="text-amber-300">token present</span>
                      )}
                    </p>
                  </Card>
                </div>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Sections found</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    {summary.sections.length === 0 && (
                      <p className="text-sm text-muted-foreground">No sections — this fixture parses to empty.</p>
                    )}
                    {summary.sections.map((section) => (
                      <div key={section.title} className="flex items-center justify-between rounded-md border border-border bg-background/40 px-3 py-2">
                        <span className="text-sm">{section.title}</span>
                        <Badge variant="outline" className="border-border">{section.count}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">Renderer census (whole response)</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-1.5">
                      {summary.rendererStats.slice(0, 12).map((stat) => (
                        <Badge key={stat.type} variant="outline" className="border-border bg-background/40 font-mono text-[10px]">
                          {stat.type} ×{stat.count}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <FixtureTrace content={content} />
              </>
            )}
          </>
        )}
      </div>
    </div>

    {/* A/B diff — full width below the inspector (WEBLAB-8) */}
    <GoldenExpectationsCard fixtures={fixtures} />
    <FixtureDiffPanel fixtures={fixtures} />
    </div>
  );
}

function FixtureTrace({ content }: { content: unknown }) {
  // Derived during render — no effect, no sync setState.
  const trace = useMemo(() => {
    const result = parseWithTrace(content);
    return result.trace.map((t) => ({ kind: t.kind, path: t.path, reason: t.reason }));
  }, [content]);

  return (
    <Collapsible>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> Full trace & raw JSON
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pt-3">
        <ScrollArea className="rm-scroll max-h-72 rounded-md border border-border bg-background/40 p-2">
          <ul className="space-y-1">
            {(trace ?? []).map((entry, index) => (
              <li key={index} className="flex items-start gap-2 rounded px-2 py-1.5 text-xs hover:bg-secondary/40">
                {entry.kind === 'accepted' ? (
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                ) : entry.kind === 'rejected' ? (
                  <XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden="true" />
                ) : (
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-300" aria-hidden="true" />
                )}
                <span className="min-w-0">
                  <span className="font-mono text-[11px] text-muted-foreground">{entry.path}</span>
                  <span className="ml-2">{entry.reason}</span>
                </span>
              </li>
            ))}
          </ul>
        </ScrollArea>
        <ScrollArea className="rm-scroll max-h-96 rounded-md border border-border bg-background/60 p-3">
          <pre className="font-mono text-[11px] leading-relaxed">{JSON.stringify(content, null, 2)}</pre>
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  );
}
