package com.ridho.music.source.audius;

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

import okhttp3.Interceptor;
import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Protocol;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * AUDIUS-ANDROID-1 — JVM tests for {@link AudiusSource} + {@link AudiusClient}.
 *
 * <p>The network layer is faked with an OkHttp {@link Interceptor} (no extra test
 * dependency), so the REAL host-discovery, failover, request-building, parsing
 * and resolution code paths run end to end — only the socket is replaced. Canned
 * bodies come from a real API capture (public data; app_name attribution only)
 * plus a synthetic playability matrix.</p>
 */
public class AudiusSourceTest {

    private static final String REGISTRY_BODY =
            "{\"data\":[\"https://discoveryprovider.audius.co\",\"https://host2.audius.co\","
                    + "\"https://host3.audius.co\",\"https://host4.audius.co\"]}";

    // ---------------------------------------------------------------- fake http

    /**
     * Queues canned bodies in order; records every request URL. A non-200 code
     * can be forced for requests matching {@code failUrlsContaining}.
     */
    private static final class FakeAudiusHttp implements Interceptor {
        final List<String> bodies;
        final List<String> requestUrls = new java.util.ArrayList<>();
        String failUrlsContaining;
        int failWithCode;
        int calls = 0;

        FakeAudiusHttp(String... bodies) {
            this(null, 0, bodies);
        }

        FakeAudiusHttp(String failUrlsContaining, int failWithCode, String... bodies) {
            this.bodies = new java.util.ArrayList<>(java.util.Arrays.asList(bodies));
            this.failUrlsContaining = failUrlsContaining;
            this.failWithCode = failWithCode;
        }

        @Override
        public Response intercept(Chain chain) throws java.io.IOException {
            Request request = chain.request();
            requestUrls.add(request.url().toString());
            calls++;
            String body = bodies.size() > 0 ? bodies.remove(0) : "{\"data\":[]}";
            int code = (failUrlsContaining != null
                    && request.url().toString().contains(failUrlsContaining)) ? failWithCode : 200;
            return new Response.Builder()
                    .request(request)
                    .protocol(Protocol.HTTP_1_1)
                    .code(code)
                    .message(code == 200 ? "OK" : "ERR")
                    .body(ResponseBody.create(body, MediaType.parse("application/json")))
                    .build();
        }
    }

    private static final class SourceFixture {
        final AudiusSource source;
        final AudiusClient client;
        final FakeAudiusHttp http;

        SourceFixture(String... bodies) {
            this(null, 0, bodies);
        }

        SourceFixture(String failUrlsContaining, int failWithCode, String... bodies) {
            http = new FakeAudiusHttp(failUrlsContaining, failWithCode, bodies);
            OkHttpClient client = new OkHttpClient.Builder().addInterceptor(http).build();
            this.client = new AudiusClient(client);
            source = new AudiusSource(this.client);
        }
    }

    private static String readResource(String path) throws Exception {
        try (InputStream in = AudiusSourceTest.class.getResourceAsStream(path)) {
            if (in == null) throw new IllegalStateException("missing resource " + path);
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            return new String(out.toByteArray(), StandardCharsets.UTF_8);
        }
    }

    private static String realSearchBody() throws Exception {
        return readResource("/audius/search_real_2026-10-13_nadin-amizah.json");
    }

    private static String emptyBody() throws Exception {
        return readResource("/audius/search_empty.json");
    }

    private static String mixedPlayabilityBody() throws Exception {
        return readResource("/audius/search_mixed_playability.json");
    }

    // ---------------------------------------------------------------- search

    @Test
    public void searchResolvesRegistryThenSearchesDiscoveryHost() throws Exception {
        SourceFixture fx = new SourceFixture(REGISTRY_BODY, realSearchBody());
        List<SearchSection> sections = fx.source.search("nadin", 10);
        assertEquals(1, sections.size());
        assertEquals("Audius", sections.get(0).title);
        assertEquals("first request must be the official registry", 1,
                countUrls(fx.http.requestUrls, "https://api.audius.co"));
        assertTrue("search must go to a discovery host",
                fx.http.requestUrls.get(1).startsWith("https://discoveryprovider.audius.co/v1/tracks/search"));
    }

    @Test
    public void searchUrlCarriesDocumentedParameters() throws Exception {
        SourceFixture fx = new SourceFixture(REGISTRY_BODY, realSearchBody());
        fx.source.search("nadin amizah", 20);
        String url = fx.http.requestUrls.get(1);
        assertTrue("app_name attribution must be sent", url.contains("app_name=RidhoMusic"));
        assertTrue("query must be encoded", url.contains("query=nadin+amizah"));
        assertTrue("limit must be sent", url.contains("limit=20"));
    }

    @Test
    public void searchMapsRealCaptureToNormalizedTracks() throws Exception {
        SourceFixture fx = new SourceFixture(REGISTRY_BODY, realSearchBody());
        List<SearchSection> sections = fx.source.search("nadin", 10);
        List<Track> tracks = sections.get(0).tracks;
        assertEquals(3, tracks.size());
        Track first = tracks.get(0);
        assertTrue("ids must be namespaced to avoid cross-source collisions",
                first.id.startsWith("audius:") && first.id.length() > "audius:".length());
        assertEquals(Track.SOURCE_AUDIUS, first.sourceId);
        assertEquals("Nadin Amizah - Ah", first.title);
        assertEquals("Nadin", first.artist);
        assertEquals(232_000L, first.durationMs);
        assertTrue("artwork must be https", first.artworkUrl != null && first.artworkUrl.startsWith("https://"));
        assertNull("resolution happens at queue time via the stream endpoint", first.streamUri);
    }

    @Test
    public void searchEmptyResultsReturnEmptyList_notException() throws Exception {
        SourceFixture fx = new SourceFixture(REGISTRY_BODY, emptyBody());
        List<SearchSection> sections = fx.source.search("zzqqxx", 10);
        assertTrue("NO_RESULTS is an empty result, not an error", sections.isEmpty());
    }

    @Test
    public void searchFailureRecordsDiagnostic() throws Exception {
        // Registry OK, but EVERY discovery host fails the search → typed NETWORK error.
        SourceFixture fx = new SourceFixture("/v1/tracks/search", 500,
                REGISTRY_BODY, "{}", "{}", "{}");
        try {
            fx.source.search("nadin", 10);
            fail("expected SourceException");
        } catch (SourceException e) {
            assertEquals(SourceException.Kind.NETWORK, e.kind);
        }
        assertTrue(fx.source.lastDiagnosticMessage() != null
                && !fx.source.lastDiagnosticMessage().isEmpty());
        assertEquals("1 registry + 3 bounded host attempts", 4, fx.http.calls);
    }

    @Test
    public void registryFailureFallsBackToFallbackHost() throws Exception {
        // Registry answers 500 → the fallback discovery host (verified live) takes over.
        SourceFixture fx = new SourceFixture("https://api.audius.co", 500,
                "{\"data\":[]}");
        List<SearchSection> sections = fx.source.search("nadin", 10);
        assertTrue("fallback host must still serve search", sections.isEmpty());
        assertTrue("search must hit the fallback host",
                fx.http.requestUrls.get(1).startsWith("https://discoveryprovider.audius.co/"));
    }

    @Test
    public void malformedResponseMapsToParse() throws Exception {
        SourceFixture fx = new SourceFixture(REGISTRY_BODY, "{\"nope\":true}");
        try {
            fx.source.search("nadin", 10);
            fail("expected SourceException");
        } catch (SourceException e) {
            assertEquals(SourceException.Kind.PARSE, e.kind);
        }
    }

    @Test
    public void http404MapsToNotFound() throws Exception {
        // tracksById on a removed/gated track: registry OK, then one 404.
        SourceFixture fx = new SourceFixture(REGISTRY_BODY, "{}");
        // Force the 404 by exhausting bodies: 2nd request is the track lookup.
        fx.http.failUrlsContaining = "/v1/tracks/gone999";
        fx.http.failWithCode = 404;
        try {
            fx.client.tracksById("gone999");
            fail("expected SourceException");
        } catch (SourceException e) {
            assertEquals(SourceException.Kind.NOT_FOUND, e.kind);
        }
    }

    @Test
    public void hostCacheAvoidsRepeatedRegistryRoundTrips() throws Exception {
        SourceFixture fx = new SourceFixture(REGISTRY_BODY, realSearchBody(), emptyBody());
        fx.source.search("nadin", 10);
        fx.source.search("other", 10);
        assertEquals("registry must be consulted once within the TTL",
                1, countUrls(fx.http.requestUrls, "https://api.audius.co"));
    }

    // ---------------------------------------------------------------- playability gating

    @Test
    public void unplayableEntriesAreFilteredHonestly() throws Exception {
        SourceFixture fx = new SourceFixture(REGISTRY_BODY, mixedPlayabilityBody());
        List<SearchSection> sections = fx.source.search("mixed", 10);
        assertEquals("only the genuinely playable entry may be offered", 1, sections.get(0).tracks.size());
        assertEquals("audius:OZR0Jg", sections.get(0).tracks.get(0).id);
    }

    // ---------------------------------------------------------------- stream resolution

    @Test
    public void resolveStreamUriBuildsDocumentedEndpoint() throws Exception {
        SourceFixture fx = new SourceFixture(REGISTRY_BODY, realSearchBody());
        fx.source.search("nadin", 10); // prime the host cache like a real session
        int callsBefore = fx.http.calls;
        Track queued = new Track("audius:OZR0Jg", Track.SOURCE_AUDIUS, "Nadin Amizah - Ah",
                "Nadin", null, 232_000L, null, null, null, null, 0L);
        String uri = fx.source.resolveStreamUri(queued);
        assertEquals("https://discoveryprovider.audius.co/v1/tracks/OZR0Jg/stream?app_name=RidhoMusic",
                uri);
        assertEquals("resolution must be local — no extra HTTP round-trip", callsBefore, fx.http.calls);
    }

    @Test
    public void resolveStreamUriRejectsForeignIds() throws Exception {
        SourceFixture fx = new SourceFixture(REGISTRY_BODY, realSearchBody());
        Track alien = new Track("ytm:abc", Track.SOURCE_YTM, "T", "A",
                null, 0L, null, null, null, null, 0L);
        try {
            fx.source.resolveStreamUri(alien);
            fail("expected SourceException");
        } catch (SourceException e) {
            assertEquals(SourceException.Kind.UNSUPPORTED, e.kind);
        }
        assertEquals("no HTTP call may be made for foreign ids", 0, fx.http.calls);
    }

    // ---------------------------------------------------------------- hygiene / identity

    @Test
    public void clampLimitRespectsBounds() {
        assertEquals(1, AudiusClient.clampLimit(0));
        assertEquals(1, AudiusClient.clampLimit(-5));
        assertEquals(100, AudiusClient.clampLimit(100));
        assertEquals(100, AudiusClient.clampLimit(500));
    }

    @Test
    public void sourceIdentityIsStable() {
        SourceFixture fx = new SourceFixture();
        assertEquals(Track.SOURCE_AUDIUS, fx.source.id());
        assertEquals("audius", fx.source.id());
        assertEquals("Audius", fx.source.displayName());
        assertTrue(fx.source.isRemote());
        assertTrue(fx.source.supportsStreamResolution());
        assertNull("fresh source has no diagnostics", fx.source.lastDiagnosticMessage());
    }

    // ---------------------------------------------------------------- helpers

    private static int countUrls(List<String> urls, String prefix) {
        int n = 0;
        for (String u : urls) {
            if (u.startsWith(prefix)) n++;
        }
        return n;
    }
}
