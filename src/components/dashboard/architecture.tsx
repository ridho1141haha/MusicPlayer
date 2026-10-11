'use client';

import { MoveRight } from 'lucide-react';

/** Package layout — matches android/README.md §3 exactly (accurate, not decorative). */
const PACKAGE_TREE = `com.ridho.music
├── domain/
│   ├── model/        Track, SearchSection (immutable, JSON-serializable)
│   └── source/       MusicSource interface, SourceException (typed errors)
├── data/
│   ├── entity/dao/db Room entities, DAOs, AppDatabase
│   └── repository/   LibraryRepository (favorites/history/playlists/queue/local)
├── player/           PlaybackService (MediaSessionService), MediaItemConverter
├── playback/         PlaybackRepository (MediaController facade for the UI)
├── source/           LocalMusicSource (SAF), yt/ (experimental YouTube Music)
├── lyrics/           LrcParser (pure Java), LyricsProvider, EmbeddedLyricsProvider
├── settings/         SettingsRepository (SharedPreferences)
└── ui/               MainActivity + fragments, Now Playing, Queue sheet,
                      Playlist detail, Settings, adapters, helpers`;

const KEY_SEAMS: { title: string; body: string }[] = [
  {
    title: 'MusicSource contract',
    body: 'The only seam between providers and the engine. Provider logic (InnerTube JSON, SAF traversal) never leaks into player/ or ui/.',
  },
  {
    title: 'PlaybackRepository facade',
    body: 'The only way the UI talks to the playback engine — a MediaController wrapper with an observable Listener. No direct session wiring in fragments.',
  },
  {
    title: 'Service-side stream resolution',
    body: 'Stream URIs resolve inside MediaSession.Callback#onAddMediaItems on an IO executor. The UI never performs resolution, so controls stay responsive.',
  },
  {
    title: 'Track JSON extras',
    body: 'Track travels as JSON inside MediaMetadata#extras, Room snapshot columns and the queue table — one serialization path, unit-tested.',
  },
  {
    title: 'Hand-rolled ServiceLocator',
    body: 'No DI framework — three singletons and a source registry do not warrant a dependency graph. Deliberate, documented decision.',
  },
];

export function Architecture() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold text-foreground">Package layout — single :app module</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Package boundaries enforce the same decoupling rules multi-module Gradle would (verified by lint + review).
          </p>
        </div>
        <pre className="rm-scroll overflow-x-auto p-4 font-mono text-[11.5px] leading-relaxed text-foreground/85 sm:p-5 sm:text-xs">
          {PACKAGE_TREE}
        </pre>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3 sm:px-5">
          <h3 className="text-sm font-semibold text-foreground">Key seams</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            The four contracts that keep the codebase testable and swappable.
          </p>
        </div>
        <ul className="divide-y divide-border">
          {KEY_SEAMS.map((seam) => (
            <li key={seam.title} className="flex gap-3 p-4 sm:p-5">
              <MoveRight className="mt-0.5 h-4 w-4 shrink-0 text-[#7fd8ce]" aria-hidden="true" />
              <div>
                <p className="font-mono text-xs font-semibold text-foreground">{seam.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{seam.body}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
