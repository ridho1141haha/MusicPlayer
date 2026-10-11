package com.ridho.music.domain.model;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONException;
import org.junit.Test;

/** JVM tests for Track JSON serialization (used across MediaMetadata/Room boundaries). */
public class TrackTest {

    private static Track sample() {
        return new Track("ytm:abc", Track.SOURCE_YTM, "Title", "Artist", "Album",
                185000L, null, "https://example.com/art.jpg", null, "[00:01.00]Hi",
                123L);
    }

    @Test
    public void jsonRoundTripPreservesAllFields() throws JSONException {
        Track original = sample();
        Track copy = Track.fromJson(original.toJson());

        assertEquals(original.id, copy.id);
        assertEquals(original.sourceId, copy.sourceId);
        assertEquals(original.title, copy.title);
        assertEquals(original.artist, copy.artist);
        assertEquals(original.album, copy.album);
        assertEquals(original.durationMs, copy.durationMs);
        assertNull(copy.artworkPath);
        assertEquals(original.artworkUrl, copy.artworkUrl);
        assertNull(copy.streamUri);
        assertEquals(original.lyrics, copy.lyrics);
        assertEquals(original.addedAtMs, copy.addedAtMs);
    }

    @Test
    public void fromJsonStringSurvivesGarbage() {
        assertNull(Track.fromJsonString("not json"));
        assertNull(Track.fromJsonString(""));
        assertNull(Track.fromJsonString(null));
    }

    @Test
    public void nullTitleAndArtistFallBackToUnknown() {
        Track t = new Track("x", Track.SOURCE_LOCAL, null, null, null, 0, null, null, null, null, 0);
        assertEquals("Unknown title", t.title);
        assertEquals("Unknown artist", t.artist);
    }

    @Test
    public void withStreamUriCopiesTrack() {
        Track t = sample().withStreamUri("https://example.com/stream.m4a");
        assertTrue(t.hasResolvedStream());
        assertEquals("https://example.com/stream.m4a", t.streamUri);
        assertFalse(t.isLocal());
        assertEquals(sample().id, t.id);
    }
}
