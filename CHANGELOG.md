# Changelog — Ridho Music

Consolidated change history for the **Ridho Music Android app** (`android/`, the
product) and the **web delivery dashboard** (`src/`, the QA lab). The app-level
changelog with full per-version detail lives at
[android/CHANGELOG.md](android/CHANGELOG.md); build metadata for each APK lives
in `data/build-info-v<version>.json`. No credentials or secrets ever appear in
this file or in build metadata.

## Version history (concise)

| Version | versionCode | Date | Summary | Device-tested? |
|---|---|---|---|---|
| [1.4.0](android/CHANGELOG.md) | 8 | 2026-10-13 | **YouTube Music sign-in playback** (user-approved: official WebView login, encrypted on-device session, SAPISIDHASH web-auth — no bypass, no extraction) + honest playback-failure UX (StreamErrorBus, Snackbar/banner, "Open in YouTube Music" deep links) + unit suite 86/86. APK `ridho-music-v1.4.0-debug.apk`. | NOT RUN (no hardware; sign-in needs user's account) |
| [1.3.0](android/CHANGELOG.md) | 7 | 2026-10-13 | Audius source (official public API v1, no credentials) — search + native Media3 streaming behind the existing `MusicSource` contract; Settings toggle + diagnostics; unit suite 69/69. APK `ridho-music-v1.3.0-debug.apk`. | NOT RUN (no hardware) |
| [1.2.3](android/CHANGELOG.md) | 6 | 2026-10-13 | Jamendo official-API source (first APK release of the WEBLAB-22A work); history-real-playback fix; build traceability. APK `ridho-music-v1.2.3-debug.apk`. | NOT RUN (no hardware) |
| 1.2.2 | 5 | 2026-10-12 | Pre-reset build; verified installed on the Samsung Galaxy A05s (WEBLAB-20A-VERIFY). Source lost in a sandbox reset — **superseded by 1.2.3**. | YES (A05s, Android 15) |
| 1.2.1 | 4 | — | Unaccounted (presumed consumed by an intermediate pre-reset build). Treated as burned; never reused. | unknown |
| [1.2.0](android/CHANGELOG.md) | 3 | 2026-10-11 | WIP baseline the current tree was restored to. | NOT RUN |
| [1.1.0](android/CHANGELOG.md) | 2 | 2026-10-11 | Sleep timer (session command), playback speed chip. | NOT RUN |
| [1.0.0](android/CHANGELOG.md) | 1 | 2026-10-11 | First release: Media3 engine, local library (SAF), YTM source (experimental), Room persistence, lyrics, dark Material 3. | NOT RUN |

Web-lab evolution (non-APK, recorded in [worklog.md](worklog.md)): WEBLAB-8→16
built the evidence-based delivery dashboard (fixture lab, golden contracts,
live probes, mobile UX audit); WEBLAB-22A/B added the Jamendo credential
mechanism, sanitized live-API evidence records, and data-driven build
traceability (version badge + artifact serving parsed from the actual
`build.gradle`); WEBLAB-23 added the **Audius Player** tab — the first REAL
streaming playback in the web lab (official Audius public API, no credentials).

---

## Unreleased — WEBLAB-23 (web lab only; no APK, no versionCode change) — 2026-10-13

**Scope:** web preview (`src/`) exclusively. The Android APK, its source, and
its versioning are untouched by design (WEB QA ONLY).

### Added
- **Audius Player tab** (8th lab tab, shortcut `6`): real online music via the
  official Audius public API (https://docs.audius.co).
  - Search tracks, Trending (time window + genre filters), Underground.
  - Track metadata: title, artist, artwork, duration, genre, play count.
  - Playback through the documented stream endpoint
    (`/v1/tracks/{id}/stream?app_name=…`, 302 → CDN) with native range-seeking.
  - Full transport: play/pause, seek (with buffered-range layer),
    current-time/duration, volume + mute, next/previous (restart >3 s rule),
    auto-advance within the list context, buffering overlay, Media Session
    integration (lock-screen controls).
  - Honest states: loading skeletons, empty results, empty-query hint,
    load-more inline error with retry (network failures never silent),
    playback error banner with retry (verified by blocking the stream route).
  - Load-more pagination (offset-based, deduped).
- **API routes** (server-side, no secrets — Audius has none):
  `GET /api/audius/hosts` (registry discovery, 10-min cache, fallback host),
  `GET /api/audius/tracks` (search/trending/underground, host failover,
  8 s timeout, 60 s page cache, normalized payloads, typed error kinds).

### Files
- `src/lib/lab/audius.ts` (pure types/normalization/stream URL/paging helpers)
- `src/lib/lab/audius-server.ts` (host discovery + failover fetch + caches)
- `src/app/api/audius/hosts/route.ts`, `src/app/api/audius/tracks/route.ts`
- `src/hooks/use-audius-player.ts` (single-persistent-`<audio>` engine with
  full listener cleanup and resource release on unmount)
- `src/components/lab/audius-tab.tsx`, `src/app/page.tsx`, `src/lib/lab/store.ts`

### Verification (agent-browser, 2026-10-13 — all executed, none assumed)
- Search "long drive" → 12 real results; trending/underground/genre filters
  (Lo-Fi, Classical) → 12 each. 12/12 artwork images loaded (naturalWidth > 0).
- Playback: real audio advanced (0:00→0:03…), duration from stream metadata;
  pause froze time; resume advanced; seek-to-end auto-advanced to the next
  queued track; previous restarted >3 s / switched <3 s; volume Home/End +
  mute/unmute verified; buffered layer rendered (38.98% while streaming).
- Errors: blocked stream route → error banner → unroute + Retry → recovered;
  offline load-more → inline error, list preserved → Retry → 12→24 tracks.
- Loading: initial skeleton caught live (uncached genre query); load-more
  spinner caught; buffering overlay caught.
- Mobile 390 px: zero horizontal scroll; desktop two-column sticky player.
- Console: 0 errors / 0 warnings across the whole session.
- Regression: vitest 158/158, ESLint clean, all 8 tabs render, Project tab
  still data-driven (v1.2.3 / versionCode 6).

### Known limitations (honest)
- Volume is ignored by iOS Safari (platform limitation of `<audio>.volume`;
  desktop/Android browsers honor it) — noted in code.
- Audius full-text search can return 0 results for niche queries — explicit
  empty state with guidance is shown.
- The Prototype tab remains simulated by design (fixture QA harness); the
  footer states which tab streams real audio.

---

## 1.2.3 (versionCode 6) — 2026-10-13 · WEBLAB-22A + WEBLAB-22B

### Summary
Jamendo (official v3.0 API) becomes the app's first legal, free streaming
catalog behind the existing `MusicSource`/Media3 architecture — configured via
a gitignored client-id mechanism, verified live through real search and stream
resolution. WEBLAB-22B then fixed a real history bug found by source audit,
bumped the version for device installability, and produced a fully traced
debug APK.

### Bug fixes (root causes)
- **Queue restore polluted Recently Played** (`PlaybackService`): history was
  written on every non-repeat media-item transition, so the launch-time paused
  queue restore (`PLAYLIST_CHANGED`) recorded a row for a track that never
  played. Fix: new `HistoryPolicy` (pure JVM logic, 5 regression tests) —
  record only when playing + `STATE_READY` + new media-item id; repeat-one and
  same-track resume dedupe. Files: `player/HistoryPolicy.java` (new),
  `player/PlaybackService.java`, `player/HistoryPolicyTest.java` (new).
  Verification: **PASS** on JVM (unit suite 55/55); on-device **NOT RUN**.
- `scripts/setup-android-sdk.sh` exec-bit restore after sandbox resets
  (root-caused in WEBLAB-22A; verification PASS).

### Features & UI changes
- Jamendo source: search with real metadata + CC attribution (track-menu
  license entry + deed dialog), stable stream URLs (`audioformat=mp32`),
  typed `CONFIGURATION_REQUIRED`/`RATE_LIMITED` errors, Settings screen with
  runtime client-ID dialog (masked, Save/Clear) and a live diagnostics probe.
- Web dashboard: version badge + `versionCode` now parsed live from
  `android/app/build.gradle` (stale hardcoded `v1.1.0` badge removed); the
  download card serves the current validated artifact
  (`ridho-music-v1.2.3-debug.apk`) with truthful size/sha, preserving older
  artifacts under unique names.

### Tests performed and results (2026-10-12/13)
- Android JVM unit tests **55/55 PASS** (50 + 5 new) · `lintDebug` **0 errors**
  · `assembleDebug` **BUILD SUCCESSFUL**.
- Web: eslint **0 errors** · vitest **158/158 PASS** · golden parse contract
  **8/8** · fixture sync **OK** · recorded pipeline run-qa **ALL RECORDED
  SUITES GREEN** @ 2026-10-12T23:46:28Z (live YTM probe 4/4 drift — non-gating,
  external catalog volatility, unrelated to Jamendo).
- Live Jamendo verification **5/5 PASS** (sanitized,
  `data/weblab-22b-build-validation.json`): real search (HTTP 200, 5 tracks),
  stream HEAD 200 `audio/mpeg` 4,853,248 B, Range GET 206 + ID3 magic bytes,
  unknown-id → 0 results, invalid-id → envelope code 5. Documented: Jamendo's
  index is query-flaky (same query 0 → 5 results minutes apart).

### Known limitations / unverified behavior
- All on-device behavior (Jamendo playback, pause/resume, seek, failed-stream
  recovery, local playback after online playback, lock-screen controls) —
  **NOT RUN**: the build sandbox has no hardware, emulator binary, or AVD
  (verified via `adb devices` + emulator path). Manual checklist: worklog.md
  → WEBLAB-22B.
- Jamendo 0-result blips on some multi-word queries surface as an empty state.

### Physical-device testing
**NOT PERFORMED** — no Samsung A05s (or any device) was reachable from the
build sandbox this round.

### APK artifact
`android/dist/ridho-music-v1.2.3-debug.apk` (byte-identical copy served from
`public/`) · 10,280,113 B · sha256
`7ccfcf287bd2d9fe9e35136c9575ecf09b0883617c66e94baedb3b53e3c865c3` · debug
variant · built 2026-10-12T23:44:31Z · **BUILD SUCCESSFUL** · aapt-verified
`versionCode 6 / versionName 1.2.3-debug`. Full metadata:
[data/build-info-v1.2.3.json](data/build-info-v1.2.3.json).
