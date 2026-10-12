# Ridho Music

A free, open-source, dark-themed music player for Android — **Java + Views**, powered by
**Media3/ExoPlayer** with real background playback. Inspired by the UX of InnerTune and
Spotify; ships with no ads, no analytics, no trackers and no mandatory account.

Target device reference: Samsung Galaxy A05s (Android 14/15, One UI 6/7).

| | |
|---|---|
| Language | Java 17 (no Kotlin/Flutter/Compose — deliberate) |
| UI | Android Views + XML layouts, Material 3, dark-only theme |
| Playback | androidx.media3 ExoPlayer 1.5.1 + MediaSessionService |
| Persistence | Room 2.6.1 (SQLite) |
| Min / Target SDK | 24 (Android 7) / 35 (Android 15) |
| License | MIT for original code — see [LICENSE](LICENSE) + [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) |

---

## 1. Feature overview

- **Background playback that really continues** with the screen locked or the app
  backgrounded, backed by a Media3 `MediaSessionService` (media notification with
  artwork, lock-screen controls, Bluetooth/wired headset buttons, audio focus with
  ducking, pause-on-unplug).
- **Local music library** via the Storage Access Framework (pick one folder; recursive
  scan with metadata + embedded artwork extraction). No broad storage permission is
  requested — ever.
- **Unified search** across the local library and (optionally) YouTube Music, with
  loading / empty / typed-error states.
- **Play queue** with shuffle, repeat (off/all/one), jump-to-item and per-row removal.
- **Favorites, user playlists, listening history** — all persisted in Room and
  restored across process restarts (queue restore is paused-by-default by design).
- **Now Playing screen**: rounded artwork, seek bar, favorite toggle and a lyrics
  panel supporting synchronized **LRC** (embedded or `<track>.lrc` sidecar files).
- **Settings & diagnostics**: source toggles, playback options, artwork cache
  management, YouTube Music reachability probe, license/privacy info.
- Polished deep-charcoal UI with a muted-teal accent, 44 dp+ touch targets and
  content descriptions throughout.

## 2. Build it

Prerequisites: JDK 17+, Android SDK (platform 35, build-tools 35.0.0), Android Studio
Koala+ (optional, for a GUI).

```bash
cd android
./gradlew assembleDebug          # or: gradle assembleDebug
# APK: app/build/outputs/apk/debug/app-debug.apk

./gradlew testDebugUnitTest      # JVM unit tests (22 tests)
./gradlew lintDebug              # lint gate (abortOnError = true)
./gradlew assembleRelease        # R8-minified release APK (unsigned)
```

> Sandbox note: `local.properties` is generated with `sdk.dir`; if you open the project
> on your machine, Android Studio regenerates it automatically. The repository never
> contains credentials or private keys — the debug build uses the default Android debug
> keystore.

Prebuilt artifacts produced by this project's automated build:
`android/dist/app-debug.apk` (9.8 MB) and `android/dist/app-release-unsigned.apk` (2.9 MB).

## 3. Architecture

Single `:app` module with strict package-level separation (deliberate: for an app of
this size, multi-module Gradle adds build complexity without meaningful benefit; the
package boundaries enforce the same decoupling rules — verified by lint + code review).

```
com.ridho.music
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
                      Playlist detail, Settings, adapters, helpers
```

**Key seams**

- `MusicSource` is the only contract between providers and the engine. Provider logic
  (e.g. InnerTube JSON, SAF traversal) never leaks into `player/` or `ui/`.
- `PlaybackRepository` is the only way the UI talks to the playback engine (MediaController).
- The service resolves stream URIs inside `MediaSession.Callback#onAddMediaItems` on an
  IO executor — the UI never performs resolution, so controls stay responsive while
  metadata/artwork load.
- Dependency wiring is a hand-rolled `ServiceLocator` (no DI framework — justified:
  three singletons and a source registry don't warrant the dependency graph).
- The `Track` model travels as JSON inside `MediaMetadata#extras`, Room snapshot
  columns, and the queue table — one serialization path, unit-tested.

## 4. YouTube Music integration — status: EXPERIMENTAL, search only

This is the honest part. YouTube Music offers **no public API** granting third-party
apps unrestricted playback of arbitrary songs. Before building anything we reviewed
maintained open-source projects and their options:

| Option | Verdict |
|---|---|
| Official YouTube Data API v3 | No full-track streaming for third-party clients; no YT Music catalog search. Not viable for this app's purpose. |
| **NewPipe Extractor** (GPLv3) | Technically maintained and capable, but **GPL-3.0 is viral**: linking it in a single APK makes the whole app GPLv3, conflicting with this project's MIT goal. Not bundled. A clean-room reimplementation was out of scope and is fragile by nature (signature deciphering changes). |
| **Unauthenticated InnerTube web API** (what this app does) | Public endpoints the YT Music web player itself calls without credentials. **Search works** (songs/videos/albums/artists shelves). **Stream playback is best-effort**: the `player` endpoint increasingly gates direct URLs behind attestation / po-token mechanisms. When the platform refuses, the app surfaces a typed `UNAVAILABLE` error — it never bypasses sign-in, attestation, DRM or paid features. |

**What is implemented** (isolated behind `MusicSource` in `source/yt/`):

1. `InnertubeClient` — HTTPS-only OkHttp client, no cookies/tokens, TLS validation
   never disabled, timeouts, typed `SourceException`s.
2. `YtMusicSearchParser` — defensive parser over the WEB_REMIX search response
   (unit-tested against a captured-shape fixture).
3. `YouTubeMusicSource.resolveStreamUri()` — best-effort direct-URL extraction from the
   `player` endpoint (ANDROID_MUSIC client). Picks `itag 140` (128 kbps AAC) or the
   best un-ciphered audio format. **Refuses** to decipher `signatureCipher` payloads.

**Compliance rules baked into the code:** no credentials requested or stored, no
private keys/cookies hardcoded, no TLS bypass, no silent auth/DRM/geo workaround,
`LOGIN_REQUIRED` responses surface as user-visible errors, and the source can be
switched off entirely in Settings.

**Reliability expectation:** search is fairly resilient; **remote playback may fail at
any time** (attestation, regional or age restrictions). When it fails you get a clear
error message and playback keeps working for local files. This limitation is also
shown in-app (search footer + Settings note).

### If you need guaranteed YT Music playback

Option A: vendor NewPipe Extractor via JitPack and accept GPLv3 for the combined work.
Option B: implement signature deciphering yourself and keep MIT — expect ongoing
maintenance churn. Either way, the integration point is a single class
(`YouTubeMusicSource`) implementing `MusicSource`; nothing else in the app changes.

## 4b. Jamendo integration — status: OPERATIONAL (official API, WEBLAB-22A)

Jamendo is a catalog of ~500k independent tracks released under Creative Commons
licenses, accessed through a **documented, official** API — no unofficial mechanics
involved. Verified against the live API and developer.jamendo.com/v3.0/docs on
2026-10-12.

**What is implemented** (isolated behind `MusicSource` in `source/jamendo/`):

1. `JamendoClient` — HTTPS-only OkHttp client for `GET api.jamendo.com/v3.0/tracks/`
   with the documented parameters (`search`, `limit` ≤ 200, `audioformat=mp32`,
   `imagesize=300`, `include=licenses`, `type=single albumtrack`). Note: Jamendo
   answers **HTTP 200 even for API errors** — the envelope (`headers.status/code`)
   is the source of truth; code 5 (invalid credential) maps to
   `CONFIGURATION_REQUIRED`.
2. `JamendoSearchParser` — defensive parser producing `Track`s with real
   title/artist/album/duration/artwork, the official `audio` stream URL, and CC
   attribution metadata (`licenseName`/`licenseUrl` from `license_ccurl`). Documented
   quirks handled: singles have empty album fields; only `https://` URLs are
   accepted; entries without ids are skipped.
3. `JamendoSource` — implements the existing `MusicSource` contract, so search UI
   and the Media3 playback engine need zero provider-specific code. Stream URLs
   from search responses are canonical and stable (verified: HEAD 200,
   `audio/mpeg`, range requests supported). `resolveStreamUri()` prefers a fresh
   lookup by track id and falls back to the cached URL — Jamendo's id-lookup is
   eventually consistent (observed live: the same query flips 0↔1 results within
   seconds), while search-time URLs do not expire.

**Client ID configuration (no secrets anywhere):**

- Reads go through Jamendo's documented **app authentication**: the `client_id`
  query parameter only. There is **no client secret and no OAuth** — read endpoints
  don't need them, and none may ever be embedded in the APK.
- The id is resolved **at request time**, in priority order:
  1. **Runtime**: Settings → Music sources → "Jamendo client ID" (stored in the
     app-private SharedPreferences; takes effect immediately, no restart).
  2. **Build-time default**: `android/local.properties` (gitignored) key
     `jamendoClientId`, injected into `BuildConfig.JAMENDO_CLIENT_ID` by
     `app/build.gradle`. Never commit this file.
- With neither present, every Jamendo call fails typed
  `CONFIGURATION_REQUIRED` with an actionable message; search shows it, Settings
  diagnostics show "Not configured". Get a free id at developer.jamendo.com.
- The id is never logged (`JamendoClient#sanitize` strips it from every message;
  test fixtures carry it masked).

**Attribution:** every Jamendo track carries its CC license; the track menu shows
"License (Creative Commons) · CC …" and the license dialog links the CC deed.
Ridho Music streams progressively and **never downloads** audio files.

## 5. Privacy

- No ads, analytics, crash-reporting or tracking SDKs.
- The app has **no accounts**; it never asks for Google credentials.
- Local files are scanned on-device (SAF); nothing is uploaded.
- YouTube Music requests (optional, off-able) go directly to `music.youtube.com` over
  HTTPS; no third party sees them; no tokens are stored.
- Jamendo requests (optional, off-able) go directly to `api.jamendo.com` over HTTPS
  using only the app's `client_id` (public application identifier, never logged); no
  account, no OAuth, no secret. Search/stream traffic bypasses any intermediary.
- Stored data: favorites/playlists/history/queue (app-private Room DB), artwork cache
  in `filesDir/artwork`, preferences. Uninstall removes everything.
- Logs intentionally avoid URLs and user data (`Track#toString` excludes URLs; error
  logs print error-code names only).

## 6. Testing

**Executed in this project's build environment** (sandbox, no device/emulator —
results observed, not assumed):

- `gradle :app:assembleDebug` → **BUILD SUCCESSFUL**, `app-debug.apk` produced.
- `gradle :app:assembleRelease` → **BUILD SUCCESSFUL** (R8 minified, 2.9 MB).
- `gradle :app:testDebugUnitTest` → **22/22 tests passed**, zero failures:
  - `TrackTest` (4) — JSON round-trip serialization.
  - `LrcParserTest` (7) — LRC formats, multi-tags, sorting, active-line lookup.
  - `YouTubeMusicSourceTest` (7) — stream selection rules (itag 140 preference,
    highest-bitrate fallback, ciphered/`LOGIN_REQUIRED`/missing-data → typed errors).
  - `YtMusicSearchParserTest` (4) — response parsing incl. malformed-input safety.
- `gradle :app:lintDebug` → **0 errors** with `abortOnError true` (7 API-level errors
  found and fixed during development: guarded `NotificationChannel` behind SDK ≥ 26,
  `tools:targetApi` for `forceDarkAllowed`).

**Requires hardware — could NOT be executed here** (documented, not claimed):
on-device audio output, lock-screen controls, Bluetooth buttons, notification rendering,
SAF scanning against a real media provider, live InnerTube calls. Use:

```bash
./gradlew installDebug                              # Samsung Galaxy A05s via ADB
./gradlew connectedDebugAndroidTest                 # instrumented smoke tests
```

Manual acceptance checklist for a device is in `CHANGELOG.md`.

## 7. Known limitations

- YouTube Music playback is best-effort (see §4); search metadata is unofficial and
  may change without notice.
- Album/artist search results open a follow-up search (they are catalog links, not
  tracks) — full browse-endpoint integration is future work.
- Lyrics require embedded LRC or `.lrc` sidecar files; there is no online lyrics
  provider (privacy-first choice).
- Queue restore is capped by practical queue size; very large queues (1000+) may
  restore slowly.
- No Wear OS / Android Auto surface (future work).

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| "The selected folder is no longer readable" | Re-pick the folder in Home (Android can revoke SAF grants after provider updates). |
| YT Music track fails to play | Expected behavior for gated streams — see §4. Local files are unaffected. Toggle the source off in Settings if you don't want it. |
| Jamendo search says "Jamendo is not configured" | Add your free client ID in Settings → Music sources → Jamendo client ID (developer.jamendo.com). |
| Jamendo search says the client ID was rejected | The id may be revoked or mistyped — re-enter it in Settings. "Clear" removes the runtime override. |
| A Jamendo track fails to stream | Rare: check connectivity; the id-lookup can lag — retry usually fixes it. Local files are unaffected. |
| No sound on Bluetooth | Check system media volume; playback honors audio focus pauses. |
| Notification controls missing | Grant the notification permission (requested on first playback, Android 13+). |
| Scan finds no files | Ensure the folder contains `mp3/m4a/flac/wav/ogg/opus/aac`; re-scan from Library → Local files. |

## 9. Roadmap

1. NewPipe-Extractor-based provider as a *separate* build flavor (GPLv3 flavor vs MIT core).
2. Full album/artist browse endpoints + artist pages.
3. Sleep timer, crossfade, playback speed.
4. Android Auto / Wear surfaces.
