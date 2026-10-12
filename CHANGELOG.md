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
`build.gradle`).

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
