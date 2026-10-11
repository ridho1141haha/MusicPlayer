import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { activeLineIndex, parse, parseWithStats } from '../../src/lib/lab/lrc-parser';

const LRC_DIR = join(process.cwd(), 'fixtures', 'lrc');

// ------------------------------------------------- mirrors of LrcParserTest.java

describe('mirrors of LrcParserTest (JVM golden expectations)', () => {
  it('parsesSyncedLrc', () => {
    const lrc = '[ti:Song]\n[00:01.00]First line\n[00:05.50]Second line\n[01:02.123]Third\n';
    const lyrics = parse(lrc);
    expect(lyrics.synced).toBe(true);
    expect(lyrics.lines.length).toBe(3);
    expect(lyrics.lines[0].timeMs).toBe(1000);
    expect(lyrics.lines[0].text).toBe('First line');
    expect(lyrics.lines[1].timeMs).toBe(5500);
    expect(lyrics.lines[2].timeMs).toBe(62123);
  });

  it('parsesMultipleTagsPerLine', () => {
    const lyrics = parse('[00:01.00][00:10.00]Chorus\n');
    expect(lyrics.synced).toBe(true);
    expect(lyrics.lines.length).toBe(2);
    expect(lyrics.lines[0].text).toBe('Chorus');
    expect(lyrics.lines[1].text).toBe('Chorus');
  });

  it('treatsPlainTextAsUnsynced', () => {
    const lyrics = parse('Just some words\nNo timestamps here\n');
    expect(lyrics.synced).toBe(false);
    expect(lyrics.lines.length).toBe(2);
    expect(lyrics.lines[0].text).toBe('Just some words');
  });

  it('metadataOnlyYieldsEmptyUnsynced', () => {
    const lyrics = parse('[ti:Song]\n[ar:Artist]\n');
    expect(lyrics.synced).toBe(false);
    expect(lyrics.lines.length).toBe(0);
  });

  it('nullAndEmptyAreSafe', () => {
    expect(parse(null).lines.length).toBe(0);
    expect(parse('').lines.length).toBe(0);
    expect(parse(null).synced).toBe(false);
  });

  it('activeLineIndexTracksPosition', () => {
    const lines = parse('[00:01.00]A\n[00:10.00]B\n[00:20.00]C\n').lines;
    expect(activeLineIndex(lines, 500)).toBe(-1);
    expect(activeLineIndex(lines, 1000)).toBe(0);
    expect(activeLineIndex(lines, 9999)).toBe(0);
    expect(activeLineIndex(lines, 10000)).toBe(1);
    expect(activeLineIndex(lines, 999999)).toBe(2);
  });

  it('sortsUnorderedTimestamps', () => {
    const lyrics = parse('[00:20.00]Late\n[00:01.00]Early\n');
    expect(lyrics.lines[0].text).toBe('Early');
    expect(lyrics.lines[1].text).toBe('Late');
  });
});

// ------------------------------------------------- extra web-harness robustness

describe('LRC extra robustness (still Java-consistent behavior)', () => {
  it('handles CRLF and bare-CR line endings', () => {
    expect(parse('[00:01.00]A\r\n[00:02.00]B\r[00:03.00]C').lines.length).toBe(3);
  });

  it('accepts colon fraction separator [mm:ss:xx]', () => {
    const lyrics = parse('[00:01:50]Half\n');
    expect(lyrics.synced).toBe(true);
    expect(lyrics.lines[0].timeMs).toBe(1500);
  });

  it('skips timestamp-only lines but keeps the rest synced', () => {
    const lyrics = parse('[00:01.00]\n[00:02.00]Content\n');
    expect(lyrics.synced).toBe(true);
    expect(lyrics.lines.length).toBe(1);
    expect(lyrics.lines[0].text).toBe('Content');
  });

  it('partial bracket line is plain text, not metadata', () => {
    const lyrics = parse('[broken tag\nReal words');
    expect(lyrics.synced).toBe(false);
    expect(lyrics.lines.length).toBe(2);
    expect(lyrics.lines[0].text).toBe('[broken tag');
  });

  it('duplicate identical tags both removed (Java String.replace parity)', () => {
    const lyrics = parse('[00:01.00][00:01.00]Twice\n');
    expect(lyrics.lines.length).toBe(2);
    expect(lyrics.lines[0].text).toBe('Twice');
  });
});

// ------------------------------------------------- synthetic fixtures (labeled)

describe('synthetic LRC fixtures (clearly labeled, not network captures)', () => {
  it('demo_synced.lrc parses synced with metadata', () => {
    const raw = readFileSync(join(LRC_DIR, 'demo_synced.lrc'), 'utf8');
    const lyrics = parse(raw);
    expect(lyrics.synced).toBe(true);
    expect(lyrics.lines.length).toBeGreaterThanOrEqual(8);
    expect(activeLineIndex(lyrics.lines, 16000)).toBeGreaterThanOrEqual(0);
  });

  it('demo_unsynced.lrc parses as plain text', () => {
    const raw = readFileSync(join(LRC_DIR, 'demo_unsynced.lrc'), 'utf8');
    const lyrics = parse(raw);
    expect(lyrics.synced).toBe(false);
    expect(lyrics.lines.length).toBeGreaterThanOrEqual(4);
  });

  it('demo_edge.lrc: metadata + timestamp-only lines counted by stats', () => {
    const raw = readFileSync(join(LRC_DIR, 'demo_edge.lrc'), 'utf8');
    const result = parseWithStats(raw);
    expect(result.synced).toBe(true);
    expect(result.stats.metadataTags).toBeGreaterThanOrEqual(2);
    expect(result.stats.timestampOnlyLines).toBeGreaterThanOrEqual(1);
    expect(result.lines.length).toBeGreaterThanOrEqual(3);
  });
});
