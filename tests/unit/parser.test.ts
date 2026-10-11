import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  ID_PREFIX_ALBUM,
  ID_PREFIX_ARTIST,
  ID_PREFIX_SONG,
  SECTION_TOP_RESULT,
  collectRendererStats,
  explainRejection,
  findContinuationToken,
  parse,
  parseCardItem,
  parseDurationMs,
  parseItem,
  parseWithTrace,
} from '../../src/lib/lab/yt-search-parser';
import type { LabTrack, SearchSection } from '../../src/lib/lab/types';

const FIXTURE_DIR = join(process.cwd(), 'fixtures', 'ytm');

function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURE_DIR, name), 'utf8'));
}

function findById(sections: SearchSection[], id: string): LabTrack | null {
  for (const s of sections) {
    for (const t of s.tracks) {
      if (t.id === id) return t;
    }
  }
  return null;
}

function sectionOf(sections: SearchSection[], track: LabTrack): SearchSection {
  for (const s of sections) {
    if (s.tracks.some((t) => t.id === track.id)) return s;
  }
  throw new Error(`track not in any section: ${track.id}`);
}

// ---------------------------------------------------------------- legacy layout

describe('legacy shelf layout (inline fixture from Java test, verbatim)', () => {
  const root = readFixture('search_legacy_shelf.json');

  it('parses songs and album shelves', () => {
    const sections = parse(root);
    expect(sections).not.toBeNull();
    expect(sections!.length).toBe(2);

    const songs = sections![0];
    expect(songs.title).toBe('Songs');
    expect(songs.tracks.length).toBe(1);
    const song = songs.tracks[0];
    expect(song.id).toBe('ytm:abc123');
    expect(song.title).toBe('Track A');
    expect(song.artist).toBe('Artist X & Artist Y');
    expect(song.album).toBe('Album Z');
    expect(song.durationMs).toBe(225000); // 3:45
    expect(song.artworkUrl).toBe('https://example.com/img544');

    const albums = sections![1];
    expect(albums.title).toBe('Albums');
    expect(albums.tracks[0].id).toBe('ytm-album:MPREb_9x8y');
  });
});

// ---------------------------------------------------------------- 2025+ flat layout (live captures)

describe('flat 2026 layout — live capture "Lathi" (real response, sanitized)', () => {
  const sections = parse(readFixture('search_live_2026-10-11_lathi.json'))!;

  it('finds several sections', () => {
    expect(sections.length).toBeGreaterThanOrEqual(3);
  });

  it('parses the top-result card with duration from the subtitle tail', () => {
    const top = findById(sections, 'ytm:8uy7G2JXVSA');
    expect(top).not.toBeNull();
    expect(top!.title).toBe('LATHI');
    expect(top!.artist).toBe('Weird Genius & Sara Fajira');
    expect(top!.durationMs).toBe(187000); // 3:07 from card subtitle
  });

  it('parses the flat song item; engagement metric never becomes the album', () => {
    const song = findById(sections, 'ytm:UwTnUpDuwGg');
    expect(song).not.toBeNull();
    expect(sectionOf(sections, song!).title).toBe('Songs');
    expect(song!.artist).toBe('Weird Genius & Sara Fajira');
    expect(song!.album).toBeNull();
    expect(song!.durationMs).toBe(0); // flat layout has no fixedColumns
  });

  it('keeps catalog link semantics for album and artist entries', () => {
    const album = findById(sections, 'ytm-album:MPREb_CVL4u2p5bWY');
    expect(album).not.toBeNull();
    expect(sectionOf(sections, album!).title).toBe('Albums');
    expect(album!.artist).toBe('Guru Saab');

    const artist = findById(sections, 'ytm-artist:UCeKD0TroyCQj0wAG_qLjxYw');
    expect(artist).not.toBeNull();
    expect(sectionOf(sections, artist!).title).toBe('Artists');
    expect(artist!.artist).toBe('Unknown artist');
  });

  it('orders sections by response order (card first) and skips podcasts/playlists', () => {
    expect(sections[0].title).toBe(SECTION_TOP_RESULT);
    for (const s of sections) {
      expect(['Podcasts', 'Playlists']).not.toContain(s.title);
    }
  });
});

describe('flat 2026 layout — live capture "test" (real response, sanitized)', () => {
  const sections = parse(readFixture('search_live_2026-10-11_test.json'))!;

  it('parses "Testing" by Skusta Clee into Songs', () => {
    const song = findById(sections, 'ytm:f5dBEd4L2Uc');
    expect(song).not.toBeNull();
    expect(song!.title).toBe('Testing');
    expect(song!.artist).toBe('Skusta Clee');
    expect(sectionOf(sections, song!).title).toBe('Songs');
  });

  it('puts the Single card in Top result', () => {
    const cardAlbum = findById(sections, 'ytm-album:MPREb_LHCI5PDnbYo');
    expect(cardAlbum).not.toBeNull();
    expect(sectionOf(sections, cardAlbum!).title).toBe(SECTION_TOP_RESULT);
  });

  it('never surfaces the podcast (MPSPPL…) entry', () => {
    expect(findById(sections, 'ytm:MPSPPLvIgLJ33pRwC0vknD9E1IeOeL1kZgIc9x')).toBeNull();
    expect(findById(sections, 'ytm-album:MPSPPLvIgLJ33pRwC0vknD9E1IeOeL1kZgIc9x')).toBeNull();
  });
});

describe('live capture gibberish query (real response, sanitized)', () => {
  it('still parses the fuzzy-matched video (API never returns a true empty page)', () => {
    const sections = parse(readFixture('search_live_2026-10-11_gibberish.json'))!;
    const video = findById(sections, 'ytm:ly8H6zLFcMM');
    expect(video).not.toBeNull();
    expect(sectionOf(sections, video!).title).toBe('Videos');
    expect(video!.artist).toBe('JbXianOFW🇧🇷');
    expect(video!.album).toBeNull(); // "485 views" is a metric, not an album
  });
});

// ---------------------------------------------------------------- defensive cases

describe('defensive cases', () => {
  it('malformed (empty object) input yields empty, not crash', () => {
    const sections = parse({});
    expect(sections === null || sections.length === 0).toBe(true);
  });

  it('unknown structure yields empty, not crash', () => {
    const sections = parse(readFixture('search_synth_unknown_structure.json'));
    expect(sections === null || sections.length === 0).toBe(true);
  });

  it('empty block list yields empty', () => {
    const sections = parse(readFixture('search_synth_empty_blocks.json'));
    expect(sections === null || sections.length === 0).toBe(true);
  });

  it('null root is safe (Java contract: null in → null out)', () => {
    expect(parse(null)).toBeNull();
  });
});

// ---------------------------------------------------------------- classification units (mirror Java test)

const col = (...runs: string[]): string =>
  `{"musicResponsiveListItemFlexColumnRenderer":{"text":{"runs":[${runs
    .map((r) => `{"text":"${r}"}`)
    .join(',')}]}}}`;

describe('typed subtitle classification', () => {
  it('splits artist, drops metric column', () => {
    const song = parseItem(
      JSON.parse(
        `{"flexColumns":[${col('My Track')},${col('Song', ' • ', 'A & B')},${col('238M plays')}],"navigationEndpoint":{"watchEndpoint":{"videoId":"v1"}}}`,
      ),
    );
    expect(song).not.toBeNull();
    expect(song!.id).toBe('ytm:v1');
    expect(song!.artist).toBe('A & B');
    expect(song!.album).toBeNull();
  });

  it('skips podcast episodes deliberately', () => {
    const episode = parseItem(
      JSON.parse(`{"flexColumns":[${col('Ep 1')},${col('Episode', ' • ', 'Some Show')}],"navigationEndpoint":{"watchEndpoint":{"videoId":"v2"}}}`),
    );
    expect(episode).toBeNull();
  });

  it('unknown kind word falls back to plain-artist semantics', () => {
    const odd = parseItem(
      JSON.parse(`{"flexColumns":[${col('T')},${col('Some Collaborators')}],"navigationEndpoint":{"watchEndpoint":{"videoId":"v3"}}}`),
    );
    expect(odd).not.toBeNull();
    expect(odd!.artist).toBe('Some Collaborators');
  });

  it('card duration parsed from subtitle tail', () => {
    const card = parseCardItem(
      JSON.parse(
        `{"title":{"runs":[{"text":"CV","navigationEndpoint":{"watchEndpoint":{"videoId":"v4"}}}]},"subtitle":{"runs":[{"text":"Video • Someone • 12 views • 2:05"}]}}`,
      ),
    );
    expect(card).not.toBeNull();
    expect(card!.durationMs).toBe(125000);
  });
});

describe('duration parsing', () => {
  it('mirrors the Java parser exactly', () => {
    expect(parseDurationMs('4:16')).toBe(256000);
    expect(parseDurationMs('1:02:05')).toBe(3725000);
    expect(parseDurationMs(null)).toBe(0);
    expect(parseDurationMs('')).toBe(0);
    expect(parseDurationMs('garbage')).toBe(0);
  });
});

// ---------------------------------------------------------------- synthetic edge-case fixture

describe('synthetic edge-case fixture (clearly labeled, not live data)', () => {
  const root = readFixture('search_synth_edge_cases.json');

  it('lets exactly one track survive', () => {
    const sections = parse(root)!;
    const all = sections.flatMap((s) => s.tracks);
    expect(all.length).toBe(1);
    expect(all[0].id).toBe('ytm:keepme001');
    expect(all[0].artist).toBe('Good Artist');
    expect(all[0].album).toBeNull(); // "1.2M plays" is a metric
    expect(all[0].artworkUrl).toBe('https://example.com/keepme-w544');
    expect(sectionOf(sections, all[0]).title).toBe('Songs');
  });

  it('explains every rejection in the trace', () => {
    const result = parseWithTrace(root);
    const reasons = result.trace.filter((e) => e.kind === 'rejected').map((e) => e.reason);
    expect(reasons.some((r) => r.includes('empty title'))).toBe(true);
    expect(reasons.some((r) => r.includes('no navigationEndpoint'))).toBe(true);
    // The podcast page is rejected by its typed subtitle BEFORE the endpoint check
    // (same order as the Java parser), and the top card is rejected the same way.
    expect(reasons.filter((r) => r.includes('podcast')).length).toBe(2);
  });

  it('explainRejection names unusable browseId prefixes when no kind word exists', () => {
    const mpsp = {
      flexColumns: [
        { musicResponsiveListItemFlexColumnRenderer: { text: { runs: [{ text: 'X' }] } } },
      ],
      navigationEndpoint: { browseEndpoint: { browseId: 'MPSPPLwhatever' } },
    };
    expect(explainRejection(mpsp)).toContain('MPSP');
    const mpedg = { ...mpsp, navigationEndpoint: { browseEndpoint: { browseId: 'MPEDGwhatever' } } };
    expect(explainRejection(mpedg)).toContain('MPEDG');
  });
});

// ---------------------------------------------------------------- web-lab extras

describe('parseWithTrace extras', () => {
  it('reports renderer stats for a live capture', () => {
    const result = parseWithTrace(readFixture('search_live_2026-10-11_lathi.json'));
    const stats = Object.fromEntries(result.rendererStats.map((s) => [s.type, s.count]));
    expect(stats['musicCardShelfRenderer']).toBe(1);
    expect((stats['itemSectionRenderer'] ?? 0)).toBeGreaterThan(0);
    expect((stats['musicResponsiveListItemRenderer'] ?? 0)).toBeGreaterThan(0);
  });

  it('reports null continuation (verified: live responses carry none)', () => {
    const result = parseWithTrace(readFixture('search_live_2026-10-11_lathi.json'));
    expect(result.continuationToken).toBeNull();
  });

  it('explains an unrecognized envelope', () => {
    const result = parseWithTrace({ contents: { somethingElse: { a: 1 } } });
    expect(result.sections).not.toBeNull();
    expect(result.sections!.length).toBe(0);
    expect(result.trace.some((e) => e.reason.includes('envelope not recognized'))).toBe(true);
  });
});

describe('id prefix constants (parity with Java)', () => {
  it('match the Android contract', () => {
    expect(ID_PREFIX_SONG).toBe('ytm:');
    expect(ID_PREFIX_ALBUM).toBe('ytm-album:');
    expect(ID_PREFIX_ARTIST).toBe('ytm-artist:');
  });
});

describe('continuation scanner sanity', () => {
  it('finds a token when one exists (synthetic structure)', () => {
    const root = {
      contents: {
        tabbedSearchResultsRenderer: {
          tabs: [
            {
              tabRenderer: {
                content: {
                  sectionListRenderer: {
                    contents: [
                      {
                        musicShelfRenderer: {
                          continuations: [
                            { nextContinuationData: { continuation: 'tok-abc' } },
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          ],
        },
      },
    };
    expect(findContinuationToken(root)).toBe('tok-abc');
  });

  it('explainRejection names the podcast prefix', () => {
    expect(explainRejection({ flexColumns: [], navigationEndpoint: null })).toContain('flexColumns');
  });
});
