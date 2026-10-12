import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

/**
 * WEBLAB-22B — lightweight version probe for the header badge.
 * Parses android/app/build.gradle directly: the version the artifacts were
 * actually built with is the single source of truth (no hardcoded badge).
 * Returns { name, code } or { name: null, code: null } when unreadable.
 */
const ANDROID_APP_GRADLE = path.join('/home/z/my-project', 'android', 'app', 'build.gradle');

export async function GET() {
  try {
    const gradle = await fs.readFile(ANDROID_APP_GRADLE, 'utf8');
    const name = gradle.match(/versionName\s+"([^"]+)"/)?.[1];
    const code = gradle.match(/versionCode\s+(\d+)/)?.[1];
    if (!name || !code) throw new Error('version fields not found');
    return NextResponse.json({ name, code: Number(code) });
  } catch {
    return NextResponse.json({ name: null, code: null }, { status: 200 });
  }
}
