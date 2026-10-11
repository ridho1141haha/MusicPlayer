import { NextResponse } from 'next/server';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { QaResults } from '@/lib/lab/types';

/**
 * QA results API — serves the REAL recorded results written by
 * scripts/run-qa.sh (data/qa-results.json). If no run has been recorded yet,
 * the API says so explicitly; the dashboard must never invent numbers.
 */

export const dynamic = 'force-dynamic';

const ROOT = process.cwd();
const RESULTS_PATH = join(ROOT, 'data', 'qa-results.json');

export async function GET() {
  if (!existsSync(RESULTS_PATH)) {
    return NextResponse.json({
      recordedAt: null,
      suites: [],
      apk: null,
      note: 'No QA run recorded yet. Run scripts/run-qa.sh to produce real results.',
    });
  }
  try {
    const parsed = JSON.parse(readFileSync(RESULTS_PATH, 'utf8')) as QaResults;
    return NextResponse.json(parsed);
  } catch (error) {
    return NextResponse.json(
      {
        recordedAt: null,
        suites: [],
        apk: null,
        note: `qa-results.json exists but could not be parsed: ${error instanceof Error ? error.message : 'unknown'}`,
      },
      { status: 500 },
    );
  }
}

/** Lightweight probe used by run-qa.sh to confirm the file landed. */
export async function HEAD() {
  if (existsSync(RESULTS_PATH)) {
    return new NextResponse(null, {
      status: 200,
      headers: { 'Content-Length': String(statSync(RESULTS_PATH).size) },
    });
  }
  return new NextResponse(null, { status: 404 });
}
