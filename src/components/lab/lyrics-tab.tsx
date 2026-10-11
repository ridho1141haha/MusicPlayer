'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Captions,
  FileText,
  Info,
  Loader2,
  Play,
  Tags,
  TimerOff,
} from 'lucide-react';

import { EmptyState } from '@/components/lab/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import { activeLineIndex, parseWithStats } from '@/lib/lab/lrc-parser';
import { formatDuration } from '@/lib/lab/format';

interface LrcFileMeta {
  name: string;
  kind: string;
  description: string;
  sizeBytes: number;
}

type ParseOutput = ReturnType<typeof parseWithStats>;

/**
 * Lyrics Lab — tests the TS mirror of LrcParser.java (LrcParserTest golden
 * expectations) against synthetic .lrc fixtures or pasted text, with a synced
 * active-line preview driven by a scrub slider.
 */
export function LyricsTab() {
  const [files, setFiles] = useState<LrcFileMeta[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sourceNote, setSourceNote] = useState<string | null>(null);
  const [result, setResult] = useState<ParseOutput | null>(null);
  const [scrubMs, setScrubMs] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/lab/lrc', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { files: LrcFileMeta[] };
      setFiles(data.files);
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load LRC fixture list');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const loadFixture = useCallback(async (name: string) => {
    setSelectedName(name);
    setParsing(true);
    try {
      const res = await fetch(`/api/lab/lrc?name=${encodeURIComponent(name)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Fixture endpoint: HTTP ${res.status}`);
      const data = (await res.json()) as { content: string };
      setText(data.content);
      setSourceNote(`Loaded from fixture ${name} (synthetic — labeled in-file).`);
      const output = parseWithStats(data.content);
      setResult(output);
      setScrubMs(output.lines.length > 0 ? output.lines[0].timeMs : 0);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setParsing(false);
    }
  }, []);

  const runParse = useCallback(() => {
    setParsing(true);
    try {
      const output = parseWithStats(text);
      setResult(output);
      setSourceNote(text.trim().length === 0 ? null : 'Parsed from the pasted text above.');
      setScrubMs(output.lines.length > 0 ? output.lines[0].timeMs : 0);
    } finally {
      setParsing(false);
    }
  }, [text]);

  const maxMs = useMemo(() => {
    if (result === null || result.lines.length === 0) return 0;
    return result.lines[result.lines.length - 1].timeMs;
  }, [result]);

  const activeIdx = useMemo(() => {
    if (result === null || !result.synced) return -1;
    return activeLineIndex(result.lines, scrubMs);
  }, [result, scrubMs]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {/* Input column */}
      <Card className="lg:col-span-2">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Captions className="h-4 w-4 text-primary" aria-hidden="true" />
            LRC input
          </CardTitle>
          <CardDescription>
            Test the TS mirror of <span className="font-mono text-xs">LrcParser.java</span> (synced / unsynced,
            multi-tags, metadata skipping). The JVM golden expectations are mirrored 1:1 in
            <span className="font-mono text-xs"> tests/unit/lrc-parser.test.ts</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5">
            <Label>Synthetic fixtures (labeled — LRC is not a network capture)</Label>
            {loading ? (
              <SkeletonRow />
            ) : loadError !== null ? (
              <div className="space-y-2">
                <p className="text-sm text-rose-300">{loadError}</p>
                <Button variant="outline" size="sm" onClick={() => void refresh()}>
                  Retry
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {files.map((file) => (
                  <Button
                    key={file.name}
                    variant={selectedName === file.name ? 'default' : 'outline'}
                    size="sm"
                    className="gap-1.5 font-mono text-xs"
                    onClick={() => void loadFixture(file.name)}
                    aria-label={`Load fixture ${file.name}`}
                  >
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    {file.name}
                    <Badge variant="outline" className="border-border px-1 text-[9px] text-muted-foreground">
                      {file.kind}
                    </Badge>
                  </Button>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="lrc-text">Or paste LRC / plain lyrics</Label>
            <Textarea
              id="lrc-text"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={'[00:01.00]First line\n[00:05.50]Second line\n[ti:Title] (metadata is skipped)…'}
              className="rm-scroll min-h-44 font-mono text-xs"
              aria-label="LRC content"
            />
          </div>

          <Button onClick={runParse} disabled={parsing || text.trim().length === 0} className="gap-2">
            {parsing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
            Parse
          </Button>
          {sourceNote !== null && (
            <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
              <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              {sourceNote}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Output column */}
      <div className="space-y-4 lg:col-span-3">
        {result === null ? (
          <EmptyState
            icon={Captions}
            title="Nothing parsed yet"
            description="Load a synthetic fixture or paste LRC content, then press Parse. The output shows exactly what LrcParser.java would produce."
          />
        ) : (
          <>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                  {result.synced ? (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">
                      synced
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-amber-500/40 bg-amber-500/10 text-amber-300">
                      unsynced
                    </Badge>
                  )}
                  <span>{result.lines.length} line(s)</span>
                  {result.stats.metadataTags > 0 && (
                    <Badge variant="outline" className="border-border font-mono text-[10px]">
                      <Tags className="mr-1 h-3 w-3" aria-hidden="true" />
                      {result.stats.metadataTags} metadata tag(s) skipped
                    </Badge>
                  )}
                  {result.stats.timestampOnlyLines > 0 && (
                    <Badge variant="outline" className="border-border font-mono text-[10px]">
                      <TimerOff className="mr-1 h-3 w-3" aria-hidden="true" />
                      {result.stats.timestampOnlyLines} timestamp-only line(s) skipped
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  {result.synced
                    ? 'Timestamps found — lines are sorted and the scrubber below highlights the active line.'
                    : 'No usable timestamps — content is returned as unsynchronized plain lines (same as Android).'}
                </CardDescription>
              </CardHeader>
              {result.synced && result.lines.length > 0 && (
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                      {formatDuration(scrubMs)}
                    </span>
                    <Slider
                      value={[Math.min(scrubMs, maxMs)]}
                      min={0}
                      max={Math.max(maxMs, 1)}
                      step={100}
                      onValueChange={([value]) => setScrubMs(value)}
                      aria-label="Scrub position to preview the active lyric line"
                    />
                    <span className="w-14 shrink-0 text-right font-mono text-xs text-muted-foreground">
                      {formatDuration(maxMs)}
                    </span>
                  </div>
                  <p className="rounded-md border border-primary/30 bg-primary/10 px-3 py-2 text-sm text-primary">
                    {activeIdx >= 0 ? result.lines[activeIdx].text : '— before first line —'}
                  </p>
                </CardContent>
              )}
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Parsed lines (parser output, verbatim order)</CardTitle>
              </CardHeader>
              <CardContent>
                {result.lines.length === 0 ? (
                  <EmptyState
                    icon={Captions}
                    title="0 lines"
                    description={
                      result.stats.metadataTags > 0
                        ? 'All input was metadata tags — the parser returns empty unsynced lyrics (mirrors metadataOnlyYieldsEmptyUnsynced).'
                        : 'The input produced no lines. Check for timestamp-only lines or empty content.'
                    }
                  />
                ) : (
                  <ScrollArea className="rm-scroll max-h-96">
                    <ol className="space-y-1 pr-2">
                      {result.lines.map((line, index) => (
                        <li
                          key={`${line.timeMs}-${index}`}
                          className={`flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors ${
                            result.synced && index === activeIdx
                              ? 'border-primary/60 bg-primary/10'
                              : 'border-border bg-background/40'
                          }`}
                        >
                          <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">
                            {line.timeMs > 0 ? formatDuration(line.timeMs) : '—'}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{line.text}</span>
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">#{index}</span>
                        </li>
                      ))}
                    </ol>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex gap-2" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-8 w-32 animate-pulse rounded-md bg-secondary/60" />
      ))}
    </div>
  );
}
