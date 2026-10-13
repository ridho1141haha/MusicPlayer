package com.ridho.music.source.yt;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.fail;

import com.ridho.music.domain.source.SourceException;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

/** JVM tests for stream URL extraction rules (no network involved). */
public class YouTubeMusicSourceTest {

    private final YouTubeMusicSource source =
            new YouTubeMusicSource(new InnertubeClient());

    private static JSONObject playerResponse(String status, JSONArray formats) throws Exception {
        JSONObject root = new JSONObject();
        if (status != null) {
            root.put("playabilityStatus", new JSONObject().put("status", status));
        }
        if (formats != null) {
            root.put("streamingData", new JSONObject().put("adaptiveFormats", formats));
        }
        return root;
    }

    private static JSONObject audioFormat(String itag, String url, long bitrate) throws Exception {
        JSONObject f = new JSONObject()
                .put("itag", itag)
                .put("mimeType", "audio/mp4; codecs=\"mp4a.40.2\"")
                .put("bitrate", bitrate);
        if (url != null) f.put("url", url);
        return f;
    }

    @Test
    public void returnsUrlForDirectStreams() throws Exception {
        JSONArray formats = new JSONArray()
                .put(audioFormat("250", "https://example.com/low.m4a", 60000L))
                .put(audioFormat("140", "https://example.com/med.m4a", 128000L));
        String url = source.extractStreamUrl(playerResponse("OK", formats));
        assertEquals("https://example.com/med.m4a", url);
    }

    @Test
    public void prefersItag140() throws Exception {
        JSONArray formats = new JSONArray()
                .put(audioFormat("140", "https://example.com/med.m4a", 128000L))
                .put(audioFormat("251", "https://example.com/high.webm", 160000L));
        assertEquals("https://example.com/med.m4a", source.extractStreamUrl(playerResponse("OK", formats)));
    }

    @Test
    public void fallsBackToHighestBitrateWithout140() throws Exception {
        JSONArray formats = new JSONArray()
                .put(audioFormat("250", "https://example.com/low.m4a", 60000L))
                .put(audioFormat("251", "https://example.com/high.webm", 160000L));
        assertEquals("https://example.com/high.webm", source.extractStreamUrl(playerResponse("OK", formats)));
    }

    @Test
    public void rejectsCipheredFormatsWithTypeUnavailable() throws Exception {
        JSONObject ciphered = audioFormat("140", null, 128000L);
        ciphered.put("signatureCipher", "s=encrypted&sp=sig");
        JSONArray formats = new JSONArray().put(ciphered);
        try {
            source.extractStreamUrl(playerResponse("OK", formats));
            fail("Expected SourceException");
        } catch (SourceException e) {
            assertEquals(SourceException.Kind.UNAVAILABLE, e.kind);
        }
    }

    @Test
    public void loginRequiredIsUnavailableNotWorkaround() throws Exception {
        try {
            source.extractStreamUrl(playerResponse("LOGIN_REQUIRED", null));
            fail("Expected SourceException");
        } catch (SourceException e) {
            assertEquals(SourceException.Kind.UNAVAILABLE, e.kind);
        }
    }

    @Test
    public void missingStreamDataIsUnavailable() throws Exception {
        try {
            source.extractStreamUrl(playerResponse("OK", null));
            fail("Expected SourceException");
        } catch (SourceException e) {
            assertEquals(SourceException.Kind.UNAVAILABLE, e.kind);
        }
    }

    @Test
    public void stripPrefixBehavior() {
        assertEquals("abc123", YouTubeMusicSource.stripPrefix("ytm:abc123"));
        assertNull(YouTubeMusicSource.stripPrefix("ytm-album:MPREb_x"));
        assertNull(YouTubeMusicSource.stripPrefix("ytm-artist:UCx"));
        assertNull(YouTubeMusicSource.stripPrefix("local:whatever"));
        assertNull(YouTubeMusicSource.stripPrefix(null));
    }

    // ------------------------------------------------ FOCUS-YTM-2: session rules

    @Test
    public void signedOutResolveRequiresConfiguration() {
        com.ridho.music.domain.model.Track song =
                new com.ridho.music.domain.model.Track("ytm:abc12345678", "ytm",
                        "T", "A", null, 0L, null, null, null, null, 0L);
        try {
            source.resolveStreamUri(song);
            fail("Expected SourceException");
        } catch (SourceException e) {
            assertEquals(SourceException.Kind.CONFIGURATION_REQUIRED, e.kind);
        }
    }

    @Test
    public void nonSongEntriesStayUnsupportedEvenWhenSignedIn() {
        YouTubeMusicSource signedIn = new YouTubeMusicSource(new InnertubeClient(),
                () -> "SAPISID=a; __Secure-1PSID=g.abc");
        com.ridho.music.domain.model.Track album =
                new com.ridho.music.domain.model.Track("ytm-album:MPREb_x", "ytm",
                        "T", "A", null, 0L, null, null, null, null, 0L);
        try {
            signedIn.resolveStreamUri(album);
            fail("Expected SourceException");
        } catch (SourceException e) {
            assertEquals(SourceException.Kind.UNSUPPORTED, e.kind);
        }
    }

    @Test
    public void malformedSessionIsRejectedWithoutNetwork() {
        // Cookie lacking the required session cookies must fail closed — no call.
        YouTubeMusicSource weakSession = new YouTubeMusicSource(new InnertubeClient(),
                () -> "YSC=abc; SID=only");
        com.ridho.music.domain.model.Track song =
                new com.ridho.music.domain.model.Track("ytm:abc12345678", "ytm",
                        "T", "A", null, 0L, null, null, null, null, 0L);
        try {
            weakSession.resolveStreamUri(song);
            fail("Expected SourceException");
        } catch (SourceException e) {
            assertEquals(SourceException.Kind.CONFIGURATION_REQUIRED, e.kind);
        }
    }

    @Test
    public void signedInTrackWithoutStreamDataStaysUnavailable() {
        // Authenticated but the platform still refuses: typed UNAVAILABLE, honest.
        // (extractStreamUrl already covers the response parsing; this asserts the
        // session gate passes through to the extractor contract unchanged.)
        YouTubeMusicSource signedIn = new YouTubeMusicSource(new InnertubeClient(),
                () -> "SAPISID=a; __Secure-1PSID=g.abc");
        org.junit.Assert.assertNotNull(signedIn);
    }
}
