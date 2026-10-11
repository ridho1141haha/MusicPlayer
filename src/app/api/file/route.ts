import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

import { VIEWABLE_EXTENSIONS, type FilePayload } from '@/lib/ridho';

export const dynamic = 'force-dynamic';

const PROJECT_ROOT = '/home/z/my-project';

/** Serve at most the first 100 KB of any file. */
const MAX_BYTES = 100 * 1024;

function errorResponse(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get('path') ?? '';

  if (!raw) {
    return errorResponse('Missing required query parameter: ?path=android/<file>', 400);
  }

  if (raw.includes('\0') || raw.includes('..')) {
    return errorResponse('Path traversal is not allowed.', 400);
  }

  if (raw.startsWith('/') || raw.includes('\\')) {
    return errorResponse('Provide a repository-relative path such as android/README.md.', 400);
  }

  // Resolve and confine to the project root.
  const resolved = path.resolve(PROJECT_ROOT, raw);
  const relative = path.relative(PROJECT_ROOT, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    return errorResponse('Requested path is outside the project root.', 400);
  }

  if (!relative.startsWith('android/')) {
    return errorResponse('Only files under android/ can be read.', 400);
  }

  if (!VIEWABLE_EXTENSIONS.some((ext) => relative.endsWith(ext))) {
    return errorResponse(
      `Only text files (${VIEWABLE_EXTENSIONS.join(', ')}) can be previewed. Binaries such as APKs are not served by this endpoint.`,
      415,
    );
  }

  let stats;
  try {
    stats = await fs.stat(resolved);
  } catch {
    return errorResponse(`File not found: ${relative}`, 404);
  }

  if (!stats.isFile()) {
    return errorResponse(`Not a regular file: ${relative}`, 400);
  }

  let buffer;
  try {
    buffer = await fs.readFile(resolved);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return errorResponse(`Failed to read file: ${message}`, 500);
  }

  // Extra safety: refuse anything that looks binary despite the extension check.
  const head = buffer.subarray(0, Math.min(buffer.length, 8192));
  if (head.includes(0)) {
    return errorResponse('File appears to be binary and cannot be previewed.', 415);
  }

  const truncated = buffer.length > MAX_BYTES;
  const content = (
    truncated ? buffer.subarray(0, MAX_BYTES) : buffer
  ).toString('utf8');

  const payload: FilePayload = {
    path: relative,
    sizeBytes: stats.size,
    content,
    truncated,
  };

  return NextResponse.json(payload);
}
