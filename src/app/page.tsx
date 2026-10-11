'use client';

import { useEffect } from 'react';
import {
  Database,
  LayoutDashboard,
  Music,
  Package,
  Search,
  Smartphone,
  Table2,
} from 'lucide-react';

import { DashboardTab } from '@/components/lab/dashboard-tab';
import { FixtureTesterTab } from '@/components/lab/fixture-tester-tab';
import { ParityTab } from '@/components/lab/parity-tab';
import { ProjectTab } from '@/components/lab/project-tab';
import { PrototypeTab } from '@/components/lab/prototype-tab';
import { SearchPlaygroundTab } from '@/components/lab/search-playground-tab';
import { Badge } from '@/components/ui/badge';
import type { LabTab } from '@/lib/lab/store';
import { useLabStore } from '@/lib/lab/store';

const TABS: Array<{ id: LabTab; label: string; icon: typeof Search }> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'playground', label: 'Search Playground', icon: Search },
  { id: 'fixtures', label: 'Fixtures & Parser', icon: Database },
  { id: 'prototype', label: 'Prototype', icon: Smartphone },
  { id: 'parity', label: 'Parity Matrix', icon: Table2 },
  { id: 'project', label: 'Project', icon: Package },
];

const VALID_TABS = new Set<string>(TABS.map((t) => t.id));

function tabFromHash(): LabTab | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash.replace('#', '');
  return VALID_TABS.has(hash) ? (hash as LabTab) : null;
}

export default function WebLabPage() {
  const activeTab = useLabStore((s) => s.activeTab);
  const setActiveTab = useLabStore((s) => s.setActiveTab);

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

  const selectTab = (tab: LabTab) => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${tab}`);
    }
  };

  return (
    <div className="rm-theme flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                <Music className="h-4.5 w-4.5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold leading-tight">Ridho Music Web Lab</h1>
                <p className="truncate text-xs text-muted-foreground">
                  QA harness for the Android app — real fixtures, real parser, honest results
                </p>
              </div>
            </div>
            <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
              v1.2.0-wip
            </Badge>
          </div>
          <nav aria-label="Lab sections" className="-mx-1 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-1 px-1">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const selected = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => selectTab(tab.id)}
                    aria-current={selected ? 'page' : undefined}
                    className={`flex min-h-[40px] items-center gap-2 whitespace-nowrap rounded-lg px-3 text-sm transition-colors ${
                      selected
                        ? 'bg-primary/15 font-medium text-primary'
                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'playground' && <SearchPlaygroundTab />}
        {activeTab === 'fixtures' && <FixtureTesterTab />}
        {activeTab === 'prototype' && <PrototypeTab />}
        {activeTab === 'parity' && <ParityTab />}
        {activeTab === 'project' && <ProjectTab />}
      </main>

      <footer className="mt-auto border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-1 px-4 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>
            Ridho Music Web Lab — mirrors the Java parser contract on shared fixtures
            (<span className="font-mono">fixtures/ytm</span> ⇄ <span className="font-mono">app/src/test/resources/ytm</span>).
          </p>
          <p>
            Prototype playback is <span className="font-medium text-foreground/80">simulated</span> — the Android app
            streams via Media3.
          </p>
        </div>
      </footer>
    </div>
  );
}
