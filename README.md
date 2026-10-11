# Ridho Music

A free, open-source, dark-themed **Android music player** — Java + Android Views,
powered by **Media3/ExoPlayer** with real background playback. No ads, no analytics,
no accounts. Optional experimental YouTube Music catalog search.

This repository contains:

| Path | What it is |
|---|---|
| `android/` | The complete Android Studio project (Java 17, minSdk 24, targetSdk 35) — **start here**: [android/README.md](android/README.md) |
| `android/dist/` | Prebuilt APKs from the automated build (debug 10.2 MB, release unsigned 3.0 MB) |
| `android/app/build/outputs/` | ignored — build locally to regenerate |
| `src/` | Next.js 16 "delivery dashboard" that browses the Android sources and reports build/test status live (`/api/project`, `/api/file`) |
| `public/ridho-music-v1.0.0-debug.apk` | Directly downloadable debug APK |
| [worklog.md](worklog.md) | Engineering work log (build iterations, fixes, verification results) |

## Quick start (Android app)

```bash
cd android
gradle assembleDebug          # → app/build/outputs/apk/debug/app-debug.apk
gradle testDebugUnitTest      # 22/22 JVM tests
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

## License

MIT for original code — see [android/LICENSE](android/LICENSE) and
[android/THIRD_PARTY_NOTICES.md](android/THIRD_PARTY_NOTICES.md).
