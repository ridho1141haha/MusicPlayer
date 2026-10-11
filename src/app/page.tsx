'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  Code2,
  Download,
  FolderTree,
  FlaskConical,
  ListChecks,
  Music,
  RefreshCw,
  ScrollText,
  TriangleAlert,
  Youtube,
} from 'lucide-react';

import { Architecture } from '@/components/dashboard/architecture';
import { BuildStats } from '@/components/dashboard/build-stats';
import { CriteriaTable } from '@/components/dashboard/criteria-table';
import { DocsTabs } from '@/components/dashboard/docs-tabs';
import { Hero } from '@/components/dashboard/hero';
import { SectionHeading } from '@/components/dashboard/section-heading';
import { SourceBrowser } from '@/components/dashboard/source-browser';
import { YtmCard } from '@/components/dashboard/ytm-card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProjectPayload } from '@/lib/ridho';

const NAV_LINKS = [
  { href: '#build', label: 'Build' },
  { href: '#criteria', label: 'Criteria' },
  { href: '#architecture', label: 'Architecture' },
  { href: '#source', label: 'Source' },
  { href: '#youtube-music', label: 'YT Music' },
  { href: '#docs', label: 'Docs' },
] as const;

type PageState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | { status: 'ready'; data: ProjectPayload };

function Reveal({ children, id }: { children: ReactNode; id: string }) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
      className="scroll-mt-20"
    >
      {children}
    </motion.section>
  );
}

function LoadingView() {
  return (
    <div
      className="space-y-16 py-10 sm:py-16"
      aria-busy="true"
      aria-label="Loading project data"
    >
      <div className="space-y-6 pt-8">
        <Skeleton className="h-14 w-14 rounded-2xl" />
        <Skeleton className="h-10 w-72 max-w-full" />
        <Skeleton className="h-5 w-full max-w-xl" />
        <div className="flex flex-wrap gap-2">
          {[80, 110, 90, 170, 80, 90].map((width, index) => (
            <Skeleton key={index} className="h-6 rounded-md" style={{ width }} />
          ))}
        </div>
        <Skeleton className="h-12 w-72 max-w-full rounded-md" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Skeleton key={index} className="h-36 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

function ErrorView({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="flex justify-center py-24">
      <div
        role="alert"
        className="w-full max-w-md rounded-xl border border-amber-500/30 bg-card p-6 text-center shadow-sm"
      >
        <TriangleAlert className="mx-auto h-10 w-10 text-amber-400" aria-hidden="true" />
        <h2 className="mt-4 text-lg font-semibold text-foreground">
          Couldn&apos;t load project data
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          The /api/project endpoint returned an error: {error}
        </p>
        <Button onClick={onRetry} className="mt-5 h-11 px-6">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      </div>
    </div>
  );
}

function Dashboard({ data }: { data: ProjectPayload }) {
  return (
    <>
      <Hero debugApk={data.apks.debug} releaseApk={data.apks.release} />

      <div className="space-y-16 py-10 sm:space-y-24 sm:py-16">
        <Reveal id="build">
          <SectionHeading
            icon={FlaskConical}
            eyebrow="Deliverables"
            title="Build & verification"
            description={`Every number below is read live from the repository: APK sizes from android/dist/, test totals parsed from the JUnit XML under app/build/test-results/. ${data.counts.javaFiles} Java files · ${data.counts.javaLines.toLocaleString('en-US')} lines of Java · ${data.counts.xmlResources} XML resources · ${data.counts.totalSourceFiles} tracked files.`}
          />
          <BuildStats
            debug={data.apks.debug}
            release={data.apks.release}
            tests={data.tests}
            buildChecks={data.buildChecks}
          />
        </Reveal>

        <Reveal id="criteria">
          <SectionHeading
            icon={ListChecks}
            eyebrow="Acceptance criteria"
            title="Criteria A–L — honest status"
            description="Verified means proven by an executed build or unit test in the sandbox. Requires-device means implemented but only observable on physical Android hardware."
          />
          <CriteriaTable criteria={data.criteria} />
        </Reveal>

        <Reveal id="architecture">
          <SectionHeading
            icon={FolderTree}
            eyebrow="Under the hood"
            title="Architecture"
            description="One :app module, strict package-level separation, Media3 at the core. Below is the real package structure from android/README.md §3 and the seams that keep it testable."
          />
          <Architecture />
        </Reveal>

        <Reveal id="source">
          <SectionHeading
            icon={Code2}
            eyebrow="No black boxes"
            title="Source browser"
            description="Read the actual shipped code. The tree below is generated from the repository on the server; clicking a file fetches its contents (first 100 KB) through /api/file."
          />
          <SourceBrowser tree={data.tree} />
        </Reveal>

        <Reveal id="youtube-music">
          <SectionHeading
            icon={Youtube}
            eyebrow="Transparency"
            title="YouTube Music integration status"
            description="Search works. Remote playback is explicitly best-effort — and the code refuses to cheat. The full engineering analysis ships in the README."
          />
          <YtmCard />
        </Reveal>

        <Reveal id="docs">
          <SectionHeading
            icon={ScrollText}
            eyebrow="Documentation"
            title="README · Changelog · Notices"
            description="Served straight from the repository through /api/file — the same files a developer gets when cloning the project."
          />
          <DocsTabs />
        </Reveal>
      </div>
    </>
  );
}

export default function Home() {
  const [state, setState] = useState<PageState>({ status: 'loading' });

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const res = await fetch('/api/project');
      const json = (await res.json()) as ProjectPayload & { error?: string };
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setState({ status: 'ready', data: json });
    } catch (err) {
      setState({
        status: 'error',
        error: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rm-theme flex min-h-screen flex-col bg-[#0d1013] text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-[#0d1013]/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <a
            href="#top"
            className="flex min-w-0 items-center gap-2"
            aria-label="Ridho Music — back to top"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-primary/30 bg-primary/10"
              aria-hidden="true"
            >
              <Music className="h-4 w-4 text-[#7fd8ce]" />
            </span>
            <span className="truncate text-sm font-semibold tracking-tight">Ridho Music</span>
          </a>
          <nav aria-label="Page sections" className="hidden items-center gap-1 lg:flex">
            {NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground"
              >
                {link.label}
              </a>
            ))}
          </nav>
          <Button asChild size="sm" className="h-9 shrink-0">
            <a href="/ridho-music-v1.1.0-debug.apk" download aria-label="Download debug APK">
              <Download className="h-4 w-4" aria-hidden="true" />
              APK
            </a>
          </Button>
        </div>
      </header>

      <main id="top" className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          {state.status === 'loading' && <LoadingView />}
          {state.status === 'error' && <ErrorView error={state.error} onRetry={load} />}
          {state.status === 'ready' && <Dashboard data={state.data} />}
        </div>
      </main>

      <footer className="mt-auto border-t border-border/70 bg-card/40 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <p>
            Ridho Music · MIT License · Built with Media3 ExoPlayer — no ads, no trackers, no
            accounts.
          </p>
          <p className="font-mono">APK: Android 7.0+ (API 24)</p>
        </div>
      </footer>
    </div>
  );
}
