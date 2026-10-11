import { NextResponse } from 'next/server';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LRC fixture API for the Lyrics Lab.
 *
 *  GET            → list synthetic .lrc fixtures (fixtures/lrc/index.json + sizes)
 *  GET ?name=<f>  → the raw .lrc text (name is sandboxed to fixtures/lrc/)
 *
 * LRC fixtures are app-side lyric artifacts (clearly labeled synthetic) — they
 * are not network captures, so no live-capture provenance applies.
 */

export const dynamic = 'force-dynamic';

const ROOT = process.cwd();
const DIR = join(ROOT, 'fixtures', 'lrc');
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.lrc$/;
const MAX_BYTES = 256 * 1024;

function sanitize(raw: unknown): string | null {
  if (typeof raw !== 'string' || !NAME_PATTERN.test(raw)) return null;
  if (raw.includes('..') || raw.includes('/')) return null;
  return raw;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name');

  if (name === null) {
    let files: Array<{ name: string; kind: string; description: string; sizeBytes: number }> = [];
    try {
      const index = JSON.parse(readFileSync(join(DIR, 'index.json'), 'utf8')) as {
        files?: Array<{ name: string; kind: string; description: string }>;
      };
      files = (index.files ?? [])
        .filter((f) => typeof f.name === 'string' && NAME_PATTERN.test(f.name))
        .map((f) => {
          try {
            return { ...f, sizeBytes: statSync(join(DIR, f.name)).size };
          } catch {
            return null; // registry entry without file on disk — skip, never invent
          }
        })
        .filter((f): f is { name: string; kind: string; description: string; sizeBytes: number } => f !== null);
    } catch {
      files = [];
    }
    return NextResponse.json({ files });
  }

  const safe = sanitize(name);
  if (safe === null) {
    return NextResponse.json({ error: 'Invalid .lrc name.' }, { status: 400 });
  }
  const path = join(DIR, safe);
  if (!existsSync(path)) {
    return NextResponse.json({ error: 'Fixture not found.' }, { status: 404 });
  }
  const buf = readFileSync(path);
  if (buf.length > MAX_BYTES) {
    return NextResponse.json({ error: 'Fixture too large.' }, { status: 413 });
  }
  return NextResponse.json({ name: safe, content: buf.toString('utf8') });
}
