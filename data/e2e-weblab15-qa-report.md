# Ridho Music — QA report

- Run recorded: **2026-10-11 19:32:49Z**
- Report generated: **2026-10-11T19:34:19.525Z**
- Result: **ALL SUITES GREEN**
- Assertions: 181 passed · 0 failed · 0 skipped

## Suites

Suite                                       Status   Passed  Failed  Skipped  Time     Command
----------------------------------------------------------------------------------------------
web lint (eslint)                           PASS     —       —       —        7.6s     bun run lint
web unit tests (vitest)                     PASS     141     0       0        0.1s     bunx vitest run
android unit tests (testDebugUnitTest --rer PASS     32      0       0        0.5s     gradle :app:testDebugUnitTest --rerun
android lint (lintDebug)                    PASS     —       —       —        13.6s    gradle :app:lintDebug
android build (assembleDebug)               PASS     —       —       —        14.1s    gradle :app:assembleDebug
fixture sync check (web ⇄ android)          PASS     —       —       —        —        node scripts/sync-fixtures.mjs --check
golden parse expectations (fixture ↔ parser PASS     8       0       —        0.1s     bun scripts/check-expectations.ts

## APK

- Path: `android/app/build/outputs/apk/debug/app-debug.apk`
- Size: 11542468 bytes
- sha256: `939c938a0657f99487caebb23ded1e3da41bb4064b54650d4e6549c43f2e845b`
- Version: 1.2.0 (versionCode 3)

## Run history (newest first)

Recorded at             Passed  Failed  Skipped  All green
----------------------------------------------------------
2026-10-11 19:21:34Z    168     0       0        yes
2026-10-11 19:18:41Z    168     0       0        yes
2026-10-11 19:08:58Z    159     0       0        yes
2026-10-11 19:06:48Z    159     0       0        yes
2026-10-11 18:57:58Z    156     0       0        yes
2026-10-11 18:55:35Z    156     0       0        yes
2026-10-11 18:43:52Z    143     0       0        yes
2026-10-11 18:41:12Z    143     0       0        yes
2026-10-11 18:34:01Z    143     0       0        yes
2026-10-11 18:21:12Z    133     0       0        yes
2026-10-11 18:14:56Z    133     0       0        yes
2026-10-11 18:09:58Z    121     0       0        yes
2026-10-11 18:03:39Z    114     0       0        yes
2026-10-11 17:39:49Z    88      0       0        yes
2026-10-11 17:27:00Z    72      0       0        yes
2026-10-11 17:23:38Z    72      0       0        yes
2026-10-11 17:19:39Z    72      0       0        yes
2026-10-11 17:04:38Z    56      0       0        yes
2026-10-11 16:52:37Z    56      0       0        yes

## Live golden probe (non-gating signal)

- Status: **DRIFT** — 0 holds · 4 drift · 0 errors of 4 probed
- This is a SIGNAL, not a gate: live drift never fails the pipeline; the stored-fixture suites stay authoritative.
- Probed at: 2026-10-11T19:32:49.680Z
  - DRIFT  search_live_2026-10-12_lathi.json — 5 sections · 14 tracks [Top result, Songs, Albums, Artists, Videos]
      trackCount: expected 15, got 14
  - DRIFT  search_live_2026-10-11_lathi.json — 5 sections · 15 tracks [Top result, Songs, Albums, Artists, Videos]
      sectionCount: expected 4, got 5
      trackCount: expected 8, got 15
      sectionTitles: expected [Top result | Songs | Albums | Artists], got [Top result | Songs | Albums | Artists | Videos]
  - DRIFT  search_live_2026-10-11_test.json — 5 sections · 17 tracks [Top result, Albums, Songs, Artists, Videos]
      sectionCount: expected 3, got 5
      trackCount: expected 5, got 17
      sectionTitles: expected [Top result | Songs | Albums], got [Top result | Albums | Songs | Artists | Videos]
  - DRIFT  search_live_2026-10-11_gibberish.json — 6 sections · 19 tracks [Top result, Albums, Songs, Videos, Results, Artists]
      sectionCount: expected 1, got 6
      trackCount: expected 1, got 19
      sectionTitles: expected [Videos], got [Top result | Albums | Songs | Videos | Results | Artists]
      mustIncludeIds: missing "ytm:ly8H6zLFcMM"

## Honest scope — what this report does NOT claim

- No instrumented tests or real-device verification (this sandbox has no emulator/hardware).
- No real audio playback verification — YouTube Music player endpoint returns LOGIN_REQUIRED for unauthenticated clients (verified 2026-10-11); the lab refuses to bypass YouTube protections by policy.
- Web Lab browser checks are manual/E2E sessions, not part of this pipeline file.
