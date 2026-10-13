'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUp,
  Database,
  LayoutDashboard,
  Music,
  Package,
  Radio,
  Search,
  Smartphone,
  Subtitles,
  Table2,
} from 'lucide-react';

import { AudiusTab } from '@/components/lab/audius-tab';
import { DashboardTab } from '@/components/lab/dashboard-tab';
import { FixtureTesterTab } from '@/components/lab/fixture-tester-tab';
import { LyricsTab } from '@/components/lab/lyrics-tab';
import { ParityTab } from '@/components/lab/parity-tab';
import { ProjectTab } from '@/components/lab/project-tab';
import { PrototypeTab } from '@/components/lab/prototype-tab';
import { SearchPlaygroundTab } from '@/components/lab/search-playground-tab';
import { VersionBadge } from '@/components/lab/version-badge';
import { Button } from '@/components/ui/button';
import type { LabTab } from '@/lib/lab/store';
import { useLabStore } from '@/lib/lab/store';

const TABS: Array<{ id: LabTab; label: string; icon: typeof Search }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'playground', label: 'Search Playground', icon: Search },
  { id: 'fixtures', label: 'Fixtures & Parser', icon: Database },
  { id: 'lyrics', label: 'Lyrics Lab', icon: Subtitles },
  { id: 'prototype', label: 'Prototype', icon: Smartphone },
  { id: 'audius', label: 'Audius Player', icon: Radio },
  { id: 'parity', label: 'Parity Matrix', icon: Table2 },
  { id: 'project', label: 'Project', icon: Package },
];

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));

function tabFromHash(): LabTab | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace('#', '');
  return VALID_TABS.has(hash) ? (hash as LabTab) : null;
}

/** True when the event target is a text-entry surface — shortcuts must not steal those keys. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (target === null || !(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

export default function WebLabPage() {
  const activeTab = useLabStore((s) => s.activeTab);
  const setActiveTab = useLabStore((s) => s.setActiveTab);
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Restore persisted user data + honor deep links like /#playground.
  useEffect(() => {
    void useLabStore.persist.rehydrate();
    const fromHash = tabFromHash();
    if (fromHash !== null) setActiveTab(fromHash);
    const onHashChange = () => {
      const hash = tabFromHash();
      if (hash !== null) setActiveTab(hash);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [setActiveTab]);

  // Heartbeat for the simulated prototype playback.
  useEffect(() => {
    const id = setInterval(() => useLabStore.getState().tick(), 250);
    return () => clearInterval(id);
  }, []);

  // Keyboard shortcuts: 1–7 switch lab sections (WEB-LAB-9). Ignored while typing
  // and when any modifier is held, so text entry and browser shortcuts win.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (event.key >= '1' && event.key <= '8') {
        const index = Number(event.key) - 1;
        const tab = TABS[index];
        if (tab === undefined) return;
        event.preventDefault();
        setActiveTab(tab.id);
        window.history.replaceState(null, '', `#${tab.id}`);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setActiveTab]);

  // Floating scroll-to-top appears only after real scrolling.
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 320);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const selectTab = (tab: LabTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${tab}`);
    }
  };

  return (
    <div className="rm-theme flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        {/* Slim gradient accent — ties the chrome to the app theme without a heavy banner. */}
        <div
          className="h-0.5 w-full bg-gradient-to-r from-transparent via-primary/60 to-transparent"
          aria-hidden="true"
        />
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                <Music className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold leading-tight">Ridho Music Web Lab</h1>
                <p className="truncate text-xs text-muted-foreground">
                  QA harness for the Android app — real fixtures, real parser, honest results
                </p>
              </div>
            </div>
            <VersionBadge />
          </div>
          <nav aria-label="Lab sections" className="-mx-1 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-1 px-1">
              {TABS.map((tab, index) => {
                const Icon = tab.icon;
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => selectTab(tab.id)}
                    aria-current={selected ? 'page' : undefined}
                    title={`${tab.label} — shortcut ${index + 1}`}
                    className={`rm-nav-pill relative flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm transition-colors ${
                      selected
                        ? 'text-primary'
                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                    }`}
                    data-active={selected ? 'true' : 'false'}
                  >
                    {selected && (
                      <motion.span
                        layoutId="lab-tab-pill"
                        className="absolute inset-0 rounded-lg bg-primary/15 ring-1 ring-primary/25"
                        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                        aria-hidden="true"
                      />
                    )}
                    <Icon className="relative h-4 w-4" aria-hidden="true" />
                    <span className="relative">{tab.label}</span>
                    <kbd
                      className="relative hidden rounded border border-border bg-background/60 px-1 font-mono text-[9px] leading-[1.4] text-muted-foreground sm:inline"
                      aria-hidden="true"
                    >
                      {index + 1}
                    </kbd>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          {activeTab === 'dashboard' && <DashboardTab />}
          {activeTab === 'playground' && <SearchPlaygroundTab />}
          {activeTab === 'fixtures' && <FixtureTesterTab />}
          {activeTab === 'lyrics' && <LyricsTab />}
          {activeTab === 'prototype' && <PrototypeTab />}
          {activeTab === 'audius' && <AudiusTab />}
          {activeTab === 'parity' && <ParityTab />}
          {activeTab === 'project' && <ProjectTab />}
        </motion.div>
      </main>

      {/* Scroll-to-top — appears only after the page has actually scrolled. */}
      {showScrollTop && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          className="fixed bottom-20 right-4 z-30 sm:bottom-6 sm:right-6"
        >
          <Button
            size="icon"
            variant="outline"
            className="h-11 w-11 rounded-full border-border bg-background/90 shadow-lg backdrop-blur hover:bg-secondary"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Scroll back to top"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </Button>
        </motion.div>
      )}

      <footer className="mt-auto border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Ridho Music Web Lab — mirrors the Java parser contracts (search + LRC) on shared fixtures
            (<span className="font-mono">fixtures/</span> ⇄ <span className="font-mono">app/src/test/resources/</span>).
            Keys <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">1</kbd>–
            <kbd className="rounded border border-border bg-background px-1 font-mono text-[10px]">8</kbd> switch
            sections.
          </p>
          <p>
            Prototype playback is <span className="font-medium text-foreground/80">simulated</span>; the{' '}
            <span className="font-medium text-foreground/80">Audius Player</span> tab streams{' '}
            <span className="font-medium text-primary">real tracks</span> via the official Audius API. The Android app
            streams via Media3.
          </p>
        </div>
      </footer>
    </div>
  );
}
