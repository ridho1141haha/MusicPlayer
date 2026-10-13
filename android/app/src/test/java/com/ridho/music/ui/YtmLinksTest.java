package com.ridho.music.ui;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import com.ridho.music.domain.model.Track;

import org.junit.Test;

/** FOCUS-YTM-1 — Deep-link helpers (pure parts only; no Android intents on JVM). */
public class YtmLinksTest {

    @Test
    public void extractsVideoIdFromSongTrackId() {
        assertEquals("dQw4w9WgXcQ", YtmLinks.videoIdFromTrackId("ytm:dQw4w9WgXcQ"));
        assertEquals("2A9Atl2hUkg", YtmLinks.videoIdFromTrackId("ytm:2A9Atl2hUkg"));
    }

    @Test
    public void rejectsCatalogIdsAndGarbage() {
        assertNull(YtmLinks.videoIdFromTrackId("ytm-album:MPREb_x"));
        assertNull(YtmLinks.videoIdFromTrackId("ytm-artist:UCx"));
        assertNull(YtmLinks.videoIdFromTrackId("local:whatever"));
        assertNull(YtmLinks.videoIdFromTrackId(null));
        assertNull(YtmLinks.videoIdFromTrackId("ytm:"));
        assertNull(YtmLinks.videoIdFromTrackId("ytm:short")); // too short
        assertNull(YtmLinks.videoIdFromTrackId("ytm:has space123")); // bad charset
        assertNull(YtmLinks.videoIdFromTrackId("ytm:" + "a".repeat(20))); // too long
    }

    @Test
    public void buildsCanonicalWatchUrl() {
        assertEquals("https://music.youtube.com/watch?v=dQw4w9WgXcQ",
                YtmLinks.watchUrl("dQw4w9WgXcQ"));
    }

    @Test
    public void videoIdOfChecksSourceId() {
        Track ytm = new Track("ytm:dQw4w9WgXcQ", Track.SOURCE_YTM,
                "T", "A", null, 0L, null, null, null, null, 0L);
        assertEquals("dQw4w9WgXcQ", YtmLinks.videoIdOf(ytm));

        Track jamendo = new Track("jamendo:123", Track.SOURCE_JAMENDO,
                "T", "A", null, 0L, null, null, null, null, 0L);
        assertNull(YtmLinks.videoIdOf(jamendo));
        assertNull(YtmLinks.videoIdOf(null));
    }
}
