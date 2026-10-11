'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Copy, FileText, Loader2, RotateCcw, TriangleAlert } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { formatBytes, type FilePayload } from '@/lib/ridho';

const DOCS = [
  { id: 'readme', label: 'README.md', path: 'android/README.md' },
  { id: 'changelog', label: 'CHANGELOG.md', path: 'android/CHANGELOG.md' },
  {
    id: 'notices',
    label: 'THIRD_PARTY_NOTICES.md',
    path: 'android/THIRD_PARTY_NOTICES.md',
  },
] as const;

type DocId = (typeof DOCS)[number]['id'];

interface DocState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  data?: FilePayload;
  error?: string;
}

type DocsRecord = Record<DocId, DocState>;

const INITIAL_DOCS: DocsRecord = {
  readme: { status: 'idle' },
  changelog: { status: 'idle' },
  notices: { status: 'idle' },
};

export function DocsTabs() {
  const [active, setActive] = useState<DocId>('readme');
  const [docs, setDocs] = useState<DocsRecord>(INITIAL_DOCS);
  const [copiedId, setCopiedId] = useState<DocId | null>(null);

  const fetchDoc = useCallback(async (id: DocId) => {
    const doc = DOCS.find((entry) => entry.id === id);
    if (!doc) return;
    setDocs((prev) => ({ ...prev, [id]: { status: 'loading' } }));
    try {
      const res = await fetch(`/api/file?path=${encodeURIComponent(doc.path)}`);
      const json = (await res.json()) as FilePayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `Request failed (HTTP ${res.status})`);
      setDocs((prev) => ({ ...prev, [id]: { status: 'ready', data: json } }));
    } catch (err) {
      setDocs((prev) => ({
        ...prev,
        [id]: {
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to load document',
        },
      }));
    }
  }, []);

  useEffect(() => {
    if (docs[active].status === 'idle') void fetchDoc(active);
  }, [active, docs, fetchDoc]);

  const copyDoc = useCallback(
    async (id: DocId) => {
      const state = docs[id];
      if (state.status !== 'ready' || !state.data) return;
      try {
        await navigator.clipboard.writeText(state.data.content);
        setCopiedId(id);
        window.setTimeout(() => setCopiedId(null), 1500);
      } catch {
        // Clipboard unavailable — silently ignore.
      }
    },
    [docs],
  );

  return (
    <Tabs value={active} onValueChange={(value) => setActive(value as DocId)}>
      <TabsList aria-label="Project documents" className="h-11 flex-wrap">
        {DOCS.map((doc) => (
          <TabsTrigger key={doc.id} value={doc.id} className="font-mono text-xs sm:text-sm">
            {doc.label}
          </TabsTrigger>
        ))}
      </TabsList>

      {DOCS.map((doc) => {
        const state = docs[doc.id];
        return (
          <TabsContent key={doc.id} value={doc.id} className="mt-4">
            <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <FileText className="h-4 w-4 shrink-0 text-[#7fd8ce]" aria-hidden="true" />
                  <span className="truncate font-mono text-xs text-muted-foreground">
                    {doc.path}
                  </span>
                  {state.status === 'ready' && state.data && (
                    <>
                      <Badge variant="outline" className="border-border text-muted-foreground">
                        {formatBytes(state.data.sizeBytes)}
                      </Badge>
                      {state.data.truncated && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 bg-amber-500/10 text-amber-300"
                        >
                          truncated to 100 KB
                        </Badge>
                      )}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {state.status === 'error' && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9"
                      onClick={() => void fetchDoc(doc.id)}
                    >
                      <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                      Retry
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 w-9 p-0"
                    disabled={state.status !== 'ready'}
                    onClick={() => void copyDoc(doc.id)}
                    aria-label={`Copy ${doc.label} to clipboard`}
                  >
                    {copiedId === doc.id ? (
                      <Check className="h-4 w-4 text-[#7fd8ce]" aria-hidden="true" />
                    ) : (
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="rm-scroll max-h-[70vh] overflow-auto p-4 sm:p-5">
                {state.status === 'loading' && (
                  <div
                    className="space-y-3"
                    aria-busy="true"
                    aria-label={`Loading ${doc.label}`}
                  >
                    {[95, 80, 88, 60, 92, 70, 85, 55].map((width, index) => (
                      <Skeleton
                        key={index}
                        className="h-4 bg-muted/80"
                        style={{ width: `${width}%` }}
                      />
                    ))}
                  </div>
                )}
                {state.status === 'error' && (
                  <p className="flex items-center gap-2 py-6 text-sm text-amber-300">
                    <TriangleAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {state.error}
                  </p>
                )}
                {state.status === 'ready' && state.data && (
                  <pre className="whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-foreground/90">
                    {state.data.content}
                  </pre>
                )}
                {state.status === 'idle' && (
                  <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Loading…
                  </p>
                )}
              </div>
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
