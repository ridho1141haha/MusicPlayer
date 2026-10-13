package com.ridho.music.playback;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.After;
import org.junit.Test;

/** FOCUS-YTM-1 — In-process error bus contract. */
public class StreamErrorBusTest {

    @After
    public void cleanUp() {
        StreamErrorBus.clear();
    }

    @Test
    public void emptyByDefault() {
        StreamErrorBus.clear();
        assertNull(StreamErrorBus.latest());
    }

    @Test
    public void postThenRead() {
        StreamErrorBus.post("ytm:abc123", "ytm", "UNAVAILABLE", "requires sign-in");
        PlaybackErrorInfo info = StreamErrorBus.latest();
        assertEquals("ytm:abc123", info.trackId);
        assertEquals("ytm", info.sourceId);
        assertEquals("UNAVAILABLE", info.kind);
        assertEquals("requires sign-in", info.sourceDiagnostic);
        assertNull(info.errorCodeName);
    }

    @Test
    public void latestEntryWins() {
        StreamErrorBus.post("ytm:one", "ytm", "UNAVAILABLE", "first");
        StreamErrorBus.post("ytm:two", "ytm", "NETWORK", "second");
        assertEquals("ytm:two", StreamErrorBus.latest().trackId);
        assertEquals("NETWORK", StreamErrorBus.latest().kind);
    }

    @Test
    public void clearRemovesEntry() {
        StreamErrorBus.post("jamendo:9", "jamendo", "NETWORK", "offline");
        StreamErrorBus.clear();
        assertNull(StreamErrorBus.latest());
    }

    @Test
    public void belongsToMatchesTrackId() {
        StreamErrorBus.post("ytm:dQw4w9WgXcQ", "ytm", "UNAVAILABLE", "gated");
        PlaybackErrorInfo info = StreamErrorBus.latest();
        org.junit.Assert.assertTrue(info.belongsTo("ytm:dQw4w9WgXcQ"));
        org.junit.Assert.assertFalse(info.belongsTo("ytm:other"));
    }
}
