/**
 * TypeScript port of the Android parser
 * `com.ridho.music.source.yt.YtMusicSearchParser` (commit ea305f6).
 *
 * ARCHITECTURE NOTE (FASE 2 of the Web Lab brief):
 * Java cannot run in a browser, so the Web Lab uses a *separate harness* that
 * mirrors the Java parser's contract and is validated against the SAME
 * fixtures (see /fixtures/ytm + tests/unit/parser.test.ts + the Java
 * YtMusicSearchParserTest). Divergence risk is mitigated by:
 *   1. shared fixture files (fixtures/ytm/*.json, synced to
 *      android/app/src/test/resources/ytm/ via scripts/sync-fixtures.mjs),
 *   2. golden expectations copied from the Java test assertions,
 *   3. this file deliberately staying a 1:1 port — no web-only behavior in the
 *      accept/reject path. Extras (trace, renderer stats, continuation scan)
 *      are side outputs that never influence which tracks are accepted.
 *
 * Supported response shapes (verified against live captures, see worklog AUDIT-1):
 *  - Legacy shelf layout: sectionListRenderer.contents[].musicShelfRenderer
 *  - Flat 2025+ layout: musicCardShelfRenderer (top result) +
 *    itemSectionRenderer items with typed subtitles ("Song • Artist", ...)
 *  - Continuations: live unauthenticated responses carry none (verified
 *    2026-10-11); the scanner below only *surfaces* a token if one appears.
 */

import type { LabTrack, ParseResult, RendererStat, SearchSection, TraceEntry } from './types';

export const ID_PREFIX_SONG = 'ytm:';
export const ID_PREFIX_ALBUM = 'ytm-album:';
export const ID_PREFIX_ARTIST = 'ytm-artist:';

export const SECTION_TOP_RESULT = 'Top result';
export const SECTION_SONGS = 'Songs';
export const SECTION_VIDEOS = 'Videos';
export const SECTION_ALBUMS = 'Albums';
export const SECTION_ARTISTS = 'Artists';
export const SECTION_RESULTS = 'Results';

const KIND_SONG = new Set(['song']);
const KIND_VIDEO = new Set(['video']);
const KIND_ALBUM = new Set(['album', 'single', 'ep']);
const KIND_ARTIST = new Set(['artist']);
/** Kinds present in the live catalog but intentionally out of scope. */
const SKIPPED_KINDS = new Set([
  'playlist',
  'community playlist',
  'featured on',
  'podcast',
  'episode',
  'profile',
  'station',
]);

const DURATION_PATTERN = /^\d{1,2}(?::\d{2}){1,2}$/;
const METRIC_PATTERN = /.*\b(plays|views|subscribers|likes)\b.*/i;

// ------------------------------------------------------------------ JSON helpers
// Mirrors org.json's opt* semantics: missing/wrong-typed keys yield null.

type JsonObj = Record<string, unknown>;

function isObj(v: unknown): v is JsonObj {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function optObj(container: unknown, key: string): JsonObj | null {
  if (!isObj(container)) return null;
  const next = (container as JsonObj)[key];
  return isObj(next) ? next : null;
}
function optArr(container: unknown, key: string): unknown[] | null {
  if (!isObj(container)) return null;
  const next = (container as JsonObj)[key];
  return Array.isArray(next) ? next : null;
}
function optStr(container: unknown, key: string): string | null {
  if (!isObj(container)) return null;
  const next = (container as JsonObj)[key];
  return typeof next === 'string' && next.length > 0 ? next : null;
}

// ------------------------------------------------------------------ text helpers

function textFromRunsObject(textObject: unknown): string | null {
  const simple = optStr(textObject, 'simpleText');
  if (simple !== null) return simple;
  const runs = optArr(textObject, 'runs');
  if (runs === null || runs.length === 0) return null;
  let out = '';
  for (const run of runs) {
    const t = optStr(run, 'text');
    if (t !== null) out += t;
  }
  const trimmed = out.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function colText(flex: unknown[], index: number): string | null {
  if (index >= flex.length) return null;
  const column = isObj(flex[index]) ? (flex[index] as JsonObj) : null;
  if (column === null) return null;
  const renderer = optObj(column, 'musicResponsiveListItemFlexColumnRenderer');
  if (renderer === null) return null;
  return textFromRunsObject(renderer['text']);
}

function fixedColumnText(item: JsonObj): string | null {
  const fixed = optArr(item, 'fixedColumns');
  if (fixed === null || fixed.length === 0) return null;
  const column = isObj(fixed[0]) ? (fixed[0] as JsonObj) : null;
  if (column === null) return null;
  const renderer = optObj(column, 'musicResponsiveListItemFlexColumnRenderer');
  if (renderer === null) return null;
  return textFromRunsObject(renderer['text']);
}

function largestThumbnail(thumbnailWrapper: unknown): string | null {
  const renderer = optObj(thumbnailWrapper, 'musicThumbnailRenderer');
  if (renderer === null) return null;
  const thumbnail = optObj(renderer, 'thumbnail');
  if (thumbnail === null) return null;
  const thumbnails = optArr(thumbnail, 'thumbnails');
  if (thumbnails === null || thumbnails.length === 0) return null;
  // InnerTube lists thumbnails ascending in size; prefer the last HTTPS one.
  for (let i = thumbnails.length - 1; i >= 0; i--) {
    const url = optStr(thumbnails[i], 'url');
    if (url !== null && url.startsWith('https://')) return url;
  }
  return null;
}

/** Parses "4:16" / "1:02:05" style durations into ms; returns 0 when unparseable. */
export function parseDurationMs(text: string | null): number {
  if (text === null) return 0;
  const t = text.trim();
  if (t.length === 0 || t.includes('-')) return 0;
  const parts = t.split(':');
  let seconds = 0;
  for (const part of parts) {
    const n = Number(part.trim());
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return 0;
    seconds = seconds * 60 + n;
  }
  return seconds * 1000;
}

// ------------------------------------------------------------------ subtitle / kind logic

interface Subtitle {
  kind: string | null; // lowercased first bullet token, e.g. "song"
  tail: string | null; // the segment after the kind (usually the artist)
  durationMs: number; // card subtitles may end with "m:ss" / "h:mm:ss"
}

/**
 * Splits a bullet-separated subtitle ("Song • Artist", "Single • A • 2026",
 * "Video • A • 1.2M views • 3:07"). When the first token is not a known kind
 * word the whole text is treated as a plain artist string (legacy shape).
 */
function splitSubtitle(text: string | null): Subtitle {
  if (text === null) return { kind: null, tail: null, durationMs: 0 };
  const trimmed = text.trim();
  const bullet = trimmed.indexOf('•');
  if (bullet <= 0) {
    return { kind: null, tail: trimmed.length > 0 ? trimmed : null, durationMs: 0 };
  }

  const kind = trimmed.substring(0, bullet).trim().toLowerCase();
  if (
    KIND_SONG.has(kind) ||
    KIND_VIDEO.has(kind) ||
    KIND_ALBUM.has(kind) ||
    KIND_ARTIST.has(kind) ||
    SKIPPED_KINDS.has(kind)
  ) {
    const parts = trimmed.split('•');
    const rawTail = parts.length > 1 ? parts[1].trim() : null;
    let durationMs = 0;
    if (parts.length > 2) {
      const last = parts[parts.length - 1].trim();
      if (DURATION_PATTERN.test(last)) durationMs = parseDurationMs(last);
    }
    return { kind, tail: rawTail !== null && rawTail.length > 0 ? rawTail : null, durationMs };
  }
  // Not a typed subtitle — treat the whole text as the artist (legacy behavior).
  return { kind: null, tail: trimmed, durationMs: 0 };
}

function looksLikeMetric(text: string | null): boolean {
  return text !== null && METRIC_PATTERN.test(text);
}

/** Lowercased kind word of a flat-layout item, from its typed subtitle; null when absent. */
function kindOfItem(item: JsonObj): string | null {
  const flex = optArr(item, 'flexColumns');
  if (flex === null || flex.length < 2) return null;
  return splitSubtitle(colText(flex, 1)).kind;
}

function sectionTitleForKind(kind: string | null): string {
  if (kind === null) return SECTION_RESULTS;
  if (KIND_SONG.has(kind)) return SECTION_SONGS;
  if (KIND_VIDEO.has(kind)) return SECTION_VIDEOS;
  if (KIND_ALBUM.has(kind)) return SECTION_ALBUMS;
  if (KIND_ARTIST.has(kind)) return SECTION_ARTISTS;
  return SECTION_RESULTS;
}

// ------------------------------------------------------------------ track building

function buildTrack(
  endpoint: JsonObj | null,
  title: string,
  artist: string | null,
  album: string | null,
  durationMs: number,
  thumbnailUrl: string | null,
): LabTrack | null {
  if (endpoint === null) return null;
  let videoId: string | null = null;
  let browseId: string | null = null;
  const watch = optObj(endpoint, 'watchEndpoint');
  if (watch !== null) videoId = optStr(watch, 'videoId');
  const browse = optObj(endpoint, 'browseEndpoint');
  if (browse !== null) browseId = optStr(browse, 'browseId');

  let id: string;
  if (videoId !== null && videoId.length > 0) {
    id = ID_PREFIX_SONG + videoId;
  } else if (browseId !== null && browseId.startsWith('MPRE')) {
    id = ID_PREFIX_ALBUM + browseId;
  } else if (browseId !== null && browseId.startsWith('UC')) {
    id = ID_PREFIX_ARTIST + browseId;
  } else {
    return null; // e.g. MPEDG… non-music pages, MPSP… podcasts
  }

  return {
    id,
    sourceId: 'ytm',
    title,
    artist: artist === null || artist.length === 0 ? 'Unknown artist' : artist,
    album,
    durationMs,
    artworkUrl: thumbnailUrl,
  };
}

/** Parses one musicResponsiveListItemRenderer into a Track, or null if not usable. */
export function parseItem(item: unknown): LabTrack | null {
  if (!isObj(item)) return null;
  const flex = optArr(item, 'flexColumns');
  if (flex === null || flex.length === 0) return null;

  const title = colText(flex, 0);
  if (title === null || title.length === 0) return null;

  const sub = splitSubtitle(colText(flex, 1));
  if (sub.kind !== null && SKIPPED_KINDS.has(sub.kind)) return null;

  const artist = KIND_ARTIST.has(sub.kind ?? '') ? null : sub.tail; // title IS the artist name
  const album = looksLikeMetric(colText(flex, 2)) ? null : colText(flex, 2);
  const durationMs = parseDurationMs(fixedColumnText(item)); // 0 in the flat layout

  return buildTrack(
    optObj(item, 'navigationEndpoint'),
    title,
    artist,
    album,
    durationMs,
    largestThumbnail(item['thumbnail']),
  );
}

/** Parses the top-result card (musicCardShelfRenderer) into a Track, or null. */
export function parseCardItem(card: unknown): LabTrack | null {
  if (!isObj(card)) return null;
  const title = optObj(card, 'title');
  const titleText = textFromRunsObject(title);
  if (titleText === null || titleText.length === 0) return null;

  // The watch/browse endpoint sits on the first title run (verified live).
  let endpoint: JsonObj | null = null;
  const runs = title === null ? null : optArr(title, 'runs');
  if (runs !== null && runs.length > 0) {
    const firstRun = isObj(runs[0]) ? (runs[0] as JsonObj) : null;
    endpoint = firstRun === null ? null : optObj(firstRun, 'navigationEndpoint');
  }

  const sub = splitSubtitle(textFromRunsObject(card['subtitle']));
  if (sub.kind !== null && SKIPPED_KINDS.has(sub.kind)) return null;

  const artist = KIND_ARTIST.has(sub.kind ?? '') ? null : sub.tail;
  return buildTrack(endpoint, titleText, artist, null, sub.durationMs, largestThumbnail(card['thumbnail']));
}

// ------------------------------------------------------------------ rejection explanations (web-lab extras)

/**
 * Human-readable reason an item was rejected. Only called for items the
 * parser already rejected, so it can never change accept/reject behavior.
 */
export function explainRejection(item: unknown): string {
  if (!isObj(item)) return 'not an object';
  const flex = optArr(item, 'flexColumns');
  if (flex === null || flex.length === 0) return 'no flexColumns';
  const title = colText(flex, 0);
  if (title === null || title.length === 0) return 'empty title';
  const sub = splitSubtitle(colText(flex, 1));
  if (sub.kind !== null && SKIPPED_KINDS.has(sub.kind)) {
    return `kind "${sub.kind}" is out of scope (deliberately skipped)`;
  }
  const endpoint = optObj(item, 'navigationEndpoint');
  if (endpoint === null) return 'no navigationEndpoint';
  const watch = optObj(endpoint, 'watchEndpoint');
  if (watch !== null && optStr(watch, 'videoId')) return 'unexpected rejection (has videoId)';
  const browse = optObj(endpoint, 'browseEndpoint');
  if (browse !== null) {
    const browseId = optStr(browse, 'browseId');
    if (browseId !== null) {
      if (browseId.startsWith('MPSP')) return `browseId prefix "MPSP…" (podcast page) is not usable`;
      if (browseId.startsWith('MPEDG')) return `browseId prefix "MPEDG…" (non-music page) is not usable`;
      return `browseId "${browseId.slice(0, 12)}…" maps to no known id prefix`;
    }
  }
  return 'no usable navigation endpoint';
}

export function explainCardRejection(card: unknown): string {
  if (!isObj(card)) return 'not an object';
  const titleText = textFromRunsObject(card['title']);
  if (titleText === null) return 'no title text';
  const sub = splitSubtitle(textFromRunsObject(card['subtitle']));
  if (sub.kind !== null && SKIPPED_KINDS.has(sub.kind)) {
    return `card kind "${sub.kind}" is out of scope (deliberately skipped)`;
  }
  const runs = optObj(card, 'title') !== null ? optArr(optObj(card, 'title'), 'runs') : null;
  if (runs === null || runs.length === 0) return 'title has no runs (no endpoint)';
  return 'card has no usable endpoint on its first title run';
}

// ------------------------------------------------------------------ renderer stats / continuation scan (web-lab extras)

const MAX_WALK_NODES = 500_000;

/** Counts every object value whose key ends in "Renderer" across the whole response. */
export function collectRendererStats(root: unknown): RendererStat[] {
  const counts = new Map<string, number>();
  const stack: unknown[] = [root];
  let visited = 0;
  while (stack.length > 0 && visited < MAX_WALK_NODES) {
    const node = stack.pop();
    visited++;
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
    } else if (isObj(node)) {
      for (const [key, value] of Object.entries(node)) {
        if (key.endsWith('Renderer') && (isObj(value) || Array.isArray(value))) {
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        stack.push(value);
      }
    }
  }
  return [...counts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));
}

/** Surfaces the first continuation token if YouTube ever adds one (currently none). */
export function findContinuationToken(root: unknown): string | null {
  const stack: unknown[] = [root];
  let visited = 0;
  while (stack.length > 0 && visited < MAX_WALK_NODES) {
    const node = stack.pop();
    visited++;
    if (Array.isArray(node)) {
      for (const child of node) stack.push(child);
    } else if (isObj(node)) {
      for (const [key, value] of Object.entries(node)) {
        if (key === 'nextContinuationData' || key === 'continuationEndpoint') {
          const token = optStr(value, 'continuation');
          if (token !== null) return token;
        }
        if (key === 'continuationItemRenderer') {
          const token =
            optStr(optObj(value, 'continuationEndpoint'), 'continuation') ??
            optStr(optObj(value, 'button'), 'continuation') ??
            optStr(value, 'continuation');
          if (token !== null) return token;
        }
        stack.push(value);
      }
    }
  }
  return null;
}

// ------------------------------------------------------------------ main parse

/**
 * Parses a full search response into titled sections.
 * Mirrors the Java contract: `null` only for a null root; otherwise an array
 * (possibly empty). Never throws on any input.
 */
export function parse(root: unknown): SearchSection[] | null {
  if (root === null || root === undefined) return null;
  // Insertion-ordered so section order follows the response order.
  const sections = new Map<string, LabTrack[]>();
  const blocks = (() => {
    try {
      const tabs = optArr(optObj(optObj(root, 'contents'), 'tabbedSearchResultsRenderer'), 'tabs');
      if (tabs === null || tabs.length === 0) return null;
      const tab0 = isObj(tabs[0]) ? (tabs[0] as JsonObj) : null;
      if (tab0 === null) return null;
      const content = optObj(optObj(tab0, 'tabRenderer'), 'content');
      const sectionList = optObj(content, 'sectionListRenderer');
      return optArr(sectionList, 'contents');
    } catch {
      return null;
    }
  })();

  if (blocks !== null) {
    for (let i = 0; i < blocks.length; i++) {
      const block = isObj(blocks[i]) ? (blocks[i] as JsonObj) : null;
      if (block === null) continue;

      // Legacy shelf layout (per-shelf title + items).
      const shelf = optObj(block, 'musicShelfRenderer');
      if (shelf !== null) {
        let shelfTitle = textFromRunsObject(shelf['title']) ?? SECTION_RESULTS;
        if (shelfTitle.length === 0) shelfTitle = SECTION_RESULTS;
        const items = optArr(shelf, 'contents');
        if (items !== null) {
          for (let j = 0; j < items.length; j++) {
            const renderer = optObj(items[j], 'musicResponsiveListItemRenderer');
            const t = parseItem(renderer);
            if (t !== null) addToBucket(sections, shelfTitle, t);
          }
        }
        continue;
      }

      // Flat layout: top-result card.
      const card = optObj(block, 'musicCardShelfRenderer');
      if (card !== null) {
        const t = parseCardItem(card);
        if (t !== null) addToBucket(sections, SECTION_TOP_RESULT, t);
        continue;
      }

      // Flat layout: one itemSectionRenderer per result (one item each, observed live).
      const itemSection = optObj(block, 'itemSectionRenderer');
      if (itemSection !== null) {
        const items = optArr(itemSection, 'contents');
        if (items === null) continue;
        for (let j = 0; j < items.length; j++) {
          const renderer = optObj(items[j], 'musicResponsiveListItemRenderer');
          const t = parseItem(renderer);
          if (t !== null) {
            addToBucket(sections, sectionTitleForKind(kindOfItem(renderer as JsonObj)), t);
          }
        }
      }
      // Anything else (chips, ads, unknown future renderers): skipped.
    }
  }

  const out: SearchSection[] = [];
  for (const [title, tracks] of sections) {
    if (tracks.length > 0) out.push({ title, tracks });
  }
  return out;
}

function addToBucket(sections: Map<string, LabTrack[]>, title: string, t: LabTrack): void {
  const list = sections.get(title);
  if (list === undefined) sections.set(title, [t]);
  else list.push(t);
}

// ------------------------------------------------------------------ parse with trace

/** Parses and additionally explains what was accepted / rejected / skipped. */
export function parseWithTrace(root: unknown): ParseResult {
  const trace: TraceEntry[] = [];
  const sections = parse(root);

  const blocks = (() => {
    const tabs = optArr(optObj(optObj(root, 'contents'), 'tabbedSearchResultsRenderer'), 'tabs');
    if (tabs === null || tabs.length === 0) return null;
    const tab0 = isObj(tabs[0]) ? (tabs[0] as JsonObj) : null;
    if (tab0 === null) return null;
    const content = optObj(optObj(tab0, 'tabRenderer'), 'content');
    const sectionList = optObj(content, 'sectionListRenderer');
    return optArr(sectionList, 'contents');
  })();

  if (sections === null) {
    trace.push({ path: 'root', kind: 'info', reason: 'null input → null result (Java contract)' });
  } else if (blocks === null) {
    trace.push({
      path: 'root',
      kind: 'info',
      reason: 'response envelope not recognized (contents.tabbedSearchResultsRenderer… missing)',
    });
  } else {
    trace.push({ path: 'root', kind: 'info', reason: `${blocks.length} top-level result block(s)` });
    for (let i = 0; i < blocks.length; i++) {
      const block = isObj(blocks[i]) ? (blocks[i] as JsonObj) : null;
      if (block === null) continue;
      const path = `blocks[${i}]`;

      const shelf = optObj(block, 'musicShelfRenderer');
      if (shelf !== null) {
        const shelfTitle = textFromRunsObject(shelf['title']) ?? SECTION_RESULTS;
        const items = optArr(shelf, 'contents') ?? [];
        trace.push({ path, kind: 'info', reason: `legacy shelf "${shelfTitle}" (${items.length} items)` });
        for (let j = 0; j < items.length; j++) {
          const renderer = optObj(items[j], 'musicResponsiveListItemRenderer');
          recordItemTrace(trace, renderer, `${path} > shelfItem[${j}]`, shelfTitle);
        }
        continue;
      }

      const card = optObj(block, 'musicCardShelfRenderer');
      if (card !== null) {
        const t = parseCardItem(card);
        if (t !== null) {
          trace.push({ path, kind: 'accepted', reason: 'top-result card', trackId: t.id, detail: t.title });
        } else {
          trace.push({ path, kind: 'rejected', reason: explainCardRejection(card) });
        }
        continue;
      }

      const itemSection = optObj(block, 'itemSectionRenderer');
      if (itemSection !== null) {
        const items = optArr(itemSection, 'contents');
        if (items === null || items.length === 0) {
          trace.push({ path, kind: 'info', reason: 'empty itemSectionRenderer' });
          continue;
        }
        for (let j = 0; j < items.length; j++) {
          const renderer = optObj(items[j], 'musicResponsiveListItemRenderer');
          if (renderer === null) {
            const wrapper = isObj(items[j]) ? (items[j] as JsonObj) : null;
            const innerType = wrapper !== null ? Object.keys(wrapper).join(', ') : '(not an object)';
            trace.push({
              path: `${path} > item[${j}]`,
              kind: 'info',
              reason: `itemSection child is not a musicResponsiveListItemRenderer (${innerType})`,
            });
            continue;
          }
          recordItemTrace(trace, renderer, `${path} > item[${j}]`, null);
        }
        continue;
      }

      const knownTypes = Object.keys(block).filter((k) => k.endsWith('Renderer'));
      trace.push({
        path,
        kind: 'info',
        reason: `block skipped (no known result renderer)${knownTypes.length > 0 ? `: ${knownTypes.join(', ')}` : ''}`,
      });
    }
  }

  return {
    sections,
    trace,
    rendererStats: collectRendererStats(root),
    continuationToken: findContinuationToken(root),
  };
}

function recordItemTrace(
  trace: TraceEntry[],
  renderer: JsonObj | null,
  path: string,
  sectionTitle: string | null,
): void {
  if (renderer === null) {
    trace.push({ path, kind: 'info', reason: 'no musicResponsiveListItemRenderer' });
    return;
  }
  const t = parseItem(renderer);
  if (t !== null) {
    const kind = kindOfItem(renderer);
    const section = sectionTitle ?? sectionTitleForKind(kind);
    trace.push({
      path,
      kind: 'accepted',
      reason: `→ section "${section}"`,
      trackId: t.id,
      detail: `${t.title} — ${t.artist}`,
    });
  } else {
    trace.push({ path, kind: 'rejected', reason: explainRejection(renderer) });
  }
}
