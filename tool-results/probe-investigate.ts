/**
 * WEBLAB-16 one-off investigation: open the ACTUAL output of each of the 4
 * drifting live golden probes, dump the raw response structure, re-parse,
 * compare against the frozen fixture parse + golden contract.
 * NEVER mutates fixtures or expectations — read-only evidence gathering.
 * (Run with: bun tool-results/probe-investigate.ts)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { evaluateExpectation } from '../src/lib/lab/expectations';
import { liveSearch } from '../src/lib/lab/live-search';
import { parse } from '../src/lib/lab/yt-search-parser';

const ROOT = process.cwd();
const FIX = join(ROOT, 'fixtures', 'ytm');

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);
const obj = (v: unknown, k: string): Json | null => (isObj(v) ? (isObj(v[k]) ? (v[k] as Json) : null) : null);
const arr = (v: unknown, k: string): unknown[] | null => (isObj(v) ? (Array.isArray(v[k]) ? (v[k] as unknown[]) : null) : null);
const runsText = (v: unknown): string | null => {
  const r = obj(v, 'runs');
  if (r !== null && Array.isArray(r.runs)) {
    const s = (r.runs as unknown[]).map((x) => (isObj(x) && typeof x.text === 'string' ? x.text : '')).join('');
    if (s.length > 0) return s;
  }
  if (isObj(v) && typeof v.simpleText === 'string') return v.simpleText;
  return null;
};

interface Target { fixture: string; query: string }

const index = JSON.parse(readFileSync(join(FIX, 'index.json'), 'utf8')) as Json;
const contract = JSON.parse(readFileSync(join(FIX, 'expectations.json'), 'utf8')) as Record<string, Json>;
const indexFixtures = (Array.isArray(index.fixtures) ? index.fixtures : []) as Json[];

const targets: Target[] = [
  { fixture: 'search_live_2026-10-12_lathi.json', query: String(indexFixtures.find((f) => f.name === 'search_live_2026-10-12_lathi.json')?.query ?? 'lathi') },
  { fixture: 'search_live_2026-10-11_lathi.json', query: 'lathi' },
  { fixture: 'search_live_2026-10-11_test.json', query: 'test' },
  { fixture: 'search_live_2026-10-11_gibberish.json', query: 'asdkjhqwlekjhzzzz' },
];

function dumpRawStructure(root: unknown): string[] {
  const lines: string[] = [];
  const tabs = arr(obj(obj(root, 'contents') ?? {}, 'tabbedSearchResultsRenderer') ?? {}, 'tabs');
  if (tabs === null) { lines.push('  raw: NO tabbedSearchResultsRenderer at contents'); return lines; }
  const tab0 = obj(tabs[0], 'tabRenderer');
  const content = obj(tab0, 'content');
  const sectionList = obj(content, 'sectionListRenderer');
  if (sectionList === null) { lines.push('  raw: NO sectionListRenderer in tab0.content'); return lines; }
  const blocks = arr(sectionList, 'contents') ?? [];
  lines.push(`  raw: sectionListRenderer.contents = ${blocks.length} block(s)`);
  for (let i = 0; i < blocks.length; i++) {
    const b = isObj(blocks[i]) ? (blocks[i] as Json) : null;
    if (b === null) { lines.push(`    [${i}] (non-object)`); continue; }
    const keys = Object.keys(b).filter((k) => k.toLowerCase().includes('renderer'));
    if (obj(b, 'musicShelfRenderer') !== null) {
      const shelf = obj(b, 'musicShelfRenderer')!;
      const title = runsText(shelf['title']) ?? '(no title)';
      const items = arr(shelf, 'contents') ?? [];
      const itemKinds = new Map<string, number>();
      for (const it of items) {
        const r = isObj(it) ? Object.keys(it).filter((k) => k.endsWith('Renderer'))[0] : '(none)';
        itemKinds.set(r, (itemKinds.get(r) ?? 0) + 1);
      }
      lines.push(`    [${i}] musicShelfRenderer "${title}" — ${items.length} items (${[...itemKinds].map(([k, n]) => `${k}×${n}`).join(', ')})`);
    } else if (obj(b, 'musicCardShelfRenderer') !== null) {
      const card = obj(b, 'musicCardShelfRenderer')!;
      const title = runsText(card['title']) ?? '(no title)';
      lines.push(`    [${i}] musicCardShelfRenderer "${title}" (top-result card)`);
    } else {
      lines.push(`    [${i}] UNKNOWN block — renderer keys: ${keys.join(', ') || '(none)'} | all keys: ${Object.keys(b).join(', ').slice(0, 160)}`);
    }
  }
  return lines;
}

function goldenVs(golden: Json, parsed: ReturnType<typeof parse>): string[] {
  const res = evaluateExpectation(parsed, golden);
  const lines = [`  eval: ${res.ok ? 'HOLDS' : 'DRIFT'} — actual ${res.actual.sectionCount} sections · ${res.actual.trackCount} tracks [${res.actual.titles.join(', ')}]`];
  for (const f of res.failures) lines.push(`    FAIL: ${f}`);
  return lines;
}

console.log(`investigation start ${new Date().toISOString()}`);
for (const t of targets) {
  console.log(`\n================ ${t.fixture} (query="${t.query}") ================`);

  // 1. frozen bytes still parse to golden? (parser consistency on recorded data)
  const frozen = JSON.parse(readFileSync(join(FIX, t.fixture), 'utf8'));
  const frozenParsed = parse(frozen);
  console.log(...goldenVs(contract[t.fixture], frozenParsed).map((l) => '[FROZEN] ' + l));

  // 2. live now
  const live = await liveSearch(t.query);
  if (!live.ok) {
    console.log(`  LIVE: ${live.errorKind}: ${live.message} (HTTP ${live.httpStatus})`);
    continue;
  }
  console.log(`  LIVE: HTTP ${live.httpStatus} · ${live.durationMs} ms`);
  console.log(...dumpRawStructure(live.root).map((l) => '[RAW] ' + l));
  const liveParsed = parse(live.root);
  console.log(...goldenVs(contract[t.fixture], liveParsed).map((l) => '[LIVE] ' + l));

  // 3. id-level checks
  const want = (contract[t.fixture].mustIncludeIds ?? []) as string[];
  const foundIds = (liveParsed ?? []).flatMap((s) => s.tracks.map((tr) => tr.id));
  for (const id of want) {
    console.log(`  mustInclude ${id}: ${foundIds.includes(id) ? 'FOUND in live' : 'ABSENT from live'}`);
  }
  if (t.fixture.includes('gibberish')) {
    console.log(`  live ids: ${foundIds.slice(0, 24).join(', ')}${foundIds.length > 24 ? ' …' : ''}`);
  }
}
console.log('\ninvestigation done (no files modified)');
