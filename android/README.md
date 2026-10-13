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
`android/dist/ridho-music-v1.2.3-debug.apk` (10.3 MB — **current**, v1.2.3 /
versionCode 6), the pinned historical `android/dist/app-debug.apk` (11.0 MB,
pre-1.2.3), and `android/dist/app-release-unsigned.apk` (2.9 MB). Older versioned
APKs are preserved under unique filenames; see the root
[CHANGELOG.md](../CHANGELOG.md) for per-version build metadata and checksums.

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

## 4. YouTube Music integration — status: EXPERIMENTAL · search always · playback via YOUR sign-in (v1.4.0)

This is the honest part. YouTube Music offers **no public API** granting third-party
apps unrestricted playback of arbitrary songs. Before building anything we reviewed
maintained open-source projects and their options:

| Option | Verdict |
|---|---|
| Official YouTube Data API v3 | No full-track streaming for third-party clients; no YT Music catalog search. Not viable for this app's purpose. |
| **NewPipe Extractor** (GPLv3) | Technically maintained and capable, but **GPL-3.0 is viral**: linking it in a single APK makes the whole app GPLv3, conflicting with this project's MIT goal. Not bundled. A clean-room reimplementation was out of scope and is fragile by nature (signature deciphering changes). |
| **Unauthenticated InnerTube web API** | Search works (songs/videos/albums/artists shelves). **Playback is dead for clients without a session** — measured on 2026-10-13 (`tool-results/ytm-diag/`): ANDROID_MUSIC → `LOGIN_REQUIRED` "Please sign in", WEB → `LOGIN_REQUIRED` "Sign in to confirm you're not a bot", TVHTML5 embed → "no longer supported", IOS → HTTP 400. |
| **Authenticated web session (v1.4.0, what this app does now)** | The user logs into music.youtube.com in a **plain WebView** (Google's own pages; the app never sees the password). The captured session cookie is validated, stored **AES-256/GCM in the AndroidKeyStore**, excluded from backups, and replayed with the same `Cookie` + `SAPISIDHASH` headers the official web player sends. This is **authentication, not circumvention**: no signature deciphering, no po-token forging, no bot evasion, no downloads — the player endpoint returns plain `url` fields and Media3 streams them. |

**What is implemented** (isolated behind `MusicSource` in `source/yt/`):

1. `InnertubeClient` — HTTPS-only OkHttp client, TLS validation never disabled,
   timeouts, typed `SourceException`s; `post(endpoint, body, cookieHeader)` adds the
   authenticated web-session headers (Cookie + SAPISIDHASH + X-Origin), cookies
   travel only to music.youtube.com and are never logged.
2. `YtMusicSearchParser` — defensive parser over the WEB_REMIX search response
   (unit-tested against a captured-shape fixture). Search needs no sign-in.
3. `settings/YtmCredentialStore` — AndroidKeyStore AES/GCM storage of the session,
   dedicated prefs file, fail-closed, backup/transfer-excluded.
4. `ui/YtmSignInActivity` — official login surface; Settings → Music sources →
   **YouTube Music account** manages sign-in/sign-out (status shows a boolean
   only, never cookie content).
5. `YouTubeMusicSource.resolveStreamUri()` — signed-out → typed
   `CONFIGURATION_REQUIRED` pointing at Settings; signed-in → `player` request
   with the session, picks `itag 140` (128 kbps AAC) or the best un-ciphered audio
   format. **Refuses** to decipher `signatureCipher` payloads; some tracks may
   still be refused by the platform (age/region/attestation) — surfaced honestly
   as typed errors with an "Open in YouTube Music" deep link.

**Compliance rules baked into the code:** the user's own login is the only
credential path; no cookies of anyone else; no plaintext session on disk; no TLS
bypass; no silent auth/DRM/geo workaround; refusals surface as user-visible
errors; the source can be switched off entirely in Settings; sign-out wipes both
the stored session and the WebView cookies.

**Reliability expectation:** search is fairly resilient; playback depends on
Google accepting your session for a given track — most catalog tracks work,
some refuse (age/region/attestation) and the app tells you instead of
bypassing. **ToS note:** using your account in an unofficial client is against
Google's terms for the free tier — it is your account and your call; nothing is
downloaded and nothing is shared. Playback failures are surfaced via the
Snackbar (main screen) and the error banner (Now Playing), with an
"Open in YouTube Music" action as the compliant escape hatch.

### Why not "just make it play" without sign-in?

Every unauthenticated client is gated server-side (see the measured table
above). The remaining "working" routes are signature deciphering (bypassing a
technical protection measure — refused) or po-token forging (attestation
bypass — refused). v1.4.0 chose the only honest path left: the user's own
authenticated session, exactly like the official web player.

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
- **Accounts (v1.4.0):** the app still never sees your password — sign-in happens
  in Google's own WebView pages. What is stored is YOUR resulting YouTube Music
  session cookie, **AES-256/GCM encrypted with an AndroidKeyStore key**, in a
  dedicated prefs file that is **excluded from cloud backups and device
  transfers**; it travels only to `music.youtube.com` over HTTPS, only when a
  playback request needs it, and is never logged or shown (Settings exposes a
  signed-in boolean only). Sign-out erases it from the device.
- Local files are scanned on-device (SAF); nothing is uploaded.
- YouTube Music search requests (optional, off-able) go directly to
  `music.youtube.com` over HTTPS; no third party sees them.
- Jamendo requests (optional, off-able) go directly to `api.jamendo.com` over HTTPS
  using only the app's `client_id` (public application identifier, never logged); no
  account, no OAuth, no secret. Search/stream traffic bypasses any intermediary.
- Audius requests (optional, off-able) go directly to official Audius discovery
  hosts over HTTPS using only the documented `app_name` attribution parameter.
- Stored data: favorites/playlists/history/queue (app-private Room DB), artwork cache
  in `filesDir/artwork`, preferences, and the encrypted YT Music session (if you
  signed in). Uninstall removes everything.
- Logs intentionally avoid URLs and user data (`Track#toString` excludes URLs; error
  logs print error-code names only).

## 6. Testing

**Executed in this project's build environment** (sandbox, no device/emulator —
results observed, not assumed):

- `gradle :app:assembleDebug` → **BUILD SUCCESSFUL**, `app-debug.apk` produced.
- `gradle :app:assembleRelease` → **BUILD SUCCESSFUL** (R8 minified, 2.9 MB).
- `gradle :app:testDebugUnitTest` → **86/86 tests passed**, zero failures
  (latest recorded run 2026-10-13; see `data/qa-results.json` for the live
  recorded totals):
  - `SapisidHashTest` (4) — FOCUS-YTM-2: known-answer SHA-1 SAPISIDHASH header,
    cookie parsing, `looksAuthenticated` gate.
  - `StreamErrorBusTest` (5) — FOCUS-YTM-1: error bus contract.
  - `YtmLinksTest` (4) — FOCUS-YTM-1: deep-link id extraction + watch URL.
  - `YouTubeMusicSourceTest` (11) — stream selection rules (itag 140 preference,
    highest-bitrate fallback, ciphered/`LOGIN_REQUIRED`/missing-data → typed
    errors) + v1.4.0 session rules (signed-out → CONFIGURATION_REQUIRED,
    malformed session fails closed, catalog ids stay UNSUPPORTED).
  - `HistoryPolicyTest` (5) — history records REAL playback only (queue
    restore / repeat-one / resume dedupe).
  - `JamendoSourceTest` (18) — parser vs sanitized real captures, envelope
    error mapping, credential switching, stream-resolution contract.
  - `TrackTest` (4) — JSON round-trip serialization.
  - `LrcParserTest` (7) — LRC formats, multi-tags, sorting, active-line lookup.
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

- YouTube Music playback requires signing in with your own account (see §4);
  some tracks may still be refused by YouTube even then — the app surfaces it
  instead of bypassing. Search metadata is unofficial and may change without notice.
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
| Tapping a track does nothing — no playback, no message (pre-1.4.1) | Fixed in 1.4.1: every failure now shows a typed message (Snackbar + Now Playing banner). Update to ≥1.4.1; if a timeout message appears, check connectivity and retry. |
| "The selected folder is no longer readable" | Re-pick the folder in Home (Android can revoke SAF grants after provider updates). |
| YT Music track fails to play signed-out | Sign in: Settings → Music sources → YouTube Music account (see §4). The error message also says this. |
| YT Music track fails even after sign-in | YouTube refused that track (age/region/attestation). Use “Open in YouTube Music” from the error banner. Local files are unaffected. |
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
