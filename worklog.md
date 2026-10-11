# Ridho Music — Worklog (shared handover document)

> Every agent MUST read this file before working and append its section after finishing.

---
Task ID: 1..9 (main agent)
Agent: Z.ai Code (main orchestrator)
Task: Build "Ridho Music" — production-quality open-source Android music player (Java, Media3, YouTube Music integration analysis), full repository implementation + real builds + tests + docs.

Work Log:
- Inspected environment: JDK 21 (headless JRE, no javac/jlink), no Gradle, no Android SDK. Network to dl.google.com / maven.google.com / services.gradle.org OK. 8 GB disk free.
- Installed toolchain: Gradle 8.9 (/home/z/gradle-8.9), Android cmdline-tools + platform-35 + build-tools 35.0.0 (/home/z/android-sdk), Temurin JDK 17 full (/home/z/jdk-17.0.20.1+1). NOTE: background processes die between shell calls here — setup must run synchronously.
- Created complete Android Studio project at /home/z/my-project/android (Java 17, minSdk 24, targetSdk 35, AGP 8.7.3, Media3 1.5.1, Room 2.6.1, Material 1.12, Glide 4.16, OkHttp 4.12).
- Implemented full app (~65 files):
  - domain: Track (JSON-serializable), SearchSection, MusicSource interface, SourceException (NETWORK/UNAVAILABLE/UNSUPPORTED/NOT_FOUND/PARSE).
  - data: Room DB (6 entities: saved_tracks, history, playlists, playlist_tracks, queued_tracks, local_tracks), LibraryRepository (single-thread executor + main-thread callbacks).
  - player: PlaybackService (MediaSessionService; audio focus + ducking via AudioAttributes, becoming-noisy, WAKE_MODE_NETWORK, DefaultMediaNotificationProvider on custom channel, queue persistence with 400 ms debounce, restore paused at last position, one-shot stream re-resolution on player error, history on transition), MediaItemConverter (Track ⇄ MediaItem via MediaMetadata.extras JSON).
  - playback: PlaybackRepository (MediaController facade; play/addToQueue/playPause/next/prev/seek/shuffle/repeat/remove/skip; observable Listener).
  - sources: LocalMusicSource (SAF tree scan ≤6 depth/2000 files, MediaMetadataRetriever metadata + embedded artwork → filesDir/artwork, .lrc sidecar lyrics), yt/InnertubeClient (HTTPS-only, no credentials/cookies, timeouts, typed errors), yt/YtMusicSearchParser (defensive InnerTube parser, pure Java), yt/YouTubeMusicSource (search OK; player-endpoint best-effort stream resolution; refuses to decipher signatureCipher; LOGIN_REQUIRED → typed UNAVAILABLE).
  - lyrics: LrcParser (synced/unsynced, multi-tags, sorting, activeLineIndex), EmbeddedLyricsProvider.
  - ui: MainActivity (3 shown/hidden fragments + mini player + bottom nav + POST_NOTIFICATIONS flow), HomeFragment (onboarding SAF picker, recent shelf, favorites, shuffle-all), SearchFragment (debounced unified search with loading/error/empty states), LibraryFragment (chips: favorites/playlists/history/local), NowPlayingActivity (artwork/lyrics ViewFlipper, Slider seek, transport controls, favorite, queue sheet), QueueSheet, PlaylistDetailActivity, SettingsActivity (switches + YTM reachability probe + cache clear + license/privacy dialogs), adapters (Track/HorizontalTrack/SearchResults/Playlist/Queue/Lyrics).
  - resources: full dark theme (charcoal #0D1013 + teal #2FA69C), 25 vector icons, adaptive launcher icon, all layouts, complete strings.xml.
- Unit tests (JVM): TrackTest(4), LrcParserTest(7), YouTubeMusicSourceTest(7), YtMusicSearchParserTest(4) = 22. Instrumented smoke test provided (needs device — cannot run here).
- Build iterations (root causes fixed):
  1. JdkImageTransform failed (no jlink in system JRE) → installed Temurin JDK 17; set via USER-LEVEL ~/.gradle/gradle.properties (org.gradle.java.home), NOT committed.
  2. Room @NonNull primary keys (PlaylistTrackEntity.trackId, LocalTrackEntity.id).
  3. Missing imports (ViewGroup in PlaylistAdapter, NonNull in PlaybackRepository/NowPlayingActivity).
  4. Media3 1.5.1 DefaultMediaNotificationProvider takes custom NotificationIdProvider functional interface (session) -> int — verified via javap of the AAR.
  5. PlaybackException#getErrorCodeName (not errorCodeName).
  6. No METADATA_KEY_LYRICS in MediaMetadataRetriever → replaced with .lrc sidecar reading via SAF.
  7. lint NewApi errors → SDK 26 guard for NotificationChannel, tools:targetApi=29 for forceDarkAllowed.
  8. Test fixture JSON had systematically missing "}" in runs arrays → regenerated programmatically + validated with node before committing.
- Final build results (all observed):
  - :app:assembleDebug → BUILD SUCCESSFUL → android/dist/app-debug.apk (10.2 MB)
  - :app:assembleRelease (R8) → BUILD SUCCESSFUL → android/dist/app-release-unsigned.apk (3.0 MB)
  - :app:testDebugUnitTest → 22/22 passed
  - :app:lintDebug → 0 errors (abortOnError true; UnstableApiUsage disabled deliberately, documented)
- Copied debug APK to /home/z/my-project/public/ridho-music-v1.0.0-debug.apk for preview download.
- Docs written: android/README.md (setup/architecture/YT Music integration analysis/limitations/troubleshooting), LICENSE (MIT), THIRD_PARTY_NOTICES.md, CHANGELOG.md (incl. device test checklist).

Stage Summary:
- Android deliverable is COMPLETE and BUILD-VERIFIED: real APKs, 22/22 tests, clean lint.
- YouTube Music: search implemented (experimental, in-app labeled); remote playback best-effort with honest typed failures; no auth bypass/DRM circumvention; full analysis in android/README.md §4.
- Build env specifics: sdk at /home/z/android-sdk, gradle at /home/z/gradle-8.9, jdk17 at /home/z/jdk-17.0.20.1+1; build command: `cd /home/z/my-project/android && ANDROID_HOME=/home/z/android-sdk JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64 /home/z/gradle-8.9/bin/gradle --no-daemon <tasks>`.
- Next: web delivery dashboard on Next.js / route (Task 10), browser verification (Task 11).

---
Task ID: 10
Agent: (to be filled by dashboard agent)
Task: Build Next.js delivery dashboard on / route.

(see appended section below)
---
Task ID: 10
Agent: Z.ai Code (web delivery dashboard)
Task: Build the Next.js 16 web delivery dashboard on the / route — live project stats, source browser, honest acceptance-criteria table, docs, APK download.

Work Log:
- Read worklog.md (Tasks 1–9) and verified inputs on disk: android/dist/app-debug.apk (10,240,525 B), android/dist/app-release-unsigned.apk (3,059,602 B), public/ridho-music-v1.0.0-debug.apk copy, 4 JUnit XMLs under android/app/build/test-results/testDebugUnitTest (TrackTest 4, LrcParserTest 7, YouTubeMusicSourceTest 7, YtMusicSearchParserTest 4 — 22/22, 0 failures/errors), README/CHANGELOG/THIRD_PARTY_NOTICES. Verified all needed shadcn/ui components exist in src/components/ui.
- Created src/lib/ridho.ts — shared TS types (ProjectPayload, FilePayload, TreeNode, ApkEntry, TestResults, Criterion…), VIEWABLE_EXTENSIONS allow-list, formatBytes/formatDate/isViewableFileName helpers. Strict typing, no `any`.
- API route GET /api/project (src/app/api/project/route.ts, force-dynamic): walks android/ recursively (excludes build/, .gradle/, .git/), builds nested TreeNode (dirs-first, alphabetical, sizes via stat), computes counts (52 javaFiles, 53 xmlResources, 118 totalSourceFiles, 5,567 javaLines), stats both APKs (size + mtime; fallback message when missing), parses the 4 test XMLs with regex attribute extraction and computes totals (22/22 passed), emits buildChecks (assembleDebug/assembleRelease/lintDebug facts from worklog; test detail computed from XML), criteria A–L with honest statuses (6 verified / 6 requires-device), and docs excerpts (README first 120 lines, CHANGELOG first 80). Verified via curl: all fields real.
- API route GET /api/file (src/app/api/file/route.ts, force-dynamic): ?path=… sandboxed text reader. Rejects traversal (".."), absolute/backslash paths, anything resolving outside /home/z/my-project, anything outside android/, non-allow-listed extensions (415), NUL-byte binary content (415), missing files (404); serves first 100 KB with truncated flag + sizeBytes. Verified via curl: README 200, ../package.json 400, dist APK 415, package.json 400, android/nope.md 404.
- Dashboard UI on / (src/app/page.tsx + src/components/dashboard/*): sticky top nav with anchor links; Hero (music icon, v1.0.0 badge, tagline, 6 tech badges, teal download button labeled with the REAL debug size "9.8 MB" from the API, unsigned-release chip pointing at android/dist/, built-date line); Build & verification (4 stat cards from API + Gradle build-check chips); Acceptance criteria A–L list with teal "verified" / amber "requires-device" badges and honest detail lines; Architecture (package tree verbatim from README §3 + 5 key-seams bullets); Source browser (collapsible tree from the API tree with filter input + auto-expand of matches, default-expands the com/ridho/music java chain, 44px rows, "bin" tag for non-viewable files; right pane code viewer with line numbers, size/lines header, copy button, 100 KB truncation badge, skeletons, and honest error state for binaries); YouTube Music status card (EXPERIMENTAL badge, search/best-effort/refusal-rules blocks, dialog that fetches android/README.md via /api/file and shows §4 verbatim); Docs tabs (README / CHANGELOG / THIRD_PARTY_NOTICES lazily fetched via /api/file, pre-wrap, scrollable, copy + retry); sticky footer (mt-auto inside min-h-screen flex-col, safe-area padding).
- Theming: scoped `.rm-theme` CSS-var overrides in globals.css (charcoal #0D1013 bg, #151A1E cards, teal #2FA69C primary / #7FD8CE accents, amber for device-pending), custom .rm-scroll scrollbars, teal selection color, smooth anchor scrolling. No indigo/blue anywhere. framer-motion used only for subtle fade/rise reveals.
- Lint fixes: react-hooks/set-state-in-effect — refactored source-browser fetch effect so no synchronous setState in effect body (state now carries forPath; loading state derived per selected file). Final `bun run lint`: clean.
- Browser verification (agent-browser): snapshot showed hero + badges + real stat cards (9.8 MB / 2.9 MB / 22/22 / 0 errors) + full A–L list; tree renders the real 118-file tree; clicking Track.java and LrcParserTest.java loaded real content ("class LrcParserTest" etc.); filter "LrcParser" pruned tree correctly; docs tabs served CHANGELOG (incl. device checklist) and THIRD_PARTY_NOTICES; YTM dialog shows README §4 (2,796 chars); clicking app-debug.apk in tree shows the API's honest 415 error state; computed styles confirmed #0D1013 bg + #2FA69C buttons; console had no errors (only React DevTools hint + HMR log); iPhone-15 viewport (393px) stacks cleanly with footer pushed to document bottom (doc height 9,300px = footer bottom). VLM spot-checks of screenshots: no layout glitches.
- dev.log tail: / , /api/project, /api/file all 200 (expected 400/415/404 for security probes), no compile or runtime errors.

Deviations:
- Release APK is intentionally NOT downloadable (binary blocked by /api/file by design); hero shows an info chip labeling it as available in android/dist/, per spec.
- Test totals in the UI (e.g. "22/22", suite list) are parsed live from the XML files, not hardcoded; only assembleDebug/assembleRelease/lintDebug SUCCESS and lint "0 errors" are hardcoded facts from worklog.md.
- The 4th XML suite (YtMusicSearchParserTest) renders in the API payload; the UI surfaces suite count/totals rather than a per-suite table (kept the stats section compact).

Stage Summary:
- Delivery dashboard is COMPLETE and browser-verified: real filesystem numbers only, sandboxed file API, honest criteria reporting, working source browser and docs.
- Files added/changed: src/app/page.tsx, src/app/layout.tsx (metadata), src/app/globals.css (.rm-theme theme), src/lib/ridho.ts, src/app/api/project/route.ts, src/app/api/file/route.ts, src/components/dashboard/{section-heading,hero,build-stats,criteria-table,architecture,source-browser,ytm-card,docs-tabs}.tsx.
- API surface: GET /api/project (full payload), GET /api/file?path=android/<file> (sandboxed text, ≤100 KB).
- Quality gates: `bun run lint` clean; dev.log shows all routes compiling/serving without errors; agent-browser verification passed (render, real tree, file loading, no console errors).
- Next: final integration review (Task 11) if scheduled.
---
Task ID: 12-13 (push + feature continuation)
Agent: Z.ai Code (main orchestrator)
Task: Push project to github.com/ridho1141haha/MusicPlayer; continue development (sleep timer + playback speed).

Work Log:
- Git: repo already initialized by sandbox (auto-commits). Added remote origin (https://github.com/ridho1141haha/MusicPlayer.git, no token stored in config). Committed prebuilt APKs (android/.gitignore got `!dist/*.apk` exception) + root README.md.
- Push attempt 1+2 FAILED: token from user returned HTTP 401 against api.github.com (verified independently via curl; also length anomaly: 37 chars after ghp_ prefix vs classic 36). Likely revoked by GitHub secret scanning (token was pasted into chat) or a copy error. LOCAL COMMITS ARE READY: `git push -u origin main` succeeds once valid credentials exist.
- Created mandatory cron webDevReview job (every 15 min, job_id 451761).
- Implemented v1.1.0 features:
  - Sleep timer: moon icon in Now Playing top bar -> dialog (Off/5/10/15/30/60 min). Implemented as Media3 custom session command (com.ridho.music.SET_SLEEP_TIMER) handled in PlaybackService -> survives UI death; fires player.pause() only. Least-privilege onConnect exposes exactly this one command.
  - Playback speed: "1x" chip in top bar -> dialog (0.75/1/1.25/1.5/2). Player.setPlaybackSpeed + persisted in SettingsRepository, re-applied on service create.
  - New icon ic_bedtime, strings (sleep/speed), FormatUtils.formatSpeed, layout changes (np_sleep, np_speed), version bumped 1.0.0 -> 1.1.0 (versionCode 2).
- Build iterations (root causes via javap on AARs): MediaSession.ConnectionResult is NESTED (no top-level class); SessionCommand requires (String, Bundle) constructor; SessionCommands.Builder.addAllSessionCommands() is package-private -> explicit least-privilege list.
- Final verification (all executed): assembleDebug OK, assembleRelease (R8) OK, testDebugUnitTest 22/22 OK, lintDebug 0 errors. APKs refreshed in android/dist (9.8 MB debug / 2.9 MB release) + public/ridho-music-v1.1.0-debug.apk; dashboard hero/footer links updated; CHANGELOG 1.1.0 entry added; README sizes updated; bun run lint clean; dev.log clean.
- Committed as 44996aa.

Stage Summary:
- v1.1.0 complete and build-verified; all work committed locally on main.
- BLOCKED (external): git push — needs a valid GitHub token with repo/contents:write scope. Retry command pattern: `cd /home/z/my-project && GH_TOKEN=<valid-token> git -c credential.helper='!f(){ echo username=ridho1141haha; echo password=$GH_TOKEN; }; f' push -u origin main`.
- Security: the user's pasted token was exposed in chat and is invalid/likely revoked — advise immediate rotation and fine-grained PAT (Contents: read/write on MusicPlayer only).
- Next priorities: push once credentials work; optional roadmap: album/artist browse endpoints, playback-speed button state in mini player, Android Auto surface, NewPipe GPLv3 flavor.

---
Task ID: AUDIT-1
Agent: Z.ai Code (integration auditor — NO code changes)
Task: Audit integrasi sumber musik Ridho Music (search/metadata/stream/playback), bedakan bukti vs asumsi, jalankan tes yang ada, probe live InnerTube, laporkan tanpa mengubah kode.

Work Log:
- Read worklog.md (Tasks 1–13) + all network/source code: domain/source/MusicSource.java, source/LocalMusicSource.java, source/yt/{InnertubeClient,YtMusicSearchParser,YouTubeMusicSource}.java, ServiceLocator.java, player/PlaybackService.java, ui/fragment/SearchFragment.java, ui/SettingsActivity.java (probe), app/build.gradle, AndroidManifest.xml, README §4, CHANGELOG.
- Confirmed: exactly ONE network path in the app — OkHttp in InnertubeClient (HTTPS-only, no credentials/cookies/TLS bypass). Used by YouTubeMusicSource (search + player endpoint) and SettingsActivity reachability probe. No NewPipe, no signature deciphering, no ad-blocking anywhere.
- Re-ran unit tests FRESH on current tree (incl. uncommitted v1.2.0 work): `testDebugUnitTest --rerun` → BUILD SUCCESSFUL, 22/22 (Track 4, Lrc 7, YTSource 7, YTParser 4) at 2026-10-11T14:27Z. Tests are JVM fixture tests — NOT real-audio tests. Instrumented test NOT run (no device/emulator).
- Live probes (exact app requests, evidence only):
  1. POST search (WEB_REMIX 1.20241028.01.00), query "test" → HTTP 200, 199,686 B. Response: musicCardShelfRenderer ×1, itemSectionRenderer ×29, musicShelfRenderer ×0. Real items present (e.g. "Testing" — Skusta Clee, videoId f5dBEd4L2Uc; album MPREb_LTYh0J7JtPT).
  2. Same, query "Lathi" → HTTP 200, 216,553 B, musicShelfRenderer ×0 again; first song "LATHI", videoId UwTnUpDuwGg.
  3. POST player (ANDROID_MUSIC 6.42.32/sdk30, videoId UwTnUpDuwGg, same payload as resolveStreamUri) → HTTP 200 but playabilityStatus=LOGIN_REQUIRED ("Please sign in"), NO streamingData → in-app result would be typed SourceException.UNAVAILABLE.
- Workspace state note: 15 uncommitted changes = in-flight v1.2.0 (share/top-tracks; UI+data layer only, does NOT touch source/yt or playback resolution). versionCode 3 / 1.2.0 in build.gradle, CHANGELOG still at 1.1.0.

Stage Summary:
- FINDING A (bug, fixable): live InnerTube search no longer returns musicShelfRenderer shelves → YtMusicSearchParser returns 0 sections → in-app YTM search shows empty despite HTTP 200. Unit fixtures encode the outdated shape (tests pass ≠ live works).
- FINDING B (external, by-design refusal): player endpoint requires sign-in for unauthenticated clients → remote playback currently impossible without prohibited bypass; app correctly fails typed UNAVAILABLE.
- FINDING C: Settings "reachability" probe only checks HTTP success → reports healthy even while search parses empty (diagnostic blind spot).
- No code changed during audit. Compliance verified clean (no deciphering/credentials/TLS bypass/geo workarounds).
- Recommended next: update parser to itemSectionRenderer/musicCardShelfRenderer (+ fresh captured fixtures), keep typed failures for playback, document verified findings in README §4.

---
Task ID: YTM-PARSER-FIX-1
Agent: Z.ai Code (parser + diagnostics fixer)
Task: From AUDIT-1 — fix YouTube Music search parser (2025+ flat layout), fix Settings diagnostics to distinguish HTTP-reachable from parsed-data, add live-capture fixtures + tests, full verification. No ToS bypass, no push.

Work Log:
- Pre-check: re-read YtMusicSearchParser(.java/Test) + SettingsActivity + strings.xml; no fixture resources existed (legacy fixture was inline). Re-verified live evidence from AUDIT-1 probes (query "test" & "Lathi": HTTP 200 but 0×musicShelfRenderer).
- Fresh live probes (unauthenticated WEB_REMIX, exact app request): query "test" 200/199,686 B; "Lathi" 200/216,553 B; gibberish query 200/15,081 B (API fuzzy-matches — never truly empty). Deep structure inspection: 1×musicCardShelfRenderer (videoId/browseId on title.runs[0].navigationEndpoint; subtitle "Type • Artist • metric • m:ss") + N×itemSectionRenderer (1 item each; typed subtitle in flex[1]; metric in flex[2]; NO fixedColumns); kinds interleaved (Song/Single/Artist/Video/Episode/Profile/Playlist/Podcast); NO continuationItemRenderer anywhere.
- Fixtures: 3 sanitized trims of REAL captures → app/src/test/resources/ytm/{search_live_2026-10-11_lathi,test,gibberish}.json (3.8–21.8 KB). Sanitization: trackingParams/clickTrackingParams stripped, bulky parse-irrelevant keys (menu/onTap/playlistItemData) dropped, blocks trimmed; all parse-relevant fields verbatim.
- YtMusicSearchParser.java rewritten (261 lines changed): parse() now walks legacy musicShelfRenderer (unchanged) + musicCardShelfRenderer → "Top result" + itemSectionRenderer items grouped by typed-subtitle kind → Songs/Videos/Albums/Artists/Results (LinkedHashMap preserves response order). parseCardItem parses endpoint from title.runs[0] + duration from subtitle tail. splitSubtitle splits "Type • Artist • metric • m:ss"; METRIC_PATTERN prevents "238M plays" becoming album; KIND_ARTIST → artist null (title IS the artist). Skipped kinds: playlist/community playlist/featured on/podcast/episode/profile/station. Unknown endpoints (MPEDG…/MPSP…) → null as before. Contract unchanged (null root → null; unexpected → empty).
- YtMusicSearchParserTest 4 → 10 tests: legacy fixture (kept), live lathi fixture (Top result ytm:8uy7G2JXVSA dur 187000; Songs ytm:UwTnUpDuwGg; Albums MPREb_CVL4u2p5bWY; Artists ytm-artist:UCeKD0TroyCQj0wAG_qLjxYw; metric-not-album; section order), live test-query fixture (Testing/Skusta Clee; card album MPREb_LHCI5PDnbYo; MPSPPL podcast skipped), live gibberish fixture (Episode card skipped; fuzzy-match video parsed), malformed/unknown-structure/empty-tabs defensive, typed-subtitle classification units, durationParsing (kept).
- SettingsActivity diagnostics: replaced isReachable() (HTTP-only, masked parser drift — AUDIT-1 Finding C) with real-search probe using temp YouTubeMusicSource+InnertubeClient: "Connected · search OK (N results)" / "Reachable, but search returned no data (API layout may have changed)" / "Unreachable: <msg>". strings.xml: diag_ytm_api renamed "YouTube Music status" + 3 new strings. isReachable() kept (public API, unused by Settings now).
- Build fixes (root causes): lambda captured non-final `status` → final holder; addLegacyShelf needed `throws JSONException`; test helpers had stray @Nullable (not on JVM classpath) + 2 tests missing `throws Exception`.
- DISCOVERY: root .gitignore pattern `test` (line 49) silently excluded android/app/src/test/** — the ENTIRE unit-test suite had never been committed. Added `!android/app/src/test/` negation; committed together with this task's files (ea305f6, local only, NO push).
- Verification (all executed): testDebugUnitTest --rerun → BUILD SUCCESSFUL, 28/28 (Track 4, Lrc 7, YTSource 7, YTParser 10) at 15:04 UTC; lintDebug → 0 errors (abortOnError true); assembleDebug → OK, app/build/outputs/apk/debug/app-debug.apk 11,542,468 B (~11.0 MB) at 15:05 UTC. LIVE-PROOF: compiled real parser run against fresh live "test" capture → 5 sections / 18 tracks (Top result 1, Songs 5, Albums 3, Videos 6, Artists 3) → in-app search restored; Settings diag would show "Connected · search OK (18 results)".
- Side note: cron session auto-commit e86e3e8 (14:32 UTC) landed the v1.2.0 in-flight work (share/top-tracks); my commit contains only this task's scope.

Stage Summary:
- YTM search against LIVE API restored (real-parser-on-real-capture proof: 18 tracks for "test"); legacy layout compatibility kept; diagnostics now honest about layout drift.
- Files: YtMusicSearchParser.java (rewritten), YtMusicSearchParserTest.java (4→10 tests), 3 new live fixtures, SettingsActivity.java, strings.xml, .gitignore. Commit ea305f6 (local).
- Still untested/limits: real playback of YTM streams (player endpoint still LOGIN_REQUIRED — unchanged, by-design refusal); no device/emulator (instrumented smoke test, real-audio check, diagnostics UI on device NOT run); no continuation support (live responses have none — re-audit if YouTube adds them); gibberish queries fuzzy-match (UI can never show true empty state for YTM).

---
Task ID: WEBLAB-1 (FASE 0)
Agent: Z.ai Code (main orchestrator — overnight Web QA Lab task)
Task: FASE 0 — assess workspace before building Ridho Music Web Lab (no code changes in this step).

Work Log:
- Read worklog.md in full. Confirmed YTM-PARSER-FIX-1 (AUDIT-1 fix) is ALREADY COMPLETE on this tree: commit ea305f6 present, YtMusicSearchParser.java handles musicCardShelfRenderer + itemSectionRenderer + legacy musicShelfRenderer, 3 sanitized live fixtures at android/app/src/test/resources/ytm/, SettingsActivity diagnostics rewritten. Working tree clean on main.
- Re-verified on disk: 3 fixtures present (gibberish 3,994 B / lathi 21,850 B / test 16,118 B); parser source contains 6 refs to new renderer types; dev server running (bun run dev, port 3000, healthy 200s in dev.log).
- /tmp live captures still present: yt_search_resp.json 199,686 B, yt_lathi.json 216,553 B, yt_player.json 3,028 B (player = LOGIN_REQUIRED evidence).
- Stack check (Next.js side): Next 16 + React 19 + Tailwind 4 + full shadcn/ui set + zustand + @tanstack/react-query + @dnd-kit (usable for queue reorder) + framer-motion. No vitest yet (will add as devDep for web unit tests).
- Decisions (conservative, documented): (1) Web Lab = Next.js app already in this repo; the old delivery dashboard on / will be preserved as a "Project" tab inside the Web Lab (no feature deletion). (2) Architecture per user brief option (b): separate web test harness in TS that mirrors the Java parser, validated against the SAME fixtures via a shared fixtures/ dir + sync script — no fake "shared Java in browser". (3) QA Dashboard shows only real executed results from data/qa-results.json written by scripts/run-qa.sh; before first run it shows "no run recorded" — no invented numbers. (4) Live search in the playground uses the exact unauthenticated WEB_REMIX request the app uses; failures surfaced honestly. Player endpoint remains LOGIN_REQUIRED (blocker recorded, no bypass).

Stage Summary:
- Baseline recorded. Next: WEBLAB-2 shared fixtures + TS parser port + web unit tests, then Web Lab UI, then automated QA + E2E loop.

---
Task ID: WEBLAB-2/3 (foundations + web UI)
Agent: Z.ai Code (main orchestrator)
Task: Shared fixtures, TS parser port, web unit tests, lab APIs, core Web Lab UI.

Work Log:
- fixtures/ytm canonical registry: 3 real captures (copied 1:1 from android resources) + search_legacy_shelf.json (verbatim Java test fixture) + 3 clearly-labeled SYNTHETIC fixtures (edge cases / empty / unknown structure) + index.json with honest provenance. sync-fixtures.mjs --check: NO drift between web and Android copies.
- src/lib/lab/yt-search-parser.ts: faithful TS port of YtMusicSearchParser (commit ea305f6) + web-only extras that never affect accept/reject: parseWithTrace (accepted/rejected/info + reasons), collectRendererStats, findContinuationToken, explainRejection. One port bug found & fixed by tests (parseWithTrace used optArr for sectionListRenderer — tests caught it).
- vitest added (devDep). tests/unit/parser.test.ts: 28/28 PASS — golden expectations mirrored from YtMusicSearchParserTest (Lathi/test/gibberish captures, legacy, defensive cases, classification units) + edge-case + trace extras.
- APIs: GET/POST /api/lab/fixtures (registry + sandboxed content + user fixtures to data/fixtures-user/), POST /api/lab/search (EXACT InnertubeClient contract: WEB_REMIX, no credentials; parses server-side with same TS lib; typed failures network/timeout/http/parse), GET /api/lab/qa-results (real recorded runs only, honest "no run yet").
- Live proof through the API: query "Lathi" → HTTP 200, 488 ms, 216,116 B → Top result (ytm:8uy7G2JXVSA) + Songs (ytm:UwTnUpDuwGg) parsed correctly.
- UI: page.tsx = Web Lab shell (6 tabs, hash deep-links, sticky footer); DashboardTab (real QA results from data/qa-results.json + live /api/project numbers + feature checklist w/ evidence dialogs + run history); SearchPlaygroundTab (live/fixture modes, typed error states, sections, trace panel, renderer census, raw JSON); FixtureTesterTab (registry w/ origin badges, run parser, section/track counts, "Add fixture" dialog with client JSON validation); ParityTab (per-column statuses incl. policy); ProjectTab (the previous delivery dashboard preserved 1:1 as a tab — no feature deleted). Store: zustand (favorites/playCounts persisted with skipHydration; prototype simulation state).
- Lint fixes: missing ScrollArea import, non-existent lucide `Android` export → Wrench, removed stale eslint-disable. `bun run lint` clean. All routes 200 (/, /api/lab/*, /api/project).

Stage Summary:
- Web Lab core (Dashboard/Playground/Fixtures/Parity/Project) DONE and healthy. Prototype tab is a placeholder → WEBLAB-4 (subagent). Android re-verification → WEBLAB-5 (subagent, parallel). Next: run-qa.sh aggregator, E2E via agent-browser, final report.
---
Task ID: WEBLAB-5
Agent: general-purpose (subagent — Android verification)
Task: Re-run full Android verification on current tree (unit tests --rerun, lintDebug, assembleDebug), no code changes.

Work Log:
- Environment for all Gradle runs: cd /home/z/my-project/android; ANDROID_HOME=/home/z/android-sdk; JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64; /home/z/gradle-8.9/bin/gradle --no-daemon.
- Commands executed in order (exit codes):
  1. node scripts/sync-fixtures.mjs --check (from /home/z/my-project) → exit 0
  2. gradle --no-daemon :app:testDebugUnitTest --rerun → exit 0, BUILD SUCCESSFUL in 14s
  3. gradle --no-daemon :app:lintDebug → exit 0, BUILD SUCCESSFUL in 13s
  4. gradle --no-daemon :app:assembleDebug → exit 0, BUILD SUCCESSFUL in 13s
  5. stat -c %s + sha256sum app/build/outputs/apk/debug/app-debug.apk
- Unit tests (parsed from app/build/test-results/testDebugUnitTest/TEST-*.xml, fresh timestamp 2026-10-11T16:17:49):
  - com.ridho.music.domain.model.TrackTest: tests=4, failures=0, errors=0, skipped=0 → 4/4
  - com.ridho.music.lyrics.LrcParserTest: tests=7, failures=0, errors=0, skipped=0 → 7/7
  - com.ridho.music.source.yt.YouTubeMusicSourceTest: tests=7, failures=0, errors=0, skipped=0 → 7/7
  - com.ridho.music.source.yt.YtMusicSearchParserTest: tests=10, failures=0, errors=0, skipped=0 → 10/10
  - TOTAL: 28/28 passed (0 failures, 0 errors, 0 skipped) — matches baseline (Track 4, Lrc 7, YTSource 7, YTParser 10).
- lintDebug: BUILD SUCCESSFUL, exit 0 → 0 errors (abortOnError true in app/build.gradle lint block; any lint error would have failed the task). UnstableApiUsage + GradleDependency disabled deliberately (documented in build.gradle).
- assembleDebug: BUILD SUCCESSFUL, exit 0. APK: app/build/outputs/apk/debug/app-debug.apk — exact size 11,542,468 bytes; sha256 939c938a0657f99487caebb23ded1e3da41bb4064b54650d4e6549c43f2e845b; mtime 2026-10-11 15:05:25 UTC. versionName "1.2.0" (+ "-debug" suffix in debug build), versionCode 3 (from app/build.gradle).
- Fixture sync --check (WEBLAB-2 shared registry vs Android copies): "sync-fixtures: no drift, fixtures identical on both sides" — ok for search_live_2026-10-11_gibberish.json, search_live_2026-10-11_lathi.json, search_live_2026-10-11_test.json.
- Anomalies: none blocking. Observation: :app:assembleDebug ran fully UP-TO-DATE (33 tasks, none executed) on the unchanged tree, so the APK was not re-packaged — it is byte-identical to the YTM-PARSER-FIX-1 build (same size 11,542,468 B; mtime still 15:05:25 UTC) — Gradle verified all inputs unchanged. Test task was genuinely re-executed via --rerun (fresh XML timestamp 16:17:49). Note: ripgrep/Glob silently skip app/build/** (gitignored), so XML results were parsed via direct file reads instead.
- No application source, tests, or build config modified (run-and-report only).

Stage Summary:
- ALL GREEN: 28/28 unit tests (Track 4, Lrc 7, YTSource 7, YTParser 10), lintDebug 0 errors (abortOnError true), assembleDebug OK (app-debug.apk 11,542,468 B, sha256 939c938a…, v1.2.0/versionCode 3), fixture sync --check no drift. Real numbers for the Web QA Lab dashboard.

---
Task ID: WEBLAB-4 (prototype — subagent timed out, completed by main agent)
Agent: Z.ai Code (main orchestrator)
Task: Interactive UI Prototype tab (simulated app UI over the shared fixture catalog).

Work Log:
- full-stack-developer subagent hit a context deadline with zero output; built it directly.
- src/components/lab/prototype-tab.tsx (~800 lines, replaced placeholder): 4 views (Search / Queue / Top Tracks / Favorites) with mobile-first segmented nav + counts; filter search with honest empty/no-match states; TrackRow with artwork, favorite, queue menu (play next / add), simulated play/pause; Track detail dialog (id, source, duration, simulated plays, Play/Queue actions); persistent mini-player (progress m:ss / m:ss, transport) opening a bottom-sheet Now Playing with working Slider seek (bound to store.progressMs), favorite, plays counter, queue link; Queue view with @dnd-kit drag reorder (Pointer/Touch/Keyboard sensors, drag handle), remove, confirm-clear; Top Tracks sorted by persisted playCounts; favorites persisted via zustand persist (skipHydration + page-level rehydrate).
- Honesty: amber banner "UI simulation — playback here is a timer, not audio… YTM playback blocked (LOGIN_REQUIRED)"; Now Playing carries a SIMULATED PLAYBACK badge; playCounts labeled simulated. QA controls (collapsible) with LABELED failure injection driving the real loading→error→retry flow.
- Store additions: playgroundMode for cross-tab "Open in Search Playground". aria-labels on every icon control; 44px targets; rm-scroll ScrollAreas; no blue/indigo.

Stage Summary:
- Prototype complete and E2E-verified (see WEBLAB-6). Playback remains simulation by design.

---
Task ID: WEBLAB-6 (E2E + final verification + handover)
Agent: Z.ai Code (main orchestrator)
Task: agent-browser E2E, full QA pipeline, APK refresh, commit, handover.

Work Log:
- E2E (agent-browser, real Chromium): Dashboard shows REAL recorded suites ("Recorded 2026-10-11 16:52:37Z · 56 passed · 0 failed · 0 skipped") + suite output dialogs; feature checklist with evidence dialogs. Search Playground: LIVE search "Lathi" → HTTP 200, 453 ms, 211 KB, 15 items / 5 sections, LATHI 8uy7G2JXVSA 3:07 + UwTnUpDuwGg — correct; fixture mode offline ("no HTTP request was made", trace 8 accepted/0 rejected); fixture select warning fixed (controlled Select). Fixtures tab: registry with honest origin badges; edge-cases fixture → 1 track, 1 accepted / 4 rejected, no continuation (matches unit tests); empty fixture → "parses to empty"; legacy fixture → Songs + Albums (back-compat in browser); Add-fixture dialog → saved, listed as USER ADDED, parses empty-tabs correctly. Prototype: catalog 13 real fixture tracks; play/pause + playing badge + mini-player progress; queue add + DRAG REORDER verified (order flipped); favorites persist (badge 2); failure injection → real error card with injected message → toggle off → recovery to 13 of 13; Now Playing sheet + slider + SIMULATED badge. Parity Matrix renders with per-column statuses + policy notes. Project tab: CRASHED first (SectionHeading requires icon prop — "Element type is invalid" captured via window error listeners) → fixed with icons; then 0 errors, hero/build/source/YTM/docs all render.
- Responsive: 390×844 → no horizontal scroll; sticky footer verified on short page (footer bottom == viewport bottom) and pushed naturally on long page. Console clean after fixes. Screenshots: data/e2e-mobile-dashboard.png, e2e-desktop-fixture-tester.png, e2e-final-dashboard.png.
- BUGS FOUND & FIXED during E2E: (1) Project tab crash (missing SectionHeading icon prop → undefined component); (2) Select uncontrolled→controlled warning (value ?? undefined → ?? ''); (3) android/dist APKs were STALE (v1.1.0 10,245,639 B vs real v1.2.0-wip build) → refreshed debug from build outputs and REBUILT assembleRelease (3,079,882 B, sha256 d79f5b6b…) so every artifact matches latest source; public/ridho-music-v1.2.0-wip-debug.apk added.
- Full pipeline (2nd run, after fixes): bash scripts/run-qa.sh → ALL GREEN recorded 2026-10-11 17:04:38Z: web lint ✓, web vitest 28/28, android testDebugUnitTest --rerun 28/28 (Track 4, Lrc 7, YTSource 7, YTParser 10), lintDebug ✓ (0 errors), assembleDebug ✓, fixture sync no drift. APK 11,542,468 B sha256 939c938a0657f99487caebb23ded1e3da41bb4064b54650d4e6549c43f2e845b v1.2.0 (code 3).
- Local commit d627044 (41 files + worklog). NO push (per instructions).
- webDevReview cron created (15-min cadence) for overnight iterative QA/development.

Stage Summary:
- Web Lab COMPLETE: Dashboard (real numbers only), Search Playground (live+fixture, typed errors, trace), Fixtures & Parser tester (add/inspect/provenance), interactive Prototype (honest simulation), Parity Matrix, preserved Project dashboard.
- Verified: web 28/28 + android 28/28 + lint 0 + builds green + E2E golden path. Untested: device/instrumented, real audio playback (blocked: LOGIN_REQUIRED), Room DAOs.
- Still blocked (external, by policy): YTM streaming playback without sign-in. Next best steps: device testing on Galaxy A05s; optional continuation support if YouTube adds tokens; hook run-qa.sh into the cron loop.

---
Task ID: WEBLAB-7 (cron review round 1 — Lyrics Lab + polish)
Agent: Z.ai Code (main orchestrator, webDevReview cron)
Task: Status assessment + agent-browser QA; then feature round: LRC harness, Lyrics Lab, synced demo lyrics, styling polish.

Work Log:
- STATUS ASSESSMENT: dev server was DOWN on cron wake (background processes die between shell calls — known sandbox behavior) → restarted detached via setsid; GET / 200. Tree was clean at 0ae4dd0; no new failures pending.
- Features shipped this round:
  1. src/lib/lab/lrc-parser.ts — faithful TS port of LrcParser.java (TIME_TAG regex incl. [.:] fraction separator, multi-tag lines, metadata skip, timestamp-only skip, stable sort, activeLineIndex, normalizeFraction). Web-only extras (parseWithStats: metadataTags/timestampOnlyLines/plainLines) never affect output.
  2. tests/unit/lrc-parser.test.ts — 15 tests: all 7 LrcParserTest golden expectations mirrored + robustness (CRLF/CR, colon-fraction, timestamp-only, partial bracket, duplicate-tag replace parity) + 3 synthetic fixtures. Web suite: 28→43.
  3. fixtures/lrc/{demo_synced,demo_unsynced,demo_edge}.lrc + index.json — clearly labeled SYNTHETIC (LRC is an app-side artifact, not a network capture).
  4. GET /api/lab/lrc (list + sandboxed content read).
  5. Lyrics Lab tab (7th tab): fixture loader, paste area, parse stats badges, parsed-lines table, synced scrub slider driving activeLineIndex highlight.
  6. Prototype Now Playing: demo lyrics section (labeled SYNTHETIC) synced to the simulated clock with auto-scroll; TrackRow playing accent; "Copy track info" with HONEST clipboard states (copied ✓ / "Clipboard blocked by the browser").
  7. Dashboard: suite rows get status-colored left accent + hover; history rows get pass-proportion mini-bars (sm+).
  8. Styling: animated nav pill (framer-motion layoutId spring), per-tab fade/rise transition, shared EmptyState component.
  9. Android: YtMusicSearchParserTest +1 test (multiple items inside ONE itemSectionRenderer — locks loop behavior; production code untouched) → android suite 28→29.
- BUGS found & fixed during this round's E2E: (1) dev server down on wake (restarted); (2) PrototypeTab crash — useCallback used but not imported (SWC compiles without type-check; caught by agent-browser "Application error" + window error listener discipline); (3) clipboard fallback initially showed false success → now honest 3-state.
- E2E (agent-browser): Lyrics Lab — demo_synced.lrc → synced badge, 9 lines, metadata-skipped badge, scrubber 500→800ms via keyboard arrows keeps exactly 1 active row (line 0 spans 500–4000ms — correct); Prototype — play → Now Playing sheet shows 9 demo lyric lines with activeIdx advancing with the simulated clock; copy button shows honest "blocked" state in headless (no false success); Dashboard renders fresh run 17:23:38Z all-green + history bars; console clean; screenshot data/e2e-weblab7-lyrics.png.
- Full pipeline: bash scripts/run-qa.sh → ALL GREEN recorded 2026-10-11 17:23:38Z: web lint ✓, vitest 43/43, android testDebugUnitTest --rerun 29/29 (Track 4, Lrc 7, YTSource 7, YTParser 11), lintDebug ✓, assembleDebug ✓ (APK unchanged 11,542,468 B sha256 939c938a…), fixture sync no drift.

Stage Summary:
- Web Lab now covers BOTH Java parser contracts (InnerTube search + LRC lyrics) with mirrored golden tests; prototype gained synced demo lyrics + copy; dashboard/UX polished.
- Verified: 43 web + 29 android tests, lint 0, builds green, E2E golden path incl. new features. Untested on device: unchanged (no hardware).
- Risks/next: keep cron rounds bounded (this round ≈ 12 min); next candidate work — fixture diff view (compare two parses), queue context menu, top-tracks bar chart, Android instrumented test when a device appears. Playback stays blocked (LOGIN_REQUIRED, policy: no bypass).
---
Task ID: WEBLAB-8 (cron review round 2 — Fixture Diff Lab + report export + prototype polish)
Agent: Z.ai Code (main orchestrator, webDevReview cron)
Task: Status assessment + agent-browser QA; then feature round: fixture A/B diff, QA Markdown export, trend sparkline, Top Tracks chart, queue context menu, styling details.

Work Log:
- STATUS ASSESSMENT: dev server up (GET / 200); tree clean at 2fd52db; all 7 tabs rendered with ZERO console errors in a fresh agent-browser sweep; bash scripts/run-qa.sh → ALL GREEN baseline @ 2026-10-11 17:27:00Z (web 43/43, android 29/29, lint 0, builds OK, sync no drift). Project stable → chose a new-features round per the next-candidates list from WEBLAB-7.
- Features shipped this round:
  1. src/lib/lab/fixture-diff.ts — pure TS diff of two ParseResults: track added/removed/changed/unchanged (id-keyed, duration-0 tolerant, album null-vs-set detected), section count deltas, renderer-census movement (sorted by |delta|), deterministic order + summary line. 12 vitest tests (tests/unit/fixture-diff.test.ts) incl. legacy→live migration, both-null robustness, determinism lock.
  2. src/components/lab/fixture-diff-panel.tsx — "Diff two fixtures" card in Fixtures tab: A/B selects (defaults: legacy shelf vs live Lathi capture), swap button, animated summary badges (+added/−removed/~changed/unchanged/total→total), track diff rows (framer-motion slide-in, per-kind color), sections A→B table, renderer-census movement badges. Full-width below the inspector.
  3. src/lib/lab/qa-report.ts — client-side Markdown report from the RECORDED run only (suites table with padded columns, APK block with path/size/sha256/version, run-history table, mandatory "Honest scope" section listing what is NOT verified: no device tests, no audio playback — LOGIN_REQUIRED). 4 vitest tests. Dashboard: "Export report (Markdown)" button → Blob download + toast; verified a real file landed in ~/Downloads with real numbers.
  4. Dashboard "Run history" gains a dependency-free SVG TrendSparkline (passed assertions per run, oldest→newest, min/max labels, aria-labeled, emerald stroke + end dot).
  5. Prototype Top Tracks: animated horizontal play-count bar chart (framer-motion spring widths, amber #1 accent, count labels, honest "SIMULATED play counter (browser-local)" caption) above the ranked list.
  6. Prototype Queue: right-click / long-press context menu on every row (play/pause simulated, play next, move to top/bottom, add/remove favorites, copy track info with honest clipboard toast, remove — destructive styled). Drag handle preserved; drag-reorder regression-tested in-browser after the restructure.
  7. src/data/features.ts refreshed with current evidence (android 29, web 59) + 3 new WEBLAB-8 entries (diff lab, report export, chart/menu).
- Verification: bun run lint clean; vitest 59/59 (28 parser + 15 lrc + 12 diff + 4 report); bash scripts/run-qa.sh → ALL GREEN @ 2026-10-11 17:39:49Z (web 59/59, android 29/29, lintDebug ✓, assembleDebug ✓ APK 11,542,468 B sha256 939c938a… unchanged, sync no drift).
- E2E (agent-browser, real Chromium): diff legacy→lathi shows +8 added · −2 removed · 0 changed · 2→8 items; Songs 1→3, Albums 1→3, Top result 0→1, Artists 0→1; renderer census itemSectionRenderer 0→7 (+7) and musicShelfRenderer 2→0 (−2) — the format-migration story made visible. Chart counts exactly matched play actions (Testing 3×, RMTP 2×, Schwarzes 1×). Context menu: move-to-top reordered queue, favorite persisted to localStorage (ridho-lab-store), clipboard path exercised. Export: toast "Report downloaded ✓ ridho-qa-report-2026-10-11T172700Z.md" + real file verified on disk. Drag-reorder regression: Testing moved 1→2 via handle. Mobile 390×844: no horizontal scroll on fixtures/diff/prototype; screenshots data/e2e-weblab8-mobile-{diff,chart}.png + e2e-weblab8-desktop-diff.png.

Stage Summary:
- Web Lab now has 8 tabs of working tooling and 59 web / 29 android green tests; fixture diffing turns the parser's format migration into an inspectable artifact; QA results are exportable as a self-honest Markdown report.
- Untested on device: unchanged (no hardware/emulator). Playback still blocked (LOGIN_REQUIRED, policy: no bypass).
- Risks/next candidates: per-fixture "expected parse" assertions (golden snapshot editor); live-search response capture button to grow the real-fixture corpus; queue "shuffle (simulated)"; diff against LIVE search results (not only stored fixtures); Android instrumented tests when a device appears.
---
Task ID: WEBLAB-9 (cron review round 3 — live capture, diff-vs-live, shuffle, shortcuts, polish)
Agent: Z.ai Code (main orchestrator, webDevReview cron)
Task: Status assessment + agent-browser QA; then feature round from the WEBLAB-8 next-candidates list.

Work Log:
- STATUS ASSESSMENT: dev server up (GET / 200); tree clean at 85ec6a9 (cron auto-commit of tool-results only); all 7 tabs rendered with ZERO console errors in a fresh agent-browser sweep; baseline run-qa.sh all green. Stable → chose a new-features round.
- BUG FOUND BY E2E (and fixed): the fixtures POST cap (512 KB) rejected real pretty-printed live captures (~725 KB for "Lathi") — "Capture failed: Fixture too large". Raised MAX_USER_FIXTURE_BYTES to 1 MB + UI copy updated. The feature is useless against real responses without this.
- Features shipped this round:
  1. Live capture → user fixture (real-corpus growth): /api/lab/search accepts includeRaw (returns untouched response root); Search Playground live success gains "Capture as fixture" → dialog with unit-tested name suggestion (suggestFixtureName, mirrors built-in convention), note field, client NAME_PATTERN pre-check; POST /api/lab/fixtures now records provenance (query, capturedAt) and listUser honors stored origin → captured fixtures show origin 'real-capture'. E2E: saved data/fixtures-user/search_live_2026-10-11_lathi_weblab9.json (742 KB, _meta origin real-capture + query + capturedAt), "saved …" badge + toast, fixture list refreshed.
  2. Diff vs LIVE: Diff panel side B gains fixture/live toggle; live mode runs the exact InnerTube request and reassembles a ParseResult via parseResultFromLivePayload (structural type guard, honest null on shape mismatch — never an empty parse); failures surface as-is; amber "live · X ms" badge in the summary strip; swap disabled in live mode (needs two fixtures). E2E: legacy shelf → LIVE "Lathi" · 391 ms · +15 added · −2 removed · 2→15 items.
  3. Queue shuffle (simulated): pure shuffledQueue (Fisher–Yates, injectable RNG; current track keeps its INDEX; no mutation) + store action + toolbar button (disabled < 2 tracks) + queue context-menu entry, all labeled simulated. E2E: 6-track queue shuffled, members preserved.
  4. Keyboard shortcuts 1–7 for lab sections: ignored while typing (input/textarea/select/contenteditable) and with modifiers; kbd number chips in the nav (sm+ only), footer documents the keys. E2E: 3 → #fixtures, 1 → #dashboard, typing "3" into the search input does NOT navigate.
  5. Styling/details: animated SVG pass-rate donut on the QA run card (100% emerald / rose / amber by outcome, aria-labeled); hydration-safe "recorded X ago" chip (relativeTime unit-tested, refreshes every 30 s); slim gradient accent on the sticky header; scroll-to-top floating button (appears > 320 px, smooth scroll, hides at top — E2E verified); ring on the active nav pill.
- Tests: +26 (fixture-name 9, shuffle 6, live-diff 7, relativeTime 4) → web suite 59 → 85/85. bun run lint clean.
- Verification: bash scripts/run-qa.sh → ALL GREEN recorded 2026-10-11 18:03:39Z: web lint ✓, vitest 85/85, android testDebugUnitTest --rerun 29/29 (Track 4, Lrc 7, YTSource 7, YTParser 11), lintDebug ✓, assembleDebug ✓ (APK 11,542,468 B, sha256 939c938a… unchanged v1.2.0 code 3), fixture sync no drift. Dashboard donut shows the fresh run (114/114, "just now").
- Mobile 390×844: no horizontal scroll on dashboard/fixtures/playground; screenshots data/e2e-weblab9-mobile-dashboard.png + e2e-weblab9-desktop-dashboard.png. All-tab console sweep after changes: 0 errors.
- data/fixtures-user/api_probe_weblab9.json (curl probe) removed; the real lathi_weblab9 capture kept as a legitimate corpus growth.

Stage Summary:
- Web Lab now grows its own real-fixture corpus in one click and diffs stored parses against the live API — the format-drift story is now an ongoing monitor, not just a stored demo. 85 web / 29 android tests green; QA pipeline all green; APK unchanged.
- Untested on device: unchanged (no hardware/emulator). Playback still blocked (LOGIN_REQUIRED, policy: no bypass). visitorData in captures comes from the unauthenticated WEB_REMIX request — same as existing built-in fixtures, no credentials involved.
- Risks/next candidates: per-fixture "expected parse" golden assertions (drift alarm on run-qa), playground search history, queue repeat toggle, LRC fixture from a real .lrc file, Android instrumented tests when a device appears, extension page for android/dist release APK refresh.
---
Task ID: WEBLAB-10 (cron review round 4 — golden drift alarm, search history, repeat-one)
Agent: Z.ai Code (main orchestrator, webDevReview cron)
Task: Status assessment + agent-browser QA; then feature round from the WEBLAB-9 next-candidates list.

Work Log:
- STATUS ASSESSMENT: tree clean at 55bcbea; dev server healthy; agent-browser sweep of all 7 tabs → 0 console errors; baseline green. Stable → feature round.
- Headline: the Web Lab now has a REAL regression gate for parser shape drift.
  1. Golden parse expectations (drift alarm): fixtures/ytm/expectations.json locks the verified-current parse shape of all 7 fixtures (values dumped from the TS harness, consistent with YtMusicSearchParserTest goldens: lathi 4 sections/8 tracks [Top result, Songs, Albums, Artists], test 3/5, gibberish 1/1 [Videos], legacy 2/2, edge-cases 1/1 keepme001, empty/unknown 0/0). src/lib/lab/expectations.ts = evaluateExpectation + validateExpectationsFile (schema guard, ≥1 assertion required, _-keys skipped). scripts/check-expectations.ts (bun, TS-native) → machine summary /tmp/rm-qa/golden.json + exit 1 on drift; wired into run-qa.sh as suite #7 "golden parse expectations (fixture ↔ parser contract)"; collect-qa.mjs reads golden.json for REAL counts. NEGATIVE TEST: corrupted trackCount 8→99 → exit 1 "1 drift of 7"; restored → 7/7, exit 0. The alarm provably fires.
  2. PORT BUG fixed pre-flight: expectations initially consumed parse() as if it returned ParseResult — it returns SearchSection[] | null directly (Java-mirrored); API reshaped to evaluateExpectation(sections, exp). Caught because the first script run showed 0 sections everywhere; dump-vs-script comparison isolated it.
  3. GoldenExpectationsCard (Fixtures tab) + GET /api/lab/expectations: in-browser evaluation with the same lib, per-fixture golden ✓/DRIFT badges + honest failure lines + notes, "(no golden)" visibility, validateError surfaced. E2E: 7/7 hold, 7 rows all golden.
  4. Search history (session-local): store addSearchHistory (cap 8, per-query dedupe, consecutive-dup replace); every live run records its REAL outcome incl. typed errors; chips re-run on click (query refill + run), failures styled red, Clear button, honest "this browser session only". E2E: Lathi 200·15 items·448 ms + gibberish xyzzy 200·12 items·361 ms chips; chip click re-ran Lathi (sections re-rendered).
  5. Repeat one (simulated): pure computeTick (tests: advance/restart/progress, zero-length guard) + store tick rewired + Now Playing toggle (accent when active, aria-pressed, explanatory badge). E2E: repeat ON + seek-to-end (slider End → 205000) → restarted at 0:06, still playing; repeat OFF + end → stop at 0 (empty-queue advance → stop is the store's designed behavior).
  6. Styling: app icon (src/app/icon.svg — tab favicon, theme-matched), history chip design (status dot, mono meta, hover ring), golden card badges, repeat-one active accent.
- Tests: +12 (expectations 10, tick 5 — reported as 12 with the file split) → web suite 85 → 97/97. lint clean.
- Verification: bash scripts/run-qa.sh → ALL GREEN @ 2026-10-11 18:14:56Z with SEVEN suites: web lint ✓, vitest 97/97, android 29/29, lintDebug ✓, assembleDebug ✓ (APK 11,542,468 B sha256 939c938a… v1.2.0 code 3 unchanged), fixture sync no drift, golden 7/7. Dashboard donut: 133/133 (100%). Mobile 390×844: no horizontal scroll on fixtures/playground/prototype. 0 console errors across the sweep. Screenshot data/e2e-weblab10-mobile-golden.png.

Stage Summary:
- The QA pipeline is now self-monitoring: any future parser edit or fixture edit that changes a parse shape turns the run-qa golden suite red on the dashboard — drift is caught by the pipeline, not by a human noticing wrong results.
- Untested on device: unchanged (no hardware). Playback still blocked (LOGIN_REQUIRED, policy: no bypass).
- Risks/next candidates: Android-side golden check could consume the same expectations.json via a small JUnit test (parity both directions); playground history could persist (optional); "expected parse" golden for a LIVE run (drift alarm on live shapes — experimental, noisy by nature); queue repeat-all indicator; Android instrumented tests when a device appears.
---
Task ID: WEBLAB-11 (cron review round 5 — android golden parity, persistence, repeat tri-state, lrc upload, styling)
Agent: Z.ai Code (main orchestrator, webDevReview cron)
Task: Status assessment + agent-browser QA; then feature round from the WEBLAB-10 next-candidates list.

Work Log:
- STATUS ASSESSMENT: tree clean at d2460c2 (WEBLAB-10); dev server healthy; agent-browser sweep of all 7 tabs → 0 console errors; baseline run-qa.sh ALL GREEN (97 web / 29 android). Stable → feature round from the WEBLAB-10 candidates list.
- Headline: the golden drift alarm is now BIDIRECTIONAL.
  1. Android-side golden contract parity: scripts/sync-fixtures.mjs now also syncs fixtures/ytm/expectations.json into android test resources; new GoldenExpectationsTest.java (3 tests) evaluates the SAME contract file with the REAL YtMusicSearchParser — parsesExactlyPerGoldenContract (all drift collected into ONE honest report: sectionCount / trackCount / ordered sectionTitles / mustIncludeIds / mustNotIncludeIds; ≥3 fixtures evaluated, ≤4 web-only skips allowed), goldenContractCoversEverySyncedLiveFixture (a newly captured fixture without a golden entry can never silently escape the alarm), goldenContractSchemaIsWellFormed (counts required + provenance note required, ≥7 entries). NEGATIVE TEST: corrupting trackCount 8→13 in the synced copy → BUILD FAILED with "PARSER DRIFT vs golden contract … If this change is INTENTIONAL, update expectations.json" — the alarm provably fires. Gotcha fixed on the way: android.jar's org.json shadows the maven one (no keySet()) → keys() iterator used. javax.annotation.Nullable avoided (not on test classpath). Android suite 29 → 32 green.
  2. Search history PERSISTED (WEBLAB-10 was session-local): searchHistory added to the zustand persist partialize; playground copy now honest — "persisted in this browser (localStorage)". E2E: ran a real live search ("weblab11 persistence probe", HTTP 200 · 9 items · 340 ms), hard reload → chip SURVIVED.
  3. Repeat tri-state (off → all → one): tick.ts now exports RepeatMode, computeTick(totalMs, progressMs, mode) and NEW computeNextIndex(queueLength, currentIndex, mode) — repeat 'off' at the last track STOPS (-1), 'all' wraps, 'one' restarts via computeTick; manual next/previous intentionally keeps wrap-around (user intent, documented). Store: repeatOne:boolean → repeatMode + cycleRepeatMode(); tick() auto-advance goes through computeNextIndex (honest stop at queue end instead of the old implicit wrap). UI: Now Playing button cycles with per-state icon (Repeat vs Repeat1), aria-pressed, honest badge `repeatModeLabel(mode) (simulated)`. Unit tests: tick.test.ts rewritten (13 tests: progress/advance/restart per mode, zero-length guard, computeNextIndex stop/wrap/fallback/single-track cases, label copy). E2E: repeat OFF at last track end → stopped (progress reset, isPlaying false — previously it wrapped); repeat ALL → end of last track wrapped to queue[0]; repeat ONE → same track restarted, still playing.
  4. Lyrics Lab real .lrc upload: file input (.lrc/.txt, sr-only + labeled button) → FileReader → same parseWithStats mirror; honest source note "read locally in the browser, never uploaded to a server"; file name + KB badge. E2E: uploaded a real 188-byte .lrc (3 timed lines + 1 unsynced + 3 metadata tags) → synced badge, 4 lines, metadata-skip badge, first line rendered.
  5. [Mandatory] styling details: pure-CSS equalizer bars (.rm-eq, 4 bars, rm-eq-bounce 0.9s, prefers-reduced-motion → static) on playing queue rows + Now Playing title; teal→amber gradient on the seek slider fill + thumb glow (.rm-slider-fill); dashboard suite cards get pass/fail in-state glow (.rm-suite-pass/fail) replacing the plain left border; nav pills get hover lift + active shadow (.rm-nav-pill, reduced-motion aware).
  6. REAL BUGS fixed found by typecheck during the round: (a) LabTab union was missing 'lyrics' since the Lyrics tab was introduced (WEBLAB-7) — deep links + keyboard shortcut 4 worked only via an unsafe `hash as LabTab` cast; now typed correctly. (b) search-playground fixture success state carried a never-read top-level durationMs (type error) — removed; data.durationMs is the real carrier. bunx tsc --noEmit now clean for src/.
- Verification: bun run lint clean; vitest 104/104 (was 97; tick suite 5 → 13); tsc clean (src); bash scripts/run-qa.sh → ALL GREEN @ 2026-10-11 18:41:12Z: web lint ✓, vitest 104/104, android testDebugUnitTest --rerun 32/32 (Track 4, Lrc 7, YTSource 7, YTParser 11, GoldenExpectations 3), lintDebug ✓, assembleDebug ✓ (APK 11,542,468 B, sha256 939c938a… unchanged v1.2.0 code 3), fixture sync no drift (now incl. expectations.json), golden 7/7.
- E2E (agent-browser, real Chromium): repeat cycle labels + aria-pressed verified per state; end-of-queue matrix (off→stop, all→wrap, one→restart) exercised through the real slider; history chip survived reload; .lrc upload parsed with honest provenance; equalizer computed style verified (4 bars, rm-eq-bounce 0.9s) on 2 nodes; gradient slider background verified. Mobile 390×844: no horizontal scroll on prototype. 0 console errors across all 7 tabs. Screenshots data/e2e-weblab11-mobile-prototype.png, e2e-weblab11-desktop-prototype.png, e2e-weblab11-desktop-nowplaying.png.
- data/features.ts refreshed: search-history + repeat entries updated to the new truth; +3 entries (golden-parity-android, lrc-upload, styling-details).

Stage Summary:
- Parser-shape drift is now caught on BOTH sides of the parity wall: the same expectations.json turns the web golden suite AND the Android JUnit suite red — one contract, two parsers, no blind spots. The prototype's playback semantics are now explicit and provable (stop vs wrap vs restart), search history survives reloads, and Lyrics Lab accepts real .lrc files without any server round-trip.
- Untested on device: unchanged (no hardware/emulator). Playback still blocked (LOGIN_REQUIRED, policy: no bypass).
- Risks/next candidates: live-run golden probe (drift alarm on LIVE shapes — experimental); queue repeat indicator outside the sheet (mini-player chip); LRC corpus growth from user uploads (currently parse-only, not saved); Android instrumented tests when a device appears; release APK refresh page under android/dist.
---
Task ID: WEBLAB-12 (cron review round 6 — mini-player upgrade, LRC library, corpus stats)
Agent: Z.ai Code (main orchestrator, webDevReview cron)
Task: Status assessment + agent-browser QA; then feature round from the WEBLAB-11 next-candidates list.

Work Log:
- STATUS ASSESSMENT: tree clean at d533c48; dev server healthy (GET / 200); agent-browser sweep of all 7 tabs with an error listener → 0 console errors / 0 unhandled rejections; baseline run-qa.sh ALL GREEN (104 web / 32 android). Stable → feature round: mini-player upgrade + LRC library + corpus stats.
- Headline features shipped this round:
  1. Mini-player upgraded (WEBLAB-11 candidate "repeat indicator outside the sheet"): aria-labeled progress hairline across the top of the bar (pure progressPercent — clamps ≥100, NaN/Infinity/negative/zero-total safe — unit-tested), repeat chip cycling the SAME tri-state as the sheet (accent amber + aria-pressed when active, Repeat1 icon for 'one', title = repeatModeLabel), mono "3/6" queue-position badge via queuePositionLabel (unit-tested, hidden when not queued), and a 4-bar equalizer overlay pill on the artwork while playing (.rm-eq-overlay — opaque background so it stays legible on any album art).
  2. My LRC library (WEBLAB-11 candidate "LRC corpus growth from user uploads"): new pure module src/lib/lab/lrc-library.ts — upsertLrcEntry (replace-by-name IN PLACE keeping position, new names prepend, cap 12 with oldest falling off the tail, 256 KB content guard, honest 'empty-name'/'too-large' rejections), removeLrcEntry (idempotent), sortLrcLibrary (5 vitest tests incl. no-mutation + trim + cap overflow). Store: persisted lrcLibrary + saveLrc/removeLrc actions (partialize updated — survives reloads). Lyrics Lab UI: "Save current text" → dialog with sensible default name (uploaded file name or pasted_YYYY-MM-DD.lrc), counter badge n/12, load-back chips with saved-date + size tooltips, destructive-styled per-chip remove, toasts; honest copy everywhere: stored ONLY in this browser (localStorage), never uploaded.
  3. Dashboard "Lab corpus" card: four live stat tiles (built-in fixtures / user captures / golden contracts / LRC fixtures) fetched from /api/lab/fixtures, /api/lab/expectations, /api/lab/lrc — real endpoint counts; a failed endpoint hides its tile data instead of inventing numbers.
  4. [Mandatory] styling details: .rm-mini-player floating-surface shadow (reduced-motion aware), teal→amber gradient hairline mirroring the sheet's slider, .rm-eq-overlay pill variant of the equalizer, dashboard corpus tiles with per-metric accent colors (primary/emerald/amber/teal).
- REAL BUG fixed found by typecheck: src/data/features.ts used area 'Android' but the FeatureCheck union lacked it (slipped through WEBLAB-11's "tsc clean for src" claim) — union extended; bunx tsc --noEmit now genuinely clean for src/.
- Tests: +13 (tick progressPercent 3 + queuePositionLabel 2, lrc-library 5 + remove/sort 3... net file total 8 tick + 5 library) → web suite 104 → 117/117; lint clean; tsc (src) clean.
- E2E (agent-browser, real Chromium): corpus card shows the REAL counts 7 / 2 / 7 / 3 (matches direct API probe); mini-player appears on play — hairline advancing (0.24% → 6.7% over the session), queue chip 1/1 → 1/3 after adding two tracks, repeat chip cycles off → ALL (aria-pressed=true) → ONE → off through the REAL store (initial stale-read results were my eval's fault, re-verified with waits); Lyrics Lab: paste → save dialog (default name pasted_2026-10-11.lrc) → renamed → saved (toast + chip + badge 1/12) → HARD RELOAD → chip survived → load-back repopulated textarea + synced badge + 2 lines + honest "Loaded from YOUR library" note → remove → 0/12. Mobile 390×844: no horizontal scroll (scrollWidth 390 = clientWidth 390), mini-player fixed exactly at the bottom (bottom = vh within 2px — offsetParent is null for fixed elements, verified via getBoundingClientRect), repeat chip reachable. 0 console errors across all 7 tabs after the changes. Screenshots: data/e2e-weblab12-mobile-minplayer.png, data/e2e-weblab12-desktop-dashboard.png, data/e2e-weblab12-desktop-corpus.png.
- Verification: bash scripts/run-qa.sh → ALL GREEN recorded 2026-10-11 18:55:35Z: web lint ✓, vitest 117/117, android testDebugUnitTest --rerun 32/32, lintDebug ✓, assembleDebug ✓ (APK 11,542,468 B, sha256 939c938a… unchanged v1.2.0 code 3), fixture sync no drift, golden 7/7.
- data/features.ts: +3 WEBLAB-12 entries (mini-player upgrade, LRC library, corpus stats) + Android area fix.

Stage Summary:
- The prototype's persistent mini-player is now a real control surface (progress + repeat + queue position + playing affordance), uploaded lyrics are no longer parse-and-forget (they persist in the browser library), and the dashboard states exactly what test corpora exist. 117 web / 32 android green; pipeline all green; APK unchanged.
- Untested on device: unchanged (no hardware/emulator). Playback still blocked (LOGIN_REQUIRED, policy: no bypass).
- Risks/next candidates: queue repeat indicator inside the queue view (per-row state), LRC library export (download a saved entry as .lrc), search-history chips on the dashboard, live-run golden probe (experimental drift alarm on LIVE shapes), Android instrumented tests when a device appears.
---
Task ID: WEBLAB-13 (cron review round 7 — LRC export, dashboard history replay, queue repeat chip)
Agent: Z.ai Code (main orchestrator, webDevReview cron)
Task: Status assessment + agent-browser QA; then feature round from the WEBLAB-12 next-candidates list.

Work Log:
- STATUS ASSESSMENT: tree clean at 84516d9; dev server healthy; fresh agent-browser sweep of all 7 tabs with error listeners → 0 errors / 0 rejections; baseline run-qa.sh ALL GREEN @ 18:57:58Z (117 web / 32 android). Stable → feature round.
- Features shipped this round:
  1. LRC library EXPORT (WEBLAB-12 candidate): every library chip gains an emerald export button → client-side Blob download (text/plain) with unit-tested exportLrcFileName — strips path separators (basename only), removes control/illegal chars (keeps word chars, dots, dashes, spaces, parentheses, Latin-1/Greek/CJK/Hangul ranges), guarantees a .lrc extension, falls back to lyrics.lrc; toast confirms the real file name. +3 vitest tests (lrc-library suite now 11).
  2. Dashboard "Recent searches" card (WEBLAB-12 candidate): the SAME persisted history the playground shows surfaces on the dashboard as status-dotted chips — real outcomes only (emerald/rose dot, "9 items · 330 ms · age" mono meta, failures rose-tinted with errorKind); clicking a chip hands the query to the playground via a NEW consume-once store field replayQuery (session-local, not persisted) and the playground's mount effect consumes it, switches to live mode and re-runs the query for real. The playground remounts per tab switch, so the mount-only effect with getState() reads avoids stale closures and loops by construction.
  3. Queue toolbar repeat chip (WEBLAB-12 candidate): the queue view toolbar shows the tri-state as an explicit labeled chip (Repeat off / Repeat all / Repeat 1) cycling the SAME store state as the sheet + mini-player (aria-pressed, title = repeatModeLabel); active states amber accent.
  4. [Mandatory] styling details: .rm-stat-tile hover lift + number brightening on the corpus tiles (reduced-motion aware); one-shot .rm-repeat-chip-on pulse animation (amber ring, 600 ms, plays only when the mode turns on); framer-motion staggered rise-in on the dashboard history chips (40 ms cascade, capped at 300 ms); emerald hover state on the export button vs rose on remove.
- REAL BUG found & fixed by E2E: the dashboard chip's store-driven tab switch did NOT update the URL hash (deep links/keyboard shortcuts all sync it via replaceState; the chip bypassed that contract) — chip click now also replaceState's '#playground'. Re-verified: hash + input value + live results all correct after the fix.
- Typecheck catches: relativeTime(iso, now) needs 2 args (entry.at is epoch ms → new Date(entry.at).toISOString()); an unnecessary eslint-disable on the new mount effect (removed — exhaustive-deps does not flag getState() reads).
- Tests: 117 → 120/120 (exportLrcFileName 3). lint clean; tsc (src) clean.
- E2E (agent-browser, real Chromium): created REAL history ("weblab13 replay probe" HTTP 200 · 9 items · 330 ms); dashboard card shows 2/8 chips incl. the 27-min-old persisted "weblab11 persistence probe" chip → click → hash #playground + query replayed + live results rendered (post-fix); LRC export downloaded via agent-browser → data/e2e-weblab13-export.lrc content matches the saved entry EXACTLY (3 lines verified byte-for-byte by cat); queue repeat chip cycles off → all (pressed+pulse) → 1 → off through the real store; stat-tile transition verified computed (transform/border-color/box-shadow); mobile 390×844 no horizontal scroll (390=390); 0 console errors across all 7 tabs after changes. Screenshots: data/e2e-weblab13-mobile-history.png, data/e2e-weblab13-desktop-history.png, evidence download data/e2e-weblab13-export.lrc.
- Verification: bash scripts/run-qa.sh → ALL GREEN recorded 2026-10-11 19:06:48Z: web lint ✓, vitest 120/120, android testDebugUnitTest --rerun 32/32, lintDebug ✓, assembleDebug ✓ (APK 11,542,468 B, sha256 939c938a… unchanged v1.2.0 code 3), fixture sync no drift, golden 7/7.
- data/features.ts: +3 entries (lrc-export, dashboard-history, queue-repeat-chip).

Stage Summary:
- The LRC library is now a complete round-trip (save → reload → load → export), the dashboard closes the loop on search history (see real outcomes anywhere, re-run anywhere), and repeat mode is now visible in all three playback surfaces (sheet, mini-player, queue toolbar) backed by one store state. 120 web / 32 android green; pipeline all green; APK unchanged.
- Untested on device: unchanged (no hardware/emulator). Playback still blocked (LOGIN_REQUIRED, policy: no bypass).
- Risks/next candidates: LRC library bulk export (zip) or per-entry copy; live-run golden probe (experimental drift alarm on LIVE shapes); queue per-row "plays next" indicator when repeat-one is on; Android instrumented tests when a device appears; consider persisting dashboard history-card visibility preference.
