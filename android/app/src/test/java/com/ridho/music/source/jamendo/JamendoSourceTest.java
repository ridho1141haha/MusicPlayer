package com.ridho.music.source.jamendo;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import com.ridho.music.domain.model.SearchSection;
import com.ridho.music.domain.model.Track;
import com.ridho.music.domain.source.SourceException;

import org.json.JSONObject;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

import okhttp3.Interceptor;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Protocol;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * WEBLAB-22A — JVM tests for {@link JamendoSource} + {@link JamendoClient}.
 *
 * <p>The network layer is faked with an OkHttp {@link Interceptor} (no extra test
 * dependency), so the REAL request-building, envelope-validation, parsing and
 * resolution code paths run end to end — only the socket is replaced. Canned
 * bodies come from real API captures with the client id masked.</p>
 */
public class JamendoSourceTest {

    // ---------------------------------------------------------------- fake http

    /** Queues canned JSON bodies; records every request URL for assertions. */
    private static final class FakeJamendoHttp implements Interceptor {
        final List<String> bodies = new java.util.ArrayList<>();
        final List<String> requestUrls = new java.util.ArrayList<>();
        int calls = 0;

        FakeJamendoHttp(String... bodies) {
            this.bodies.addAll(java.util.Arrays.asList(bodies));
        }

        @Override
        public Response intercept(Chain chain) throws java.io.IOException {
            Request request = chain.request();
            requestUrls.add(request.url().toString());
            calls++;
            String body = bodies.size() > 0
                    ? bodies.remove(0)
                    : "{\"headers\":{\"status\":\"failed\",\"code\":-1,\"error_message\":\"no canned body\"}}";
            return new Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(200)
                    .message("OK")
                    .body(ResponseBody.create(body, MediaType.parse("application/json")))
                    .build();
        }
    }

    private static final class SourceFixture {
        final JamendoSource source;
        final FakeJamendoHttp http;
        final AtomicReference<String> providerId = new AtomicReference<>(null);

        SourceFixture(String... bodies) {
            http = new FakeJamendoHttp(bodies);
            OkHttpClient client = new OkHttpClient.Builder().addInterceptor(http).build();
            providerId.set(null); // start unconfigured; tests flip it at request time
            JamendoClient jamendoClient = new JamendoClient(client, providerId::get);
            source = new JamendoSource(jamendoClient);
        }

        void configure(String id) {
            providerId.set(id);
        }
    }

    private static String readResource(String path) throws Exception {
        try (InputStream in = JamendoSourceTest.class.getResourceAsStream(path)) {
            if (in == null) throw new IllegalStateException("missing resource " + path);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static String realSearchBody() throws Exception {
        return readResource("/jamendo/search_real_2026-10-12_acoustic-love.json");
    }

    private static String emptyBody() throws Exception {
        return readResource("/jamendo/search_real_2026-10-12_empty.json");
    }

    private static String invalidClientIdBody() throws Exception {
        return readResource("/jamendo/error_invalid_client_id.json");
    }

    private static String singleTrackBody(String id, String audio) {
        return "{\"headers\":{\"status\":\"success\",\"code\":0,\"results_count\":1},"
                + "\"results\":[{\"id\":\"" + id + "\",\"name\":\"T\",\"artist_name\":\"A\","
                + "\"duration\":100,\"audio\":\"" + audio + "\"}]}";
    }

    // ---------------------------------------------------------------- configuration

    @Test
    public void unconfiguredSearchFailsWithConfigurationRequired() throws Exception {
        SourceFixture fx = new SourceFixture(realSearchBody());
        try {
            fx.source.search("love", 10);
            fail("expected SourceException");
        } catch (SourceException e) {
            assertEquals(SourceException.Kind.CONFIGURATION_REQUIRED, e.kind);
        }
    }

    @Test
    public void runtimeClientIdTakesEffectAtRequestTime() throws Exception {
        SourceFixture fx = new SourceFixture(realSearchBody());
        try {
            fx.source.search("love", 10);
            fail("expected CONFIGURATION_REQUIRED before configuring");
        } catch (SourceException e) {
            assertEquals(SourceException.Kind.CONFIGURATION_REQUIRED, e.kind);
        }
        // The SAME source instance picks up the credential without recreation.
        fx.configure("runtime-id-1234");
        List<SearchSection> sections = fx.source.search("love", 10);
        assertEquals(1, sections.size());
        assertEquals("Jamendo", sections.get(0).title);
        assertTrue(fx.http.requestUrls.get(0).contains("client_id=runtime-id-1234"));
    }

    @Test
    public void searchUrlCarriesDocumentedParameters() throws Exception {
        SourceFixture fx = new SourceFixture(realSearchBody());
        fx.configure("cfg-id-9");
        fx.source.search("acoustic love", 10);
        String url = fx.http.requestUrls.get(0);
        assertTrue(url.startsWith("https://api.jamendo.com/v3.0/tracks/"));
        assertTrue("client_id must be sent", url.contains("client_id=cfg-id-9"));
        assertTrue("format=json", url.contains("format=json"));
        assertTrue("search param must be encoded", url.contains("search=acoustic+love"));
        assertTrue("limit must be sent", url.contains("limit=10"));
        assertTrue("good-quality audio format", url.contains("audioformat=mp32"));
        assertTrue("artwork size", url.contains("imagesize=300"));
        assertTrue("license metadata requested", url.contains("include=licenses"));
        assertTrue("singles must be included", url.contains("type=single+albumtrack"));
    }

    @Test
    public void invalidClientIdEnvelopeMapsToConfigurationRequired() throws Exception {
        SourceFixture fx = new SourceFixture(invalidClientIdBody());
        fx.configure("bad-id");
        try {
            fx.source.search("love", 10);
            fail("expected SourceException");
        } catch (SourceException e) {
            assertEquals("Jamendo returns HTTP 200 with a failed envelope; code 5 means bad credential",
                    SourceException.Kind.CONFIGURATION_REQUIRED, e.kind);
        }
    }

    // ---------------------------------------------------------------- search behaviour

    @Test
    public void searchReturnsSingleJamendoSection() throws Exception {
        SourceFixture fx = new SourceFixture(realSearchBody());
        fx.configure("cfg");
        List<SearchSection> sections = fx.source.search("acoustic love", 10);
        assertEquals(1, sections.size());
        assertEquals("Jamendo", sections.get(0).title);
        assertEquals(5, sections.get(0).tracks.size());
        assertNull("healthy search clears diagnostics", fx.source.lastDiagnosticMessage());
    }

    @Test
    public void searchEmptyResultsReturnEmptyList_notException() throws Exception {
        SourceFixture fx = new SourceFixture(emptyBody());
        fx.configure("cfg");
        List<SearchSection> sections = fx.source.search("zzqqxx", 10);
        assertTrue("NO_RESULTS is an empty result, not an error", sections.isEmpty());
    }

    @Test
    public void searchFailureRecordsDiagnostic() throws Exception {
        SourceFixture fx = new SourceFixture(invalidClientIdBody());
        fx.configure("bad-id");
        try {
            fx.source.search("love", 10);
            fail("expected SourceException");
        } catch (SourceException e) {
            assertEquals(SourceException.Kind.CONFIGURATION_REQUIRED, e.kind);
        }
        assertTrue(fx.source.lastDiagnosticMessage() != null
                && !fx.source.lastDiagnosticMessage().isEmpty());
    }

    // ---------------------------------------------------------------- stream resolution

    @Test
    public void resolveStreamUriPrefersFreshLookupById() throws Exception {
        // The canned fresh response differs from the track's stale cached URL: the
        // fresh lookup must WIN when the catalog answers with a stream.
        SourceFixture fx = new SourceFixture(
                singleTrackBody("1896504", "https://prod-1.storage.jamendo.com/?trackid=1896504&format=mp32&from=fresh"));
        fx.configure("cfg");
        Track queued = new Track("jamendo:1896504", Track.SOURCE_JAMENDO, "Acoustic Love",
                "lesfm", null, 188_000L, null, null, "https://stale.example/old.mp3", null, 0L);
        String uri = fx.source.resolveStreamUri(queued);
        assertTrue("fresh lookup result must win", uri.contains("from=fresh"));
        assertTrue("resolution must query by track id",
                fx.http.requestUrls.get(0).contains("id=1896504"));
    }

    @Test
    public void resolveStreamUriFallsBackToCachedUrlWhenLookupEmpty() throws Exception {
        // Live-observed (2026-10-12): Jamendo's id-lookup is eventually consistent —
        // 0 results for an id the search returned seconds earlier. The cached URL is
        // canonical and stable, so it must be used instead of failing.
        SourceFixture fx = new SourceFixture(emptyBody());
        fx.configure("cfg");
        Track queued = new Track("jamendo:1896504", Track.SOURCE_JAMENDO, "T", "A",
                null, 0L, null, null,
                "https://prod-1.storage.jamendo.com/?trackid=1896504&format=mp32", null, 0L);
        String uri = fx.source.resolveStreamUri(queued);
        assertEquals("https://prod-1.storage.jamendo.com/?trackid=1896504&format=mp32", uri);
    }

    @Test
    public void resolveStreamUriFailsTypedOnlyWhenNothingUsable() throws Exception {
        SourceFixture fx = new SourceFixture(emptyBody()); // lookup empty AND nothing cached
        fx.configure("cfg");
        Track queued = new Track("jamendo:1896504", Track.SOURCE_JAMENDO, "T", "A",
                null, 0L, null, null, null, null, 0L);
        try {
            fx.source.resolveStreamUri(queued);
            fail("expected SourceException");
        } catch (SourceException e) {
            assertEquals(SourceException.Kind.UNAVAILABLE, e.kind);
        }
    }

    @Test
    public void resolveStreamUriFailsTypedWhenNoStreamReturned() throws Exception {
        SourceFixture fx = new SourceFixture(
                singleTrackBody("1896504", "")); // artist disabled streaming / catalog gap
        fx.configure("cfg");
        Track queued = new Track("jamendo:1896504", Track.SOURCE_JAMENDO, "T", "A",
                null, 0L, null, null, null, null, 0L);
        try {
            fx.source.resolveStreamUri(queued);
            fail("expected SourceException");
        } catch (SourceException e) {
            assertEquals(SourceException.Kind.UNAVAILABLE, e.kind);
        }
    }

    @Test
    public void resolveStreamUriKeepsCachedUrlWhenReResolutionErrors() throws Exception {
        // A failing envelope during re-resolution must not lose a usable cached URL
        // (playback continuity beats config purity in the resolution path).
        SourceFixture fx = new SourceFixture(invalidClientIdBody());
        fx.configure("stale-but-valid-for-playback");
        Track queued = new Track("jamendo:1896504", Track.SOURCE_JAMENDO, "T", "A",
                null, 0L, null, null,
                "https://prod-1.storage.jamendo.com/?trackid=1896504&format=mp32", null, 0L);
        assertEquals("https://prod-1.storage.jamendo.com/?trackid=1896504&format=mp32",
                fx.source.resolveStreamUri(queued));
    }

    @Test
    public void resolveStreamUriRejectsNonJamendoIds() throws Exception {
        SourceFixture fx = new SourceFixture();
        fx.configure("cfg");
        Track alien = new Track("ytm:abc", Track.SOURCE_YTM, "T", "A",
                null, 0L, null, null, null, null, 0L);
        try {
            fx.source.resolveStreamUri(alien);
            fail("expected SourceException");
        } catch (SourceException e) {
            assertEquals(SourceException.Kind.UNSUPPORTED, e.kind);
        }
        assertEquals("no HTTP call may be made for non-Jamendo ids", 0, fx.http.calls);
    }

    @Test
    public void resolveStreamUriUnconfiguredFailsWithConfigurationRequired() throws Exception {
        SourceFixture fx = new SourceFixture(singleTrackBody("1", "https://x.example/a.mp3"));
        Track queued = new Track("jamendo:1", Track.SOURCE_JAMENDO, "T", "A",
                null, 0L, null, null, null, null, 0L);
        try {
            fx.source.resolveStreamUri(queued);
            fail("expected SourceException");
        } catch (SourceException e) {
            assertEquals(SourceException.Kind.CONFIGURATION_REQUIRED, e.kind);
        }
    }

    // ---------------------------------------------------------------- hygiene

    @Test
    public void sanitizeMasksClientIdsInMessages() throws Exception {
        JamendoClient client = new JamendoClient(new OkHttpClient(), () -> "secret-id-777");
        assertEquals("code 5 → ••• ", "Jamendo error: •••", client.sanitize(
                "Jamendo error: secret-id-777", "secret-id-777"));
        assertEquals("unrelated ids untouched", "Jamendo error: other", client.sanitize(
                "Jamendo error: other", "secret-id-777"));
        assertEquals("null-safe", "", client.sanitize(null, "secret-id-777"));
    }

    @Test
    public void clampLimitRespectsDocumentedBounds() {
        assertEquals(1, JamendoClient.clampLimit(0));
        assertEquals(1, JamendoClient.clampLimit(-5));
        assertEquals(10, JamendoClient.clampLimit(10));
        assertEquals(200, JamendoClient.clampLimit(500)); // docs: max 200
    }

    @Test
    public void effectiveClientIdIsMaskedOrAbsent() throws Exception {
        SourceFixture fx = new SourceFixture(realSearchBody());
        assertNull(fx.source.effectiveClientId());
        fx.configure("abcdefgh");
        assertEquals("••••efgh", fx.source.effectiveClientId());
    }

    @Test
    public void sourceIdentityIsStable() {
        SourceFixture fx = new SourceFixture();
        assertEquals(Track.SOURCE_JAMENDO, fx.source.id());
        assertEquals("jamendo", fx.source.id());
        assertEquals("Jamendo", fx.source.displayName());
        assertTrue(fx.source.isRemote());
        assertTrue(fx.source.supportsStreamResolution());
    }
}
