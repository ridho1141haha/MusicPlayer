'use client';

import { motion } from 'framer-motion';
import { Download, Info, Music } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatBytes, formatDate, type ApkEntry } from '@/lib/ridho';

const TECH_BADGES = [
  'Java 17',
  'Media3 1.5.1',
  'Room 2.6.1',
  'minSdk 24 / targetSdk 35',
  'AGP 8.7.3',
  'MIT License',
] as const;

interface HeroProps {
  debugApk: ApkEntry;
  releaseApk: ApkEntry;
}

export function Hero({ debugApk, releaseApk }: HeroProps) {
  const sizeLabel = debugApk.available ? ` · ${formatBytes(debugApk.sizeBytes)}` : '';
  const builtLabel = debugApk.available ? formatDate(debugApk.mtime) : null;

  return (
    <motion.section
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
      aria-labelledby="hero-title"
      className="pt-10 sm:pt-16"
    >
      <div className="flex items-start gap-4 sm:items-center">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10 shadow-[0_0_40px_-12px_rgba(47,166,156,0.45)]"
          aria-hidden="true"
        >
          <Music className="h-7 w-7 text-[#7fd8ce]" />
        </span>
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 id="hero-title" className="text-4xl font-bold tracking-tight sm:text-5xl">
              Ridho Music
            </h1>
            <Badge className="bg-primary/15 text-[#7fd8ce] hover:bg-primary/15">v1.0.0</Badge>
            <Badge variant="outline" className="border-border text-muted-foreground">
              open source
            </Badge>
          </div>
          <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Free &amp; open-source Android music player — Java · Media3 · real background playback
          </p>
        </div>
      </div>

      <ul className="mt-6 flex flex-wrap gap-2" aria-label="Technology stack">
        {TECH_BADGES.map((label) => (
          <li key={label}>
            <Badge
              variant="outline"
              className="border-primary/25 bg-primary/5 font-mono text-xs text-foreground/85"
            >
              {label}
            </Badge>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button asChild size="lg" className="h-11 px-6 font-semibold sm:h-12">
          <a
            href="/ridho-music-v1.0.0-debug.apk"
            download
            aria-label={`Download Ridho Music v1.0.0 debug APK${sizeLabel}`}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download debug APK{sizeLabel}
          </a>
        </Button>
        <div
          className="flex h-11 items-center gap-2 rounded-md border border-border bg-card/60 px-4 sm:h-12"
          title="The R8-minified release APK is not served for download from this site; it ships inside the repository at android/dist/app-release-unsigned.apk. Sign it with your own keystore before installing."
        >
          <Info className="h-4 w-4 shrink-0 text-[#7fd8ce]" aria-hidden="true" />
          <span className="flex flex-wrap items-center gap-x-1 text-sm text-muted-foreground">
            Release build (unsigned):
            <code className="font-mono text-xs text-foreground/90">
              android/dist/{releaseApk.available ? releaseApk.name : 'app-release-unsigned.apk'}
            </code>
          </span>
        </div>
      </div>

      {builtLabel && (
        <p className="mt-4 text-xs text-muted-foreground/80">
          Debug APK built {builtLabel} and verified: assembleDebug, assembleRelease (R8), 22/22 unit
          tests, lint 0 errors.
        </p>
      )}
    </motion.section>
  );
}
