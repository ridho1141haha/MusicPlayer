'use client';

import { useCallback, useState } from 'react';
import { BookOpen, Loader2, Search, ShieldCheck, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { FilePayload } from '@/lib/ridho';

/** Extract README §4 (YouTube Music integration) up to the next top-level section. */
function extractAnalysisSection(markdown: string): string {
  const start = markdown.indexOf('## 4.');
  if (start === -1) return markdown;
  const next = markdown.indexOf('\n## 5.', start);
  return next === -1 ? markdown.slice(start) : markdown.slice(start, next);
}

interface AnalysisState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  content: string;
  error?: string;
}

const RULES = [
  {
    icon: Search,
    tone: 'teal' as const,
    title: 'Search — implemented (experimental)',
    body: 'Unified search queries YouTube Music through public, unauthenticated InnerTube endpoints (WEB_REMIX). Songs, videos, albums and artist shelves are parsed defensively and unit-tested against captured-shape fixtures.',
  },
  {
    icon: TriangleAlert,
    tone: 'amber' as const,
    title: 'Stream playback — best-effort',
    body: 'Direct URLs from the player endpoint work when YouTube serves them. Attestation / po-token gating, regional or age restrictions produce typed UNAVAILABLE failures — never a crash, never a workaround.',
  },
  {
    icon: ShieldCheck,
    tone: 'teal' as const,
    title: 'Refusal rules — enforced in code',
    body: 'No credentials or cookies are requested or stored; signatureCipher payloads are refused rather than deciphered; LOGIN_REQUIRED surfaces as a user-visible error; TLS validation is never disabled; the source has a kill-switch in Settings.',
  },
];

export function YtmCard() {
  const [analysis, setAnalysis] = useState<AnalysisState>({
    status: 'idle',
    content: '',
  });

  const loadAnalysis = useCallback(async () => {
    setAnalysis({ status: 'loading', content: '' });
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent('android/README.md')}`);
      const json = (await res.json()) as FilePayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Request failed (HTTP ${res.status})`);
      setAnalysis({ status: 'ready', content: extractAnalysisSection(json.content) });
    } catch (err) {
      setAnalysis({
        status: 'error',
        content: '',
        error: err instanceof Error ? err.message : 'Failed to load the analysis',
      });
    }
  }, []);

  return (
    <Card className="border-amber-500/20">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-base sm:text-lg">YouTube Music integration</CardTitle>
          <Badge
            variant="outline"
            className="border-amber-500/40 bg-amber-500/10 text-amber-300"
          >
            EXPERIMENTAL — search only
          </Badge>
        </div>
        <CardDescription>
          The honest part: YouTube Music offers no public API for third-party playback. Ridho Music
          implements what is legal and stable, and surfaces typed failures for everything else.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="grid gap-3 md:grid-cols-3">
          {RULES.map((rule) => (
            <li
              key={rule.title}
              className="rounded-lg border bg-background/50 p-4 transition-colors hover:bg-accent/30"
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-lg border ${
                  rule.tone === 'teal'
                    ? 'border-primary/25 bg-primary/10'
                    : 'border-amber-500/30 bg-amber-500/10'
                }`}
                aria-hidden="true"
              >
                <rule.icon
                  className={`h-4.5 w-4.5 ${rule.tone === 'teal' ? 'text-[#7fd8ce]' : 'text-amber-300'}`}
                />
              </span>
              <p className="mt-3 text-sm font-medium text-foreground">{rule.title}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{rule.body}</p>
            </li>
          ))}
        </ul>

        <Dialog
          onOpenChange={(open) => {
            if (open && analysis.status === 'idle') void loadAnalysis();
          }}
        >
          <DialogTrigger asChild>
            <Button variant="outline" className="h-11" aria-label="Open the full YouTube Music integration analysis from README section 4">
              <BookOpen className="h-4 w-4" aria-hidden="true" />
              Read the full analysis — README §4
            </Button>
          </DialogTrigger>
          <DialogContent className="w-full sm:max-w-3xl">
            <DialogHeader>
              <DialogTitle>YouTube Music integration — full analysis</DialogTitle>
              <DialogDescription>
                Verbatim from <span className="font-mono text-xs">android/README.md</span>, served
                live from the repository via /api/file.
              </DialogDescription>
            </DialogHeader>
            <div
              className="rm-scroll max-h-[65vh] overflow-y-auto rounded-md border bg-background/60 p-4"
              aria-live="polite"
              aria-busy={analysis.status === 'loading'}
            >
              {analysis.status === 'loading' && (
                <p className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Loading android/README.md…
                </p>
              )}
              {analysis.status === 'error' && (
                <p className="flex items-center gap-2 py-8 text-sm text-amber-300">
                  <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {analysis.error}
                </p>
              )}
              {analysis.status === 'ready' && (
                <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/90">
                  {analysis.content}
                </pre>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
