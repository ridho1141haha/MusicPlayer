import { NextResponse } from 'next/server';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FixtureMeta } from '@/lib/lab/types';

/**
 * Fixture registry API for the Web Lab.
 *
 *  GET              → list built-in fixtures (from fixtures/ytm/index.json, sizes from disk)
 *                     + user-added fixtures (from data/fixtures-user/)
 *  GET ?name=<file> → the fixture JSON content itself (name is sandboxed)
 *  POST             → add a user fixture { name, description, content }
 *
 * User fixtures live on local disk (data/fixtures-user/) — no external database.
 * Nothing here ever touches secrets: fixtures are public API response trims.
 */

export const dynamic = 'force-dynamic';

const ROOT = process.cwd();
const BUILTIN_DIR = join(ROOT, 'fixtures', 'ytm');
const USER_DIR = join(ROOT, 'data', 'fixtures-user');
const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.json$/;
const MAX_USER_FIXTURE_BYTES = 512 * 1024;

function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (!NAME_PATTERN.test(raw)) return null;
  if (raw.includes('..') || raw.includes('/')) return null;
  return raw;
}

function listBuiltin(): FixtureMeta[] {
  let registry: Array<Omit<FixtureMeta, 'sizeBytes'>> = [];
  try {
    const index = JSON.parse(readFileSync(join(BUILTIN_DIR, 'index.json'), 'utf8'));
    registry = Array.isArray(index.fixtures) ? index.fixtures : [];
  } catch {
    registry = [];
  }
  const out: FixtureMeta[] = [];
  for (const entry of registry) {
    try {
      const size = statSync(join(BUILTIN_DIR, entry.name)).size;
      out.push({ ...entry, sizeBytes: size });
    } catch {
      // registry entry without file on disk — skip, never invent
    }
  }
  return out;
}

function listUser(): FixtureMeta[] {
  if (!existsSync(USER_DIR)) return [];
  const out: FixtureMeta[] = [];
  for (const name of readdirSync(USER_DIR)) {
    if (!NAME_PATTERN.test(name)) continue;
    try {
      const path = join(USER_DIR, name);
      const content = JSON.parse(readFileSync(path, 'utf8'));
      const meta = content && typeof content === 'object' && content['_meta'] ? content['_meta'] : {};
      out.push({
        name,
        origin: 'user-added',
        capturedAt: typeof meta.capturedAt === 'string' ? meta.capturedAt : null,
        query: typeof meta.query === 'string' ? meta.query : null,
        description:
          typeof meta.note === 'string' && meta.note.length > 0
            ? meta.note
            : 'User-added fixture (no description provided).',
        sizeBytes: statSync(path).size,
      });
    } catch {
      // unreadable user fixture — skip, never invent
    }
  }
  return out;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const name = url.searchParams.get('name');

  if (name === null) {
    return NextResponse.json({ builtIn: listBuiltin(), user: listUser() });
  }

  const safe = sanitizeName(name);
  if (safe === null) {
    return NextResponse.json({ error: 'Invalid fixture name.' }, { status: 400 });
  }

  const builtinPath = join(BUILTIN_DIR, safe);
  const userPath = join(USER_DIR, safe);
  let raw: string;
  if (existsSync(builtinPath)) {
    raw = readFileSync(builtinPath, 'utf8');
  } else if (existsSync(userPath)) {
    raw = readFileSync(userPath, 'utf8');
  } else {
    return NextResponse.json({ error: 'Fixture not found.' }, { status: 404 });
  }

  try {
    return NextResponse.json({ name: safe, content: JSON.parse(raw) });
  } catch {
    return NextResponse.json({ error: 'Fixture is not valid JSON.' }, { status: 422 });
  }
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const envelope = body !== null && typeof body === 'object' ? (body as Record<string, unknown>) : null;
  const name = sanitizeName(envelope?.['name']);
  if (name === null) {
    return NextResponse.json(
      { error: 'Name must match [A-Za-z0-9][A-Za-z0-9._-]*.json (no traversal).' },
      { status: 400 },
    );
  }

  const content = envelope?.['content'];
  if (content === null || content === undefined || typeof content !== 'object' || Array.isArray(content)) {
    return NextResponse.json({ error: 'content must be a JSON object (the response root).' }, { status: 400 });
  }

  const serialized = JSON.stringify(content, null, 2);
  if (serialized.length > MAX_USER_FIXTURE_BYTES) {
    return NextResponse.json({ error: 'Fixture too large (max 512 KB).' }, { status: 413 });
  }

  const description =
    typeof envelope?.['description'] === 'string' && envelope['description'].length > 0
      ? envelope['description'].slice(0, 500)
      : 'User-added fixture.';

  try {
    mkdirSync(USER_DIR, { recursive: true });
    const path = join(USER_DIR, name);
    if (existsSync(path)) {
      return NextResponse.json({ error: `Fixture "${name}" already exists.` }, { status: 409 });
    }
    writeFileSync(path, JSON.stringify({ _meta: { origin: 'user-added', note: description }, ...content }, null, 2));
    return NextResponse.json({
      fixture: { name, origin: 'user-added', capturedAt: null, query: null, description, sizeBytes: serialized.length },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Could not save fixture: ${error instanceof Error ? error.message : 'unknown error'}` },
      { status: 500 },
    );
  }
}
