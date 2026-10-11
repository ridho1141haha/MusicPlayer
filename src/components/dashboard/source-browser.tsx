'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Braces,
  Check,
  ChevronRight,
  Copy,
  FileCode2,
  FileCog,
  FileText,
  Folder,
  FolderOpen,
  Search,
  TriangleAlert,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBytes, isViewableFileName, type FilePayload, type TreeNode } from '@/lib/ridho';

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

const AUTO_EXPAND_PATHS = new Set(['app', 'app/src', 'app/src/main']);

/** Expand the root plus the java source chain so real sources are visible immediately. */
function collectInitialExpanded(node: TreeNode, acc: string[] = []): string[] {
  const qualifies =
    node.type === 'dir' &&
    (node.path === '' ||
      AUTO_EXPAND_PATHS.has(node.path) ||
      node.path.startsWith('app/src/main/java'));
  if (!qualifies) return acc;
  acc.push(node.path);
  for (const child of node.children ?? []) collectInitialExpanded(child, acc);
  return acc;
}

/** Keep only nodes whose own path matches q (whole subtree) or that have matching descendants. */
function filterTree(node: TreeNode, q: string): TreeNode | null {
  if (node.type === 'file') {
    return node.path.toLowerCase().includes(q) ? node : null;
  }
  if (node.path.toLowerCase().includes(q)) return node;
  const children = (node.children ?? [])
    .map((child) => filterTree(child, q))
    .filter((child): child is TreeNode => child !== null);
  if (children.length === 0) return null;
  return { ...node, children };
}

function collectDirPaths(node: TreeNode, acc: string[] = []): string[] {
  if (node.type === 'dir') {
    acc.push(node.path);
    for (const child of node.children ?? []) collectDirPaths(child, acc);
  }
  return acc;
}

function treeStats(node: TreeNode): { files: number; bytes: number } {
  if (node.type === 'file') return { files: 1, bytes: node.size ?? 0 };
  return (node.children ?? []).reduce(
    (acc, child) => {
      const childStats = treeStats(child);
      return { files: acc.files + childStats.files, bytes: acc.bytes + childStats.bytes };
    },
    { files: 0, bytes: 0 },
  );
}

function FileIcon({ name, className }: { name: string; className?: string }) {
  if (name.endsWith('.java')) return <FileCode2 className={className} aria-hidden="true" />;
  if (name.endsWith('.json')) return <Braces className={className} aria-hidden="true" />;
  if (name.endsWith('.xml') || name.endsWith('.gradle')) {
    return <FileCog className={className} aria-hidden="true" />;
  }
  return <FileText className={className} aria-hidden="true" />;
}

// ---------------------------------------------------------------------------
// Recursive tree item
// ---------------------------------------------------------------------------

interface TreeItemProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  selected: string | null;
  onToggleDir: (path: string) => void;
  onSelectFile: (path: string) => void;
}

function TreeItem({ node, depth, expanded, selected, onToggleDir, onSelectFile }: TreeItemProps) {
  if (node.type === 'dir') {
    const isOpen = expanded.has(node.path);
    return (
      <li>
        <button
          type="button"
          onClick={() => onToggleDir(node.path)}
          aria-expanded={isOpen}
          className="flex min-h-11 w-full items-center gap-1.5 rounded-md pr-2 text-left text-sm text-foreground/90 transition-colors hover:bg-accent/60"
          style={{ paddingLeft: 8 + depth * 14 }}
        >
          <ChevronRight
            className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
            aria-hidden="true"
          />
          {isOpen ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-[#7fd8ce]" aria-hidden="true" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="truncate">{node.name}</span>
        </button>
        {isOpen && node.children && node.children.length > 0 && (
          <ul>
            {node.children.map((child) => (
              <TreeItem
                key={child.path}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                selected={selected}
                onToggleDir={onToggleDir}
                onSelectFile={onSelectFile}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const isSelected = selected === node.path;
  const viewable = isViewableFileName(node.name);
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelectFile(node.path)}
        title={viewable ? node.path : `${node.path} — binary, not previewable`}
        aria-current={isSelected ? 'true' : undefined}
        className={`flex min-h-11 w-full items-center gap-1.5 rounded-md pr-2 text-left text-sm transition-colors ${
          isSelected
            ? 'bg-primary/15 text-[#7fd8ce]'
            : 'text-foreground/80 hover:bg-accent/60'
        }`}
        style={{ paddingLeft: 8 + depth * 14 + 18 }}
      >
        <FileIcon
          name={node.name}
          className={`h-3.5 w-3.5 shrink-0 ${isSelected ? 'text-[#7fd8ce]' : 'text-muted-foreground'}`}
        />
        <span className="truncate">{node.name}</span>
        {!viewable && (
          <span className="ml-auto shrink-0 font-mono text-[10px] uppercase text-muted-foreground/60">
            bin
          </span>
        )}
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface FileState {
  forPath: string | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  data?: FilePayload;
  error?: string;
}

const SKELETON_WIDTHS = [85, 60, 75, 45, 90, 55, 70, 40, 80, 65, 50, 72];

export function SourceBrowser({ tree }: { tree: TreeNode }) {
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(collectInitialExpanded(tree)),
  );
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(
    'app/src/main/java/com/ridho/music/player/PlaybackService.java',
  );
  const [fileState, setFileState] = useState<FileState>({
    forPath: null,
    status: 'idle',
  });
  const [copied, setCopied] = useState(false);

  const q = filter.trim().toLowerCase();
  const filteredTree = useMemo(() => (q ? filterTree(tree, q) : tree), [tree, q]);

  const activeExpanded = useMemo(() => {
    if (q) {
      const fallbackRoot: TreeNode = { name: 'android', path: '', type: 'dir', children: [] };
      return new Set(collectDirPaths(filteredTree ?? fallbackRoot));
    }
    return expanded;
  }, [q, filteredTree, expanded]);

  const stats = useMemo(() => treeStats(tree), [tree]);

  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();

    fetch(`/api/file?path=${encodeURIComponent(`android/${selected}`)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const json = (await res.json()) as FilePayload & { error?: string };
        if (!res.ok) throw new Error(json.error ?? `Request failed (HTTP ${res.status})`);
        setFileState({ forPath: selected, status: 'ready', data: json });
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setFileState({
          forPath: selected,
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to load file',
        });
      });

    return () => controller.abort();
  }, [selected]);

  // While a newly selected file is in flight, render its loading state.
  const view: FileState =
    fileState.forPath === selected
      ? fileState
      : { forPath: selected, status: selected ? 'loading' : 'idle' };

  const toggleDir = useCallback((dirPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  }, []);

  const copyContent = useCallback(async () => {
    if (view.status !== 'ready' || !view.data) return;
    try {
      await navigator.clipboard.writeText(view.data.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — silently ignore.
    }
  }, [view]);

  const lines =
    view.status === 'ready' && view.data ? view.data.content.split('\n') : [];

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* File tree */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="space-y-3 border-b border-border p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-xs text-muted-foreground">android/</p>
            <p className="text-[11px] text-muted-foreground/80">
              {stats.files} files · {formatBytes(stats.bytes)}
            </p>
          </div>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Filter files…"
              aria-label="Filter files by path"
              className="h-11 pl-9 text-sm"
            />
          </div>
        </div>
        <ScrollArea className="h-72 lg:h-[560px]">
          {filteredTree === null ? (
            <p className="p-4 text-sm text-muted-foreground">
              No files match “{filter}”.
            </p>
          ) : (
            <ul className="p-2" role="tree" aria-label="Android project files">
              {(filteredTree.children ?? []).map((child) => (
                <TreeItem
                  key={child.path}
                  node={child}
                  depth={0}
                  expanded={activeExpanded}
                  selected={selected}
                  onToggleDir={toggleDir}
                  onSelectFile={setSelected}
                />
              ))}
            </ul>
          )}
        </ScrollArea>
      </div>

      {/* Code viewer */}
      <div className="flex min-h-[420px] flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <p className="min-w-0 truncate font-mono text-xs text-foreground/90" aria-live="polite">
            {selected ?? 'No file selected'}
          </p>
          <div className="flex shrink-0 items-center gap-2">
            {view.status === 'ready' && view.data && (
              <>
                <span className="hidden font-mono text-[11px] text-muted-foreground sm:inline">
                  {lines.length} lines · {formatBytes(view.data.sizeBytes)}
                </span>
                {view.data.truncated && (
                  <Badge
                    variant="outline"
                    className="border-amber-500/40 bg-amber-500/10 text-amber-300"
                  >
                    truncated to 100 KB
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={copyContent}
                  aria-label="Copy file content to clipboard"
                  className="h-9 w-9 p-0"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-[#7fd8ce]" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="rm-scroll min-h-0 flex-1 overflow-auto" style={{ maxHeight: '65vh' }}>
          {view.status === 'idle' && (
            <div className="flex h-full min-h-[280px] items-center justify-center p-8">
              <p className="text-sm text-muted-foreground">
                Select a file from the tree to preview its source.
              </p>
            </div>
          )}

          {view.status === 'loading' && (
            <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading file content">
              {SKELETON_WIDTHS.map((width, index) => (
                <Skeleton
                  key={index}
                  className="h-4 bg-muted/80"
                  style={{ width: `${width}%` }}
                />
              ))}
            </div>
          )}

          {view.status === 'error' && (
            <div className="flex h-full min-h-[280px] flex-col items-center justify-center gap-3 p-8 text-center">
              <TriangleAlert className="h-8 w-8 text-amber-400" aria-hidden="true" />
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                {view.error}
              </p>
              <p className="max-w-md text-xs leading-relaxed text-muted-foreground/70">
                Only text sources (.java, .xml, .md, .gradle, .properties, .pro, .json) are
                previewable. Built binaries live under android/dist/.
              </p>
            </div>
          )}

          {view.status === 'ready' && view.data && (
            <div className="min-w-max py-3 font-mono text-[13px] leading-relaxed">
              {lines.map((line, index) => (
                <div key={index} className="flex hover:bg-accent/30">
                  <span className="w-12 shrink-0 select-none pr-4 text-right text-muted-foreground/45">
                    {index + 1}
                  </span>
                  <code className="whitespace-pre pr-6 text-foreground/90">
                    {line.length > 0 ? line : ' '}
                  </code>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
