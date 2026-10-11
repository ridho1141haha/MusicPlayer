/**
 * TypeScript port of the Android parser `com.ridho.music.lyrics.LrcParser`.
 *
 * Same FASE-2 architecture as the search parser: a 1:1 web harness mirror,
 * validated against the SAME golden expectations as LrcParserTest (see
 * tests/unit/lrc-parser.test.ts). Web-only extras (parse stats) never change
 * which lines are produced.
 *
 * Supported LRC forms: [mm:ss.xx] text, [mm:ss.xxx] text, multiple tags per
 * line ([00:01.00][00:05.00] text) and metadata tags ([ti:Title]) which are
 * skipped. When no timestamps exist the content is returned as unsynced lines.
 */

export interface LrcLine {
  timeMs: number;
  text: string;
}

export interface LrcLyrics {
  lines: LrcLine[];
  synced: boolean;
}

export interface LrcParseStats {
  /** Lines carrying only timestamps and no content (skipped, Java behavior). */
  timestampOnlyLines: number;
  /** Metadata tags like [ti:…] / [ar:…] encountered (skipped). */
  metadataTags: number;
  /** Plain-text lines when the input is unsynced. */
  plainLines: number;
}

const TIME_TAG = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;

function normalizeFraction(fraction: string): number {
  // ".5" -> 500ms, ".05" -> 50ms, ".005" -> 5ms
  let f = fraction;
  while (f.length < 3) f += '0';
  return Number(f);
}

/** Mirrors LrcParser.parse — never throws on any input. */
export function parse(raw: string | null): LrcLyrics {
  const syncedLines: LrcLine[] = [];
  const plainLines: LrcLine[] = [];
  let anyTimestamp = false;

  if (raw !== null && raw !== undefined && raw.length > 0) {
    const rawLines = raw.split(/\r?\n|\r/);
    for (const rawLine of rawLines) {
      const line = rawLine.trim();
      if (line.length === 0) continue;

      TIME_TAG.lastIndex = 0;
      const times: number[] = [];
      let remainder = line;
      let match: RegExpExecArray | null;
      while ((match = TIME_TAG.exec(line)) !== null) {
        anyTimestamp = true;
        const minutes = Number(match[1]);
        const seconds = Number(match[2]);
        const fraction = match[3] === undefined ? 0 : normalizeFraction(match[3]);
        times.push(minutes * 60_000 + seconds * 1_000 + fraction);
        // Java String.replace replaces ALL literal occurrences; JS string
        // replace only the first, so split+join for literal parity.
        remainder = remainder.split(match[0]).join('');
      }
      const text = remainder.trim();
      if (times.length > 0) {
        if (text.length === 0) continue; // timestamp-only line: no content
        for (const t of times) syncedLines.push({ timeMs: t, text });
      } else if (!line.startsWith('[') || !line.endsWith(']')) {
        // Not a metadata tag like [ti:Song] and not timestamped — plain text.
        plainLines.push({ timeMs: 0, text });
      }
    }
  }

  if (anyTimestamp && syncedLines.length > 0) {
    // Java Collections.sort is stable; Array.prototype.sort is stable per spec.
    syncedLines.sort((a, b) => a.timeMs - b.timeMs);
    return { lines: syncedLines, synced: true };
  }
  return { lines: plainLines, synced: false };
}

/** Finds the active line index for a position, or -1 before the first line. */
export function activeLineIndex(lines: LrcLine[], positionMs: number): number {
  let active = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].timeMs <= positionMs) active = i;
    else break;
  }
  return active;
}

/** Web-lab extra: counts of deliberately skipped constructs (diagnostics only). */
export function parseWithStats(raw: string | null): LrcLyrics & { stats: LrcParseStats } {
  const stats: LrcParseStats = { timestampOnlyLines: 0, metadataTags: 0, plainLines: 0 };
  if (raw !== null && raw !== undefined && raw.length > 0) {
    for (const rawLine of raw.split(/\r?\n|\r/)) {
      const line = rawLine.trim();
      if (line.length === 0) continue;
      TIME_TAG.lastIndex = 0;
      let timeCount = 0;
      let match: RegExpExecArray | null;
      while ((match = TIME_TAG.exec(line)) !== null) timeCount += 1;
      if (timeCount === 0) {
        if (line.startsWith('[') && line.endsWith(']')) stats.metadataTags += 1;
      } else {
        // Timestamped line — skipped by parse() only when content is empty.
        let remainder = line;
        const rx = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
        let m: RegExpExecArray | null;
        while ((m = rx.exec(line)) !== null) remainder = remainder.split(m[0]).join('');
        if (remainder.trim().length === 0) stats.timestampOnlyLines += 1;
      }
    }
  }
  const result = parse(raw);
  stats.plainLines = result.synced ? 0 : result.lines.length;
  return { ...result, stats };
}
