import type { FeatureStatus } from '@/lib/lab/types';

/**
 * Feature checklist for the QA Dashboard. HAND-MAINTAINED, evidence-backed.
 * Rules:
 *  - a status may only be 'pass' with a concrete, verifiable evidence note
 *    (test suite, live probe with date, committed fix);
 *  - 'needs-device' means no emulator/physical device exists in this sandbox;
 *  - 'blocked' means an EXTERNAL limitation (policy/API), never a guessed result;
 *  - 'untested' means implemented but no executed test covers it.
 * This file is updated whenever new real evidence exists (e.g. after an E2E run).
 */
export interface FeatureCheck {
  id: string;
  name: string;
  area: 'Search' | 'Playback' | 'Library' | 'UI' | 'Diagnostics' | 'Web Lab';
  status: FeatureStatus;
  note: string;
}

export const FEATURE_CHECKS: FeatureCheck[] = [
  {
    id: 'ytm-search-parse',
    name: 'YTM search parsing (flat 2026 + legacy shelf layout)',
    area: 'Search',
    status: 'pass',
    note: 'YTM-PARSER-FIX-1 (commit ea305f6): 28/28 JVM tests + 28/28 web tests on the SAME sanitized fixtures (fixtures/ytm synced with android/app/src/test/resources/ytm).',
  },
  {
    id: 'ytm-live-search',
    name: 'YTM live search request (unauthenticated WEB_REMIX)',
    area: 'Search',
    status: 'pass',
    note: 'Live probe 2026-10-11: query "Lathi" → HTTP 200, 216,116 B, parsed Top result + Songs. Reproduced by the Web Lab /api/lab/search (same request contract as InnertubeClient).',
  },
  {
    id: 'ytm-remote-playback',
    name: 'YTM remote playback (stream resolution)',
    area: 'Playback',
    status: 'blocked',
    note: 'Player endpoint returns playabilityStatus=LOGIN_REQUIRED for unauthenticated clients (verified 2026-10-11, /tmp/yt_player.json). No bypass is implemented by policy; app surfaces typed SourceException.UNAVAILABLE.',
  },
  {
    id: 'search-diagnostics',
    name: 'Search diagnostics (HTTP-success ≠ search-works)',
    area: 'Diagnostics',
    status: 'pass',
    note: 'SettingsActivity now runs a real search probe and reports "Connected · search OK (N results)" vs "no data" vs "Unreachable" (AUDIT-1 Finding C fix).',
  },
  {
    id: 'lrc-lyrics',
    name: 'LRC lyrics parsing (synced/unsynced)',
    area: 'Library',
    status: 'pass',
    note: 'LrcParserTest 7/7 JVM tests (+1 new multi-item parser test → android suite now 29). Web mirror: 15 vitest tests incl. all JVM golden expectations; Lyrics Lab tab parses fixtures interactively.',
  },
  {
    id: 'local-playback',
    name: 'Local file playback + background service (Media3)',
    area: 'Playback',
    status: 'needs-device',
    note: 'Builds and unit-tested on JVM, but audio output / foreground service / notification need a real device. Instrumented smoke test exists, not run here.',
  },
  {
    id: 'library-room',
    name: 'Library persistence (Room: favorites, playlists, history, queue)',
    area: 'Library',
    status: 'needs-device',
    note: 'Room requires an Android runtime for DAO verification; no instrumented tests executed in this environment.',
  },
  {
    id: 'sleep-timer',
    name: 'Sleep timer (session command)',
    area: 'Playback',
    status: 'untested',
    note: 'Implemented in v1.1.0 (PlaybackService custom command). No unit test, no device test.',
  },
  {
    id: 'playback-speed',
    name: 'Playback speed (0.75×–2×)',
    area: 'Playback',
    status: 'untested',
    note: 'Implemented in v1.1.0, persisted via SettingsRepository. No executed test.',
  },
  {
    id: 'share-sheet',
    name: 'Share track (v1.2.0, in-flight)',
    area: 'UI',
    status: 'untested',
    note: 'Committed as part of v1.2.0 WIP (e86e3e8). No test coverage yet.',
  },
  {
    id: 'top-tracks',
    name: 'Top Tracks (play counts, v1.2.0, in-flight)',
    area: 'UI',
    status: 'untested',
    note: 'Committed as part of v1.2.0 WIP. No test coverage yet.',
  },
  {
    id: 'weblab-parser-harness',
    name: 'Web Lab TS parser harness (mirror of Java parser)',
    area: 'Web Lab',
    status: 'pass',
    note: '28/28 vitest tests including golden expectations copied from YtMusicSearchParserTest. Fixture drift check: node scripts/sync-fixtures.mjs --check.',
  },
  {
    id: 'weblab-fixture-sync',
    name: 'Shared fixture pipeline (web ⇄ Android)',
    area: 'Web Lab',
    status: 'pass',
    note: 'fixtures/ytm is canonical; sync script verified no drift between web and Android copies.',
  },
  {
    id: 'weblab-e2e',
    name: 'Web Lab browser E2E (agent-browser)',
    area: 'Web Lab',
    status: 'pass',
    note: 'Golden path verified in a real browser: dashboard real numbers, live search (HTTP 200 · LATHI), offline fixture parsing, add-fixture, prototype play/queue-drag/favorites/error-retry, parity + project tabs, mobile 390px without horizontal scroll, sticky footer both states. Screenshots: data/e2e-*.png.',
  },
  {
    id: 'weblab-lyrics-lab',
    name: 'Lyrics Lab (LRC parser harness + synced preview)',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-7: /api/lab/lrc + Lyrics Lab tab (fixture load, paste, parse stats, scrub-driven active-line highlight). E2E verified: active line follows the scrubber; Now Playing shows labeled demo lyrics synced to the simulated clock.',
  },
];
