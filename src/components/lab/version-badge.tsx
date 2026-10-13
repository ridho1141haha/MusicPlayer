'use client';

import { useEffect, useState } from 'react';

import { Badge } from '@/components/ui/badge';

/**
 * WEBLAB-22B — header version badge, parsed live from
 * android/app/build.gradle via GET /api/version (replaces the stale
 * hardcoded "v1.2.0-wip" badge; the built artifacts are the truth).
 */
export function VersionBadge() {
  const [version, setVersion] = useState<{ name: string; code: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/version')
      .then((r) => (r.ok ? r.json() : null))
      .then((v: { name: string | null; code: number | null } | null) => {
        if (!cancelled && v?.name && v?.code) setVersion({ name: v.name, code: v.code });
      })
      .catch(() => {
        /* badge stays at the unknown fallback — never blocks the page */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Badge
      variant="outline"
      className="border-primary/40 bg-primary/10 text-primary"
      aria-label={
        version
          ? `Current app version v${version.name}, versionCode ${version.code}`
          : 'Current app version unknown'
      }
    >
      {version ? `v${version.name} · code ${version.code}` : 'v —'}
    </Badge>
  );
}
