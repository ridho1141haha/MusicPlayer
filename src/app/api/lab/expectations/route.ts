import { NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Golden parse expectations registry (WEBLAB-10).
 *
 * GET → { expectations, validateError? } — the raw expectations file plus the
 * result of the structural validation, so the UI can be honest when the file
 * itself is broken instead of silently treating every fixture as passing.
 */

export const dynamic = 'force-dynamic';

export async function GET() {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(join(process.cwd(), 'fixtures', 'ytm', 'expectations.json'), 'utf8'));
  } catch (error) {
    return NextResponse.json(
      { expectations: {}, validateError: `expectations.json unreadable: ${error instanceof Error ? error.message : 'unknown'}` },
      { status: 200 }, // the UI renders the error honestly; this is not an HTTP-level failure
    );
  }
  const { validateExpectationsFile } = await import('@/lib/lab/expectations');
  const validated = validateExpectationsFile(raw);
  if (!validated.ok) {
    return NextResponse.json({ expectations: {}, validateError: validated.error }, { status: 200 });
  }
  return NextResponse.json({ expectations: validated.expectations, validateError: null });
}
