# Changelog

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
