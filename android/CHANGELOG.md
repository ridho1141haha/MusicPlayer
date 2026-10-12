# Changelog

## 1.2.3 (versionCode 6) — 2026-10-13 · WEBLAB-22A + WEBLAB-22B

> Versioning note: this is the first APK release of the Jamendo work (built
> during WEBLAB-22A but left at versionCode 3 at the time). versionCode jumps
> 3 → 6 because codes 4 and 5 were consumed before a sandbox reset (5 = v1.2.2
> was verified installed on the Samsung Galaxy A05s in WEBLAB-20A-VERIFY);
> codes are never reused, and 6 guarantees install-over on that device.
> versionName follows semver: PATCH — one bug fix + validation/traceability
> round, no new app features in WEBLAB-22B.

### Added
- **Jamendo source (official v3.0 API)** — free, legal Creative Commons catalog of
  independent music, integrated behind the existing `MusicSource` contract:
  `source/jamendo/{JamendoClient, JamendoSearchParser, JamendoSource}`.
  Search results show real title/artist/album/artwork/duration and are immediately
  playable (search responses carry the official stable `audio` stream URL;
  `audioformat=mp32`). CC attribution metadata (`licenseName`/`licenseUrl`) is
  captured from the documented `license_ccurl` field and shown in the track menu
  ("License (Creative Commons) · CC …") with a CC-deed dialog.
- **Typed errors** `CONFIGURATION_REQUIRED` / `RATE_LIMITED` added to
  `SourceException.Kind` (additive). Jamendo maps missing/invalid client ids and
  its HTTP-200-with-failed-envelope behavior (code 5) to these, never to generic
  failures.
- **Settings → Music sources → Jamendo**: enable/disable switch, "Jamendo client ID"
  row with an on-device runtime id dialog (Save/Clear; masked "••••1234" summary),
  attribution note, and a real-search diagnostics probe ("Connected · search OK (N
  results)" / "Not configured" / typed failure).
- **Credential mechanism**: client id resolved at REQUEST time — runtime setting
  first, then `BuildConfig.JAMENDO_CLIENT_ID` (injected from gitignored
  `android/local.properties` key `jamendoClientId`). No id in committed source, no
  client secret anywhere, no OAuth, id masked in messages and fixtures.
- 18 Jamendo JVM tests vs real sanitized API captures (parser, documented quirks,
  envelope error mapping, request-time credential switching, stream-resolution
  contract, client-id masking hygiene).

### Fixed (root causes)
- **History recorded queue restores as "recently played" (WEBLAB-22B)** —
  history was written from `onMediaItemTransition` for every non-repeat reason;
  restoring a persisted queue at launch fires that callback
  (`PLAYLIST_CHANGED`) while paused, so a track the user never played this
  session appeared in Recently Played. Root cause: transition reason was the
  only playback signal. Fix: history now records REAL playback only — playing
  + `STATE_READY` + a media item different from the last recorded one — via a
  new pure-logic `HistoryPolicy` (JVM-tested) wired into the player listener;
  repeat-one loops and pause/resume of the same track dedupe to one row.
  Regression tests: `HistoryPolicyTest` (5 tests).
- `scripts/setup-android-sdk.sh`: `python3 -m zipfile` drops the executable bit, so
  `sdkmanager` died with "Permission denied" after a sandbox reset — now chmods
  `cmdline-tools/latest/bin/*` explicitly.

### Verification (2026-10-12/13 — sandbox; device tests NOT RUN, no hardware/emulator/AVD)
- `testDebugUnitTest` **55/55** (50 + 5 new) · `lintDebug` **0 errors** ·
  `assembleDebug` OK · web lint **0 errors** · vitest **158/158** · golden 8/8 ·
  run-qa pipeline **ALL RECORDED SUITES GREEN** @ 2026-10-12T23:46:28Z (live YTM
  probe 4/4 drift — non-gating, external catalog volatility, unrelated).
- APK `ridho-music-v1.2.3-debug.apk` 10,280,113 B · sha256 `7ccfcf287bd2d9fe…` ·
  aapt-verified versionCode 6 / versionName 1.2.3-debug · build metadata in
  `data/build-info-v1.2.3.json` (no credentials).
- Live Jamendo evidence (client id masked, `data/weblab-22b-build-validation.json`):
  search HTTP 200 `status:success` 5 tracks ("Acoustic Love" — lesfm, 188 s, CC
  license, artwork); stream HEAD 200 `audio/mpeg` 4,853,248 B `accept-ranges:
  bytes`; range GET 206 with ID3 magic bytes (ExoPlayer progressive/seek
  compatible); unknown-id lookup → success + 0 results (NO_RESULTS); invalid id →
  HTTP 200 envelope `failed` code 5 (CONFIGURATION_REQUIRED). Documented live:
  Jamendo's full-text index is query-flaky — the same query returned 0 results
  and 5 results minutes apart; 0-result blips are index behavior, not credential
  failure (invalid ids produce code 5).

### Known limitations / unverified behavior
- On-device playback, pause/resume, seek, failed-stream recovery, local playback,
  lock-screen controls: **NOT RUN** (no hardware in the build sandbox) — manual
  checklist in the repository worklog (WEBLAB-22B section).
- Jamendo search can return 0 results for some multi-word queries (index
  behavior) — surfaced as an honest empty state, not an error.

## 1.1.0 — 2026-10-11

### Added
- **Sleep timer** (Now Playing top bar → moon icon): Off / 5 / 10 / 15 / 30 / 60 min.
  Implemented as a Media3 custom session command handled inside `PlaybackService`, so
  the timer survives UI process death; firing only pauses playback (never stops the
  service or clears the queue). Least-privilege `onConnect` exposes exactly one
  custom session command.
- **Playback speed** (Now Playing top bar → "1x" chip): 0.75x / 1x / 1.25x / 1.5x /
  2x via `Player.setPlaybackSpeed`, persisted in preferences and re-applied when the
  player is created.

### Fixed (root causes)
- `MediaSession.ConnectionResult` is a nested class (no top-level
  `androidx.media3.session.ConnectionResult`) — verified against the AAR with javap.
- `SessionCommand` has no single-String constructor; requires `(String, Bundle)`.
- `SessionCommands.Builder#addAllSessionCommands()` is package-private — replaced
  with an explicit least-privilege command list.

### Verification
- `assembleDebug` + `assembleRelease` (R8) + `testDebugUnitTest` (22/22) +
  `lintDebug` (0 errors) — all executed and green (Gradle 8.9 / AGP 8.7.3 / SDK 35).

## 1.0.0 — 2026-10-11

First release. Built and verified with Gradle 8.9 / AGP 8.7.3 / JDK 17 / SDK 35.

### Added
- Media3 ExoPlayer playback engine with MediaSessionService: background playback,
  media notification with artwork, lock-screen/system-UI/Bluetooth controls, audio
  focus with ducking, pause-on-headphone-unplug, network wake mode, skip-silence
  option, 10 s seek increments, one-shot network-error recovery.
- Typed typed-error contract for music sources (`SourceException.Kind`).
- Local library over SAF (folder picker, persistable permission, recursive scan,
  metadata + embedded artwork extraction with on-disk cache, 2000-track cap).
- Experimental, unofficial YouTube Music source behind `MusicSource`: InnerTube
  search (songs/videos/albums/artists) + best-effort direct stream resolution with
  explicit refusal to decipher protected URLs; per-user toggle in Settings.
- Unified search across sources with loading/empty/typed-error states and
  debounced live queries.
- Room persistence: favorites, playlists (+tracks), history, scanned local tracks,
  and full play-queue snapshots (restore paused at last position; clear on explicit stop).
- Now Playing screen: artwork, seek bar, favorite, queue sheet, repeat
  off/all/one, shuffle, lyrics panel (embedded LRC / `.lrc` sidecars, line highlight).
- Home (recently played, favorites, onboarding, shuffle-all), Library
  (favorites/playlists/history/local with chips), playlist detail with
  play/shuffle/delete, Settings with live source diagnostics.
- Dark-only Material 3 theme (deep charcoal + muted teal), adaptive launcher icon,
  44 dp+ touch targets, content descriptions throughout.
- 22 JVM unit tests + instrumented smoke test (device required).
- MIT LICENSE, third-party notices, privacy summary, this changelog.

### Fixed during development (root causes, not workarounds)
- Room requires `@NonNull` primary keys (PlaylistTrackEntity, LocalTrackEntity).
- Media3 1.5.1 `DefaultMediaNotificationProvider` takes a custom
  `NotificationIdProvider` functional interface (session-scoped), not a plain supplier.
- `PlaybackException#getErrorCodeName` (not `errorCodeName`).
- `MediaMetadataRetriever` has no `METADATA_KEY_LYRICS` — replaced with `.lrc`
  sidecar support.
- `NotificationChannel` needs an API 26 guard (minSdk 24); `forceDarkAllowed` needs
  `tools:targetApi=29` (lint, abortOnError=true).

### Verification status
- Executed in the build sandbox: assembleDebug ✅, assembleRelease (R8) ✅,
  testDebugUnitTest 22/22 ✅, lintDebug 0 errors ✅.
- Not executable in the sandbox (require hardware): on-device audio, lock-screen
  controls, Bluetooth buttons, SAF provider scans, live InnerTube playback.
  Manual device checklist:
  1. Install `dist/app-debug.apk` → app launches, no crash (criterion B).
  2. Pick a folder with own music → scan populates Library (criteria C partially).
  3. Play a local track → audio out; lock screen → playback continues; media
     notification shows artwork + controls (A/C/D/E/J).
  4. Headset next/prev buttons respond (J).
  5. Search a song on YouTube Music → results render; playback attempt shows
     either audio or a typed error, never a crash (G/H).
  6. Airplane mode during playback → recovery or typed error, no crash (H).
  7. Kill process with queue playing → relaunch restores queue paused (I).
  8. Repeat/shuffle/seek/next/prev across tracks behave (F).

### Notes
- No secrets, tokens or cookies exist in the repository (grep-audited).
- Lint `UnstableApiUsage` is disabled deliberately: Media3 session/notification APIs
  are unstable-by-design; usage is confined to the player package.
