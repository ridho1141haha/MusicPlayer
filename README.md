# Ridho Music

A free, open-source, dark-themed **Android music player** — Java + Android Views,
powered by **Media3/ExoPlayer** with real background playback. No ads, no analytics,
no accounts. Optional experimental YouTube Music catalog search.

This repository contains:

| Path | What it is |
|---|---|
| `android/` | The complete Android Studio project (Java 17, minSdk 24, targetSdk 35) — **start here**: [android/README.md](android/README.md) |
| `android/dist/` | Prebuilt APKs — current validated debug build `ridho-music-v1.2.3-debug.apk` (10.3 MB) plus preserved historical artifacts and the unsigned release build (2.9 MB) |
| `android/app/build/outputs/` | ignored — build locally to regenerate |
| `src/` | Next.js 16 "delivery dashboard" that browses the Android sources and reports build/test status live (`/api/project`, `/api/file`) |
| `public/ridho-music-v1.2.3-debug.apk` | Directly downloadable debug APK (current version, v1.2.3 · versionCode 6) |
| [CHANGELOG.md](CHANGELOG.md) | Version history: what shipped in each version, test results, device-test status |
| [worklog.md](worklog.md) | Engineering work log (build iterations, fixes, verification results) |

## Quick start (Android app)

```bash
cd android
gradle assembleDebug          # → app/build/outputs/apk/debug/app-debug.apk
gradle testDebugUnitTest      # 55/55 JVM tests
gradle lintDebug              # 0 errors
```

Open `android/` in Android Studio for a GUI build. Full architecture notes, the
YouTube Music integration analysis, privacy policy and troubleshooting live in
[android/README.md](android/README.md).

## Quick start (web dashboard, optional)

```bash
bun install
bun run dev                   # → http://localhost:3000
```

## Version history

| Version | versionCode | Status |
|---|---|---|
| **1.2.3** | **6** | **Current** — Jamendo (official API) source + history-real-playback fix. [Details](CHANGELOG.md) |
| 1.2.0 | 3 | Baseline (2026-10-11) |
| 1.1.0 | 2 | Sleep timer, playback speed |
| 1.0.0 | 1 | First release |

Per-version details, test results, device-test status and APK checksums live in
[CHANGELOG.md](CHANGELOG.md); per-build metadata in `data/build-info-v*.json`.
Older APK artifacts are preserved under unique versioned filenames — never
overwritten.

## License

MIT for original code — see [android/LICENSE](android/LICENSE) and
[android/THIRD_PARTY_NOTICES.md](android/THIRD_PARTY_NOTICES.md).
