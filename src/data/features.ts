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
  area: 'Search' | 'Playback' | 'Library' | 'UI' | 'Diagnostics' | 'Web Lab' | 'Android';
  status: FeatureStatus;
  note: string;
}

export const FEATURE_CHECKS: FeatureCheck[] = [
  {
    id: 'ytm-search-parse',
    name: 'YTM search parsing (flat 2026 + legacy shelf layout)',
    area: 'Search',
    status: 'pass',
    note: 'YTM-PARSER-FIX-1 (commit ea305f6): android suite now 29 JVM tests (WEBLAB-7 added a multi-item lock test); web mirror 59 vitest tests (28 parser + 15 LRC + 12 fixture-diff + 4 qa-report) on the SAME sanitized fixtures (fixtures/ytm synced with android/app/src/test/resources/ytm).',
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
    note: '28 parser vitest tests (59 total across parser/LRC/diff/report) including golden expectations copied from YtMusicSearchParserTest. Fixture drift check: node scripts/sync-fixtures.mjs --check.',
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
  {
    id: 'weblab-fixture-diff',
    name: 'Fixture Diff Lab (A/B parse comparison)',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-8: src/lib/lab/fixture-diff.ts (12 unit tests: add/remove/change/unchanged, section deltas, renderer-census movement, determinism) + Diff panel in Fixtures tab. E2E verified: legacy→live diff shows +8 added · −2 removed · 2→8 items with section and renderer deltas.',
  },
  {
    id: 'weblab-qa-report',
    name: 'QA report export (Markdown) + pass-trend sparkline',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-8: client-side Markdown report from the RECORDED run only (4 unit tests; includes an honesty section listing what is NOT verified) + dependency-free SVG trend of passed assertions per run. E2E verified: download produced a real file with real numbers.',
  },
  {
    id: 'weblab-prototype-chart-menu',
    name: 'Prototype: play-count chart + queue context menu',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-8: animated Top Tracks bar chart (labeled SIMULATED, browser-local counts) and right-click/long-press queue menu (play, play next, move top/bottom, favorite, copy info with honest clipboard states, remove). E2E verified: chart matches play actions; move-to-top reorders; favorite persists.',
  },
  {
    id: 'weblab-live-capture',
    name: 'Live search → capture as fixture (real-corpus growth)',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-9: /api/lab/search accepts includeRaw (untouched response root); Search Playground saves it via POST /api/lab/fixtures with query+capturedAt provenance (origin flips to real-capture); name suggested by unit-tested suggestFixtureName. 7+4 unit tests cover naming/validation.',
  },
  {
    id: 'weblab-diff-vs-live',
    name: 'Fixture Diff vs LIVE search (drift-on-demand visibility)',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-9: Diff panel side B gains a LIVE mode — runs the exact InnerTube request, reassembles a ParseResult via unit-tested parseResultFromLivePayload (honest null on shape mismatch), labels the run amber "live · X ms". Live failures surface as-is, never as empty parses.',
  },
  {
    id: 'weblab-queue-shuffle',
    name: 'Queue shuffle (simulated) — current track keeps its slot',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-9: pure shuffledQueue (Fisher–Yates, injectable RNG, 6 seeded unit tests: anchor keeps index, no mutation, deterministic) + store action + toolbar button + queue context-menu entry, all labeled simulated.',
  },
  {
    id: 'weblab-shortcuts-polish',
    name: 'Keyboard shortcuts (1–7) + dashboard pass-rate donut',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-9: number keys switch lab sections (ignored while typing / with modifiers; kbd hints in nav + footer), floating scroll-to-top, animated SVG pass-rate donut + "recorded X ago" chip (relativeTime unit-tested, hydration-safe).',
  },
  {
    id: 'weblab-golden-expectations',
    name: 'Golden parse expectations — drift alarm in run-qa (fixture ↔ parser contract)',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-10: fixtures/ytm/expectations.json locks the verified-current parse shape of every fixture (from the same goldens as YtMusicSearchParserTest). bun scripts/check-expectations.ts runs in run-qa.sh as a recorded suite (7/7 hold) — red on ANY shape drift; collect-qa reads the machine summary /tmp/rm-qa/golden.json (no stale numbers). 10 unit tests cover evaluation + schema guard.',
  },
  {
    id: 'weblab-golden-ui',
    name: 'Golden expectations live view in Fixtures tab',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-10: GoldenExpectationsCard evaluates every contract in-browser with the same parser/lib, per-fixture golden ✓ / DRIFT badges with honest failure lines, "(no golden)" visibility for uncovered fixtures, validateError surfaced when expectations.json itself is broken.',
  },
  {
    id: 'weblab-search-history',
    name: 'Search Playground history (re-run chips, persisted in this browser)',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-10/11: every live run records its real outcome (HTTP status, item count, duration, or typed error) to the store (cap 8, consecutive-dup replace); chips re-run the query on click; failures styled red; clear button. Persisted via localStorage since WEBLAB-11 — real outcomes survive reloads, never invented.'
  },
  {
    id: 'weblab-repeat-one',
    name: 'Repeat modes off / all / one (simulated) with provable tick logic',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-10/11: pure computeTick + computeNextIndex (unit-tested: advance/restart/progress, zero-length guard, stop-at-queue-end, wrap-around) drive the simulated clock; the Now Playing button cycles off → all → one with per-state icon, aria-pressed and honest badge; auto-advance honors the mode while manual next/previous keeps wrap-around.'
  },
  {
    id: 'weblab-golden-parity-android',
    name: 'Android-side golden contract parity (JUnit evaluates the same expectations.json)',
    area: 'Android',
    status: 'pass',
    note: 'WEBLAB-11: GoldenExpectationsTest evaluates the SAME fixtures/ytm/expectations.json (synced verbatim by sync-fixtures.mjs) with the real YtMusicSearchParser — parser parity enforced in BOTH directions. Collects all drift into one honest report; coverage guard fails if a synced live fixture has no golden entry; schema guard requires counts + provenance note per entry. Negative-tested: corrupting a golden value turns the suite red.',
  },
  {
    id: 'weblab-lrc-upload',
    name: 'Lyrics Lab real .lrc file upload (client-side, honest provenance)',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-11: pick a local .lrc/.txt file — parsed with the same TS mirror via FileReader; the file never leaves the browser (stated in the source note); file name + size badge; parse output identical to fixture/paste paths.',
  },
  {
    id: 'weblab-styling-details',
    name: 'Playback + dashboard styling details (equalizer, gradient slider, suite glow, nav lift)',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-11: CSS equalizer bars on playing rows + Now Playing (pure CSS, prefers-reduced-motion aware); teal→amber gradient on the seek slider; pass/fail glow on dashboard suite cards; nav pill hover lift with active shadow.',
  },
  {
    id: 'weblab-mini-player-upgrade',
    name: 'Mini-player: progress hairline, repeat chip outside the sheet, queue-position chip',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-12: the persistent bottom bar gains an aria-labeled progress hairline (pure progressPercent, unit-tested clamp + NaN safety), a repeat chip cycling the same tri-state as the sheet (accent + aria-pressed when active), a mono "3/6" queue-position badge (queuePositionLabel, unit-tested), and an equalizer overlay pill on the artwork while playing.',
  },
  {
    id: 'weblab-lrc-library',
    name: 'My LRC library: browser-local saved lyrics (upsert, cap 12, honest limits)',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-12: pure upsertLrcEntry (replace-by-name in place, oldest falls off the cap, 256 KB guard, honest empty-name/too-large rejections — unit-tested) + zustand persistence; Lyrics Lab save dialog with sensible default names, load-back chips with saved-date tooltips, destructive-styled remove, toast feedback; content NEVER leaves the browser.',
  },
  {
    id: 'weblab-corpus-stats',
    name: 'Dashboard Lab-corpus card (live endpoint counts)',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-12: dashboard card shows real counts fetched from /api/lab/fixtures (built-in + user captures), /api/lab/expectations (golden contracts) and /api/lab/lrc (LRC fixtures); a failed endpoint hides its number instead of faking zero-context data.',
  },
  {
    id: 'weblab-lrc-export',
    name: 'LRC library export (real .lrc download per entry)',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-13: every library chip gains an export button — client-side Blob download with a unit-tested safe file name (exportLrcFileName: path-separator stripping, control-char removal, guaranteed .lrc extension, lyrics.lrc fallback); toast confirms the real file name.',
  },
  {
    id: 'weblab-dashboard-history',
    name: 'Dashboard Recent-searches card with one-click live replay',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-13: the SAME persisted history the playground shows surfaces on the dashboard as status-dotted chips (real outcomes: items · ms · age, failures rose-tinted with errorKind); clicking hands the query to the playground via a consume-once replayQuery store field and immediately re-runs it against the live API.',
  },
  {
    id: 'weblab-queue-repeat-chip',
    name: 'Queue toolbar repeat chip (tri-state visible in queue context)',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-13: the queue toolbar shows the current repeat mode as an explicit chip (Repeat off / Repeat all / Repeat 1) cycling the same store state as the sheet and mini-player; active states get an amber accent plus a one-shot pulse animation (reduced-motion aware).',
  },
  {
    id: 'weblab-live-golden-probe',
    name: 'Live golden probe (LIVE shape vs recorded contract, experimental)',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-14: the Fixtures tab re-runs a fixture\'s stored query against the LIVE API and evaluates the shape against its golden contract (unit-tested liveProbeVerdict); drift is amber and explicitly labeled an investigation signal — the stored-fixture suite stays the authoritative alarm. Honest non-verdicts for fixtures without a golden or a stored query.',
  },
  {
    id: 'weblab-queue-up-next-badge',
    name: 'Queue per-row playback-relationship badges (up next / ends queue / repeats)',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-14: queue rows show their relation to playback via queueRowBadge — same computeNextIndex semantics as the tick logic, so the badge can never disagree with playback (unit-tested incl. the repeat-one case where no row can claim "up next"); teal up-next, amber ends-queue, violet repeats.',
  },
  {
    id: 'weblab-lrc-copy',
    name: 'LRC library per-entry clipboard copy (honest 2-state)',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-14: every library chip gains a copy button writing the raw LRC to the clipboard; blocked contexts get an explicit failure toast pointing at Export instead — never a false success.',
  },
  {
    id: 'weblab-contract-refresh',
    name: 'Deliberate Lathi contract refresh with declared lineage',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-15: the live probe caught the 2026-10-11 Lathi capture drifting (response grew 8→30 section-list blocks, new Videos shelf), so the contract was re-captured LIVE on 2026-10-12 and hand-locked to the verified harness parse (5 sections · 15 tracks). The registry declares supersedes/supersededBy lineage — the old capture stays frozen as drift history, nothing was edited silently. Both web (8/8) and Android golden suites evaluate the refreshed contract.',
  },
  {
    id: 'weblab-live-probe-pipeline',
    name: 'Live probe recorded as a NON-GATING run-qa signal suite',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-15: scripts/live-probe.ts re-runs every fixture query that has both a golden and a stored query against the LIVE API inside run-qa.sh — recorded (dashboard row + markdown report), never gating (always exit 0 by design; live drift is an investigation signal, the stored-fixture suites stay authoritative). First recorded run: live drift on 4/4 probed fixtures — LIVE responses are volatile minute-to-minute, which is exactly why this suite must not gate.',
  },
  {
    id: 'weblab-fixture-lineage-ui',
    name: 'Fixture lineage chips + probe successor hand-off',
    area: 'Web Lab',
    status: 'pass',
    note: 'WEBLAB-15: refreshed captures carry GitBranch lineage chips in the fixture list (amber "superseded by", teal "supersedes"); the live probe card detects a replaced contract, explains why the old capture is kept, and offers a one-click switch to the successor. Shared live-search client extracted so the API route and the pipeline probe send byte-identical requests (unit-tested).',
  },
];
