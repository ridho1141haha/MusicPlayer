package com.ridho.music.source.yt;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import com.ridho.music.domain.model.SearchSection;
import com.ridho.music.domain.model.Track;

import org.json.JSONObject;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * JVM tests for the InnerTube search response parser.
 *
 * <p>Fixture provenance (honest, no fabricated "live" data):
 * <ul>
 *   <li>The inline legacy fixture below mirrors the OLD WEB_REMIX shelf shape and
 *       keeps the parser backward compatible.</li>
 *   <li>The {@code /ytm/search_live_2026-10-11_*.json} resources are <b>sanitized
 *       trims of real, unauthenticated WEB_REMIX search responses captured on
 *       2026-10-11</b> (queries "Lathi", "test", and a gibberish query). Sanitization:
 *       {@code trackingParams}/{@code clickTrackingParams} tokens removed and bulky
 *       parse-irrelevant keys ({@code menu}, {@code onTap}, {@code playlistItemData})
 *       dropped; every parse-relevant field is verbatim from the capture.</li>
 * </ul></p>
 */
public class YtMusicSearchParserTest {

    // Trimmed fixture shaped exactly like the legacy (shelf-based) WEB_REMIX search
    // response (songs shelf with flexColumns/fixedColumns/thumbnail, albums shelf with browseId).
    private static final String LEGACY_FIXTURE = "{\"contents\":{\"tabbedSearchResultsRenderer\":{\"tabs\":[{\"tabRenderer\":{\"content\":{\"sectionListRenderer\":{\"contents\":[{\"musicShelfRenderer\":{\"title\":{\"runs\":[{\"text\":\"Songs\"}]},\"contents\":[{\"musicResponsiveListItemRenderer\":{\"flexColumns\":[{\"musicResponsiveListItemFlexColumnRenderer\":{\"text\":{\"runs\":[{\"text\":\"Track A\"}]}}},{\"musicResponsiveListItemFlexColumnRenderer\":{\"text\":{\"runs\":[{\"text\":\"Artist X\"},{\"text\":\" & \"},{\"text\":\"Artist Y\"}]}}},{\"musicResponsiveListItemFlexColumnRenderer\":{\"text\":{\"runs\":[{\"text\":\"Album Z\"}]}}}],\"fixedColumns\":[{\"musicResponsiveListItemFlexColumnRenderer\":{\"text\":{\"runs\":[{\"text\":\"3:45\"}]}}}],\"navigationEndpoint\":{\"watchEndpoint\":{\"videoId\":\"abc123\"}},\"thumbnail\":{\"musicThumbnailRenderer\":{\"thumbnail\":{\"thumbnails\":[{\"url\":\"http://insecure/img1\",\"width\":60},{\"url\":\"https://example.com/img544\",\"width\":544}]}}}}}]}},{\"musicShelfRenderer\":{\"title\":{\"runs\":[{\"text\":\"Albums\"}]},\"contents\":[{\"musicResponsiveListItemRenderer\":{\"flexColumns\":[{\"musicResponsiveListItemFlexColumnRenderer\":{\"text\":{\"runs\":[{\"text\":\"Album Z\"}]}}},{\"musicResponsiveListItemFlexColumnRenderer\":{\"text\":{\"runs\":[{\"text\":\"Artist X\"}]}}}],\"navigationEndpoint\":{\"browseEndpoint\":{\"browseId\":\"MPREb_9x8y\"}}}}]}}]}}}}]}}}";

    // ---------------------------------------------------------------- legacy layout

    @Test
    public void parsesSongsAndAlbumShelves() throws Exception {
        List<SearchSection> sections = YtMusicSearchParser.parse(new JSONObject(LEGACY_FIXTURE));
        assertNotNull(sections);
        assertEquals(2, sections.size());

        SearchSection songs = sections.get(0);
        assertEquals("Songs", songs.title);
        assertEquals(1, songs.tracks.size());
        Track song = songs.tracks.get(0);
        assertEquals("ytm:abc123", song.id);
        assertEquals("Track A", song.title);
        assertEquals("Artist X & Artist Y", song.artist);
        assertEquals("Album Z", song.album);
        assertEquals(225000L, song.durationMs); // 3:45
        assertEquals("https://example.com/img544", song.artworkUrl);

        SearchSection albums = sections.get(1);
        assertEquals("Albums", albums.title);
        assertEquals("ytm-album:MPREb_9x8y", albums.tracks.get(0).id);
    }

    // ---------------------------------------------------------------- 2025+ flat layout (live captures)

    /** Real response, query "Lathi": card + songs/albums/artists interleaved flat. */
    @Test
    public void parsesLive2026FlatLayoutLathi() throws Exception {
        List<SearchSection> sections = YtMusicSearchParser.parse(
                new JSONObject(readResource("/ytm/search_live_2026-10-11_lathi.json")));
        assertNotNull(sections);
        assertTrue("expected several sections, got " + sections.size(), sections.size() >= 3);

        // Top-result card: "LATHI" video card, duration from subtitle tail.
        Track top = findById(sections, "ytm:8uy7G2JXVSA");
        assertNotNull("top-result card track missing", top);
        assertEquals("LATHI", top.title);
        assertEquals("Weird Genius & Sara Fajira", top.artist);
        assertEquals(187000L, top.durationMs); // 3:07 from card subtitle

        // Flat song item: typed subtitle split, engagement metric NOT leaked into album.
        Track song = findById(sections, "ytm:UwTnUpDuwGg");
        assertNotNull("flat song item missing", song);
        assertEquals("Songs", sectionOf(sections, song).title);
        assertEquals("Weird Genius & Sara Fajira", song.artist);
        assertNull("metric column must not become the album", song.album);
        assertEquals(0L, song.durationMs); // flat layout has no fixedColumns

        // Album (Single) catalog link keeps its legacy prefix semantics.
        Track album = findById(sections, "ytm-album:MPREb_CVL4u2p5bWY");
        assertNotNull(album);
        assertEquals("Albums", sectionOf(sections, album).title);
        assertEquals("Guru Saab", album.artist);

        // Artist catalog link; artist field stays clean (audience metric is not a name).
        Track artist = findById(sections, "ytm-artist:UCeKD0TroyCQj0wAG_qLjxYw");
        assertNotNull(artist);
        assertEquals("Artists", sectionOf(sections, artist).title);
        assertEquals("Unknown artist", artist.artist);

        // Section order follows response order: card first.
        assertEquals(YtMusicSearchParser.SECTION_TOP_RESULT, sections.get(0).title);
        // No podcast/playlist/episode sections from the live payload.
        for (SearchSection s : sections) {
            assertTrue("unexpected section " + s.title,
                    !s.title.equals("Podcasts") && !s.title.equals("Playlists"));
        }
    }

    /** Real response, query "test": includes a podcast entry that must be skipped. */
    @Test
    public void parsesLive2026FlatLayoutTestQuery() throws Exception {
        List<SearchSection> sections = YtMusicSearchParser.parse(
                new JSONObject(readResource("/ytm/search_live_2026-10-11_test.json")));
        assertNotNull(sections);

        Track song = findById(sections, "ytm:f5dBEd4L2Uc"); // "Testing" — Skusta Clee
        assertNotNull(song);
        assertEquals("Testing", song.title);
        assertEquals("Skusta Clee", song.artist);
        assertEquals("Songs", sectionOf(sections, song).title);

        // The top card is a Single (album page) → catalog link in "Top result".
        Track cardAlbum = findById(sections, "ytm-album:MPREb_LHCI5PDnbYo");
        assertNotNull("card album entry missing", cardAlbum);
        assertEquals(YtMusicSearchParser.SECTION_TOP_RESULT, sectionOf(sections, cardAlbum).title);

        // Podcast (MPSPPL…) is out of scope → no such track anywhere.
        assertNull(findById(sections, "ytm:MPSPPLvIgLJ33pRwC0vknD9E1IeOeL1kZgIc9x"));
        assertNull(findById(sections, "ytm-album:MPSPPLvIgLJ33pRwC0vknD9E1IeOeL1kZgIc9x"));
    }

    /** Real response, gibberish query: the API fuzzy-matches instead of returning empty. */
    @Test
    public void gibberishQueryStillParsesFuzzyMatch() throws Exception {
        List<SearchSection> sections = YtMusicSearchParser.parse(
                new JSONObject(readResource("/ytm/search_live_2026-10-11_gibberish.json")));
        assertNotNull(sections);
        // "Episode" card is skipped (out of scope); the fuzzy-matched video item survives.
        Track video = findById(sections, "ytm:ly8H6zLFcMM");
        assertNotNull(video);
        assertEquals("Videos", sectionOf(sections, video).title);
        assertEquals("JbXianOFW🇧🇷", video.artist);
        assertNull(video.album); // "485 views" is a metric, not an album
    }

    // ---------------------------------------------------------------- defensive cases

    @Test
    public void malformedJsonReturnsEmptyNotCrash() {
        List<SearchSection> sections = YtMusicSearchParser.parse(new JSONObject());
        assertTrue(sections == null || sections.isEmpty());
    }

    @Test
    public void unknownStructureYieldsEmptyNotCrash() throws Exception {
        // Structurally valid JSON that is not a search response at all.
        List<SearchSection> sections = YtMusicSearchParser.parse(
                new JSONObject("{\"contents\":{\"somethingElse\":{\"a\":1}}}"));
        assertTrue(sections == null || sections.isEmpty());
    }

    @Test
    public void emptyBlockListYieldsEmpty() throws Exception {
        // Real envelope shape but zero result blocks.
        List<SearchSection> sections = YtMusicSearchParser.parse(new JSONObject(
                "{\"contents\":{\"tabbedSearchResultsRenderer\":{\"tabs\":[]}}}"));
        assertTrue(sections == null || sections.isEmpty());
    }

    @Test
    public void nullRootIsSafe() {
        assertNull(YtMusicSearchParser.parse(null));
    }

    // ---------------------------------------------------------------- classification units

    @Test
    public void typedSubtitleClassification() throws Exception {
        // "Song • A & B" with an engagement-metric third column → artist split, no album.
        Track song = YtMusicSearchParser.parseItem(new JSONObject("{\"flexColumns\":["
                + col("My Track") + "," + col("Song", " • ", "A & B") + "," + col("238M plays")
                + "],\"navigationEndpoint\":{\"watchEndpoint\":{\"videoId\":\"v1\"}}}"));
        assertNotNull(song);
        assertEquals("ytm:v1", song.id);
        assertEquals("A & B", song.artist);
        assertNull(song.album);

        // Podcast episode kind → deliberately skipped (null), even with a watch endpoint.
        Track episode = YtMusicSearchParser.parseItem(new JSONObject("{\"flexColumns\":["
                + col("Ep 1") + "," + col("Episode", " • ", "Some Show")
                + "],\"navigationEndpoint\":{\"watchEndpoint\":{\"videoId\":\"v2\"}}}"));
        assertNull(episode);

        // Unknown kind word → falls back to plain-artist semantics (legacy shape).
        Track odd = YtMusicSearchParser.parseItem(new JSONObject("{\"flexColumns\":["
                + col("T") + "," + col("Some Collaborators")
                + "],\"navigationEndpoint\":{\"watchEndpoint\":{\"videoId\":\"v3\"}}}"));
        assertNotNull(odd);
        assertEquals("Some Collaborators", odd.artist);

        // Card with a duration tail → duration parsed from subtitle.
        Track card = YtMusicSearchParser.parseCardItem(new JSONObject(
                "{\"title\":{\"runs\":[{\"text\":\"CV\",\"navigationEndpoint\":"
                        + "{\"watchEndpoint\":{\"videoId\":\"v4\"}}}]},"
                        + "\"subtitle\":{\"runs\":[{\"text\":\"Video • Someone • 12 views • 2:05\"}]}}"));
        assertNotNull(card);
        assertEquals(125000L, card.durationMs);
    }

    @Test
    public void durationParsing() {
        assertEquals(256000L, YtMusicSearchParser.parseDurationMs("4:16"));
        assertEquals(3725000L, YtMusicSearchParser.parseDurationMs("1:02:05"));
        assertEquals(0L, YtMusicSearchParser.parseDurationMs(null));
        assertEquals(0L, YtMusicSearchParser.parseDurationMs(""));
        assertEquals(0L, YtMusicSearchParser.parseDurationMs("garbage"));
    }

    // ---------------------------------------------------------------- helpers

    private static String col(String... runs) {
        StringBuilder sb = new StringBuilder(
                "{\"musicResponsiveListItemFlexColumnRenderer\":{\"text\":{\"runs\":[");
        for (int i = 0; i < runs.length; i++) {
            if (i > 0) sb.append(",");
            sb.append("{\"text\":\"").append(runs[i]).append("\"}");
        }
        return sb.append("]}}}").toString();
    }

    private static String readResource(String path) throws Exception {
        try (InputStream in = YtMusicSearchParserTest.class.getResourceAsStream(path)) {
            assertNotNull("test resource missing: " + path, in);
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            return new String(bos.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static Track findById(List<SearchSection> sections, String id) {
        for (SearchSection s : sections) {
            for (Track t : s.tracks) {
                if (id.equals(t.id)) return t;
            }
        }
        return null;
    }

    private static SearchSection sectionOf(List<SearchSection> sections, Track track) {
        for (SearchSection s : sections) {
            for (Track t : s.tracks) {
                if (t == track || t.id.equals(track.id)) return s;
            }
        }
        throw new AssertionError("track not in any section: " + track.id);
    }
}
