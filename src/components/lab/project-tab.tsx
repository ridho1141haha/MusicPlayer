'use client';

import { useEffect, useState } from 'react';
import {
  FolderTree,
  ListChecks,
  ScrollText,
} from 'lucide-react';

import { Architecture } from '@/components/dashboard/architecture';
import { BuildStats } from '@/components/dashboard/build-stats';
import { CriteriaTable } from '@/components/dashboard/criteria-table';
import { DocsTabs } from '@/components/dashboard/docs-tabs';
import { Hero } from '@/components/dashboard/hero';
import { SectionHeading } from '@/components/dashboard/section-heading';
import { SourceBrowser } from '@/components/dashboard/source-browser';
import { YtmCard } from '@/components/dashboard/ytm-card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProjectPayload, TreeNode } from '@/lib/ridho';

/**
 * The original v1.x delivery dashboard, preserved 1:1 as a Web Lab tab so no
 * previously shipped feature disappears (the / route now hosts the Web Lab).
 */
export function ProjectTab() {
  const [data, setData] = useState<ProjectPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/project', { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as ProjectPayload;
        if (!cancelled) setData(payload);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  if (error !== null) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Could not load project data</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => setNonce((n) => n + 1)}>
          Retry
        </Button>
      </Alert>
    );
  }

  if (data === null) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-40 rounded-xl" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const emptyTree: TreeNode = { name: '', path: '', type: 'dir', children: [] };
  const tree: TreeNode = data.tree ?? emptyTree;
  // WEBLAB-22B: the download card serves the CURRENT validated artifact
  // (versioned filename), falling back to the pinned dist copy.
  const debugApk = data.apks.served ?? data.apks.debug;
  const releaseApk = data.apks.release;

  return (
    <div className="space-y-14">
      <Hero debugApk={debugApk} releaseApk={releaseApk} version={data.version} />

      <section id="build" className="scroll-mt-24">
        <SectionHeading
          icon={ListChecks}
          eyebrow="Verification"
          title="Build & tests"
          description="Evidence-based: APK files on disk + the last recorded run-qa execution (timestamps & exit codes) — no hardcoded numbers."
        />
        <BuildStats
          debug={debugApk}
          release={releaseApk}
          tests={data.tests}
          buildChecks={data.buildChecks}
          qaRecordedAt={data.qaRecordedAt}
          toolchainComplete={data.toolchain.complete}
        />
      </section>

      <section id="criteria" className="scroll-mt-24">
        <SectionHeading icon={ListChecks} eyebrow="Acceptance" title="Criteria A–L" description="Verified vs requires-device — kept honest." />
        <CriteriaTable criteria={data.criteria} />
      </section>

      <section id="architecture" className="scroll-mt-24">
        <Architecture />
      </section>

      <section id="source" className="scroll-mt-24">
        <SectionHeading icon={FolderTree} eyebrow="Browse" title="Source browser" description="Sandboxed view of android/ served by /api/file." />
        <SourceBrowser tree={tree} />
      </section>

      <section id="youtube-music" className="scroll-mt-24">
        <YtmCard />
      </section>

      <section id="docs" className="scroll-mt-24">
        <SectionHeading icon={ScrollText} eyebrow="Docs" title="README, CHANGELOG, notices" description="Served verbatim from the repository." />
        <DocsTabs />
      </section>
    </div>
  );
}
