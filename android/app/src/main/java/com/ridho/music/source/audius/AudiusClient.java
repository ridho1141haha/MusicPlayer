package com.ridho.music.source.audius;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.ridho.music.domain.source.SourceException;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Minimal HTTPS client for the <strong>official</strong> Audius discovery API
 * (docs.audius.co / API v1 — verified live 2026-10-13).
 *
 * <p>Compliance notes:
 * <ul>
 *   <li>Audius is an open, ad-free music platform whose documented public API
 *       requires NO credentials: applications identify themselves with the
 *       documented {@code app_name} query parameter (attribution, not a secret).
 *       Nothing is logged in, nothing is bypassed, nothing is downloaded to
 *       storage — playback streams progressively.</li>
 *   <li>HTTPS only; certificate validation is never disabled.</li>
 *   <li>Only public read endpoints are used: host registry
 *       ({@code GET https://api.audius.co}), track search
 *       ({@code /v1/tracks/search}) and the documented per-track stream
 *       endpoint ({@code /v1/tracks/{id}/stream}).</li>
 * </ul>
 *
 * <p>Host discovery: the registry answers {@code {"data":["https://host",…]}}.
 * Hosts are cached in memory for {@link #HOST_TTL_MS}; when the registry is
 * unreachable the client falls back to {@link #FALLBACK_HOST} (itself a live
 * discovery node, verified 2026-10-13). Search requests fail over across the
 * host list before giving up.</p>
 *
 * <p>Stream resolution is intentionally cheap: the documented stream endpoint
 * is itself a stable media URL (it answers 302 → creator node → 307 → signed
 * CDN with {@code audio/mpeg}; range requests verified HTTP 206 on 2026-10-13),
 * so {@link #streamUrlFor(String)} builds it without a network round-trip and
 * Media3/ExoPlayer follows the redirect chain natively.</p>
 */
public class AudiusClient {

    static final String REGISTRY_URL = "https://api.audius.co";
    static final String FALLBACK_HOST = "https://discoveryprovider.audius.co";
    /** The documented, non-secret attribution parameter (no credentials exist). */
    static final String APP_NAME = "RidhoMusic";
    private static final long HOST_TTL_MS = 10 * 60 * 1000L;
    private static final int MAX_HOSTS_TRIED = 3;

    private final OkHttpClient http;

    /** In-memory host cache (per instance — keeps tests isolated). */
    private final List<String> cachedHosts = new ArrayList<>();
    private volatile long hostsFetchedAt = 0L;

    public AudiusClient() {
        this(new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .callTimeout(25, TimeUnit.SECONDS)
                .build());
    }

    /** Visible for tests: inject a prebuilt OkHttpClient (interceptor-backed). */
    AudiusClient(OkHttpClient http) {
        this.http = http;
    }

    // ---------------------------------------------------------------- hosts

    /**
     * Resolves discovery hosts (cached). Never throws for registry failures —
     * falls back to {@link #FALLBACK_HOST} so search still works offline-registry.
     */
    @NonNull
    synchronized List<String> resolveHosts() {
        long now = System.currentTimeMillis();
        if (!cachedHosts.isEmpty() && now - hostsFetchedAt < HOST_TTL_MS) {
            return new ArrayList<>(cachedHosts);
        }
        List<String> hosts = new ArrayList<>();
        try {
            JSONObject json = getJson(REGISTRY_URL);
            JSONArray data = json.optJSONArray("data");
            if (data != null) {
                for (int i = 0; i < data.length() && hosts.size() < 10; i++) {
                    String h = data.optString(i, "");
                    if (h.startsWith("https://")) hosts.add(h);
                }
            }
        } catch (SourceException ignored) {
            // Registry unreachable / malformed — the fallback host takes over below.
        }
        if (hosts.isEmpty()) {
            hosts.add(FALLBACK_HOST);
        }
        cachedHosts.clear();
        cachedHosts.addAll(hosts);
        hostsFetchedAt = now;
        return new ArrayList<>(hosts);
    }

    /** For diagnostics: whether the current host list is only the fallback host. */
    synchronized boolean isUsingFallbackHostOnly() {
        return cachedHosts.size() == 1 && FALLBACK_HOST.equals(cachedHosts.get(0));
    }

    // ---------------------------------------------------------------- API calls

    /**
     * Track search on the official API. Tries hosts in order (bounded) and only
     * surfaces the last typed error when every host attempt fails.
     */
    @NonNull
    public JSONObject searchTracks(@NonNull String query, int limit) throws SourceException {
        String path = "/v1/tracks/search?app_name=" + encode(APP_NAME)
                + "&query=" + encode(query)
                + "&limit=" + clampLimit(limit);
        return fetchWithFailover(path);
    }

    /** Official track lookup by id (queue restore / diagnostics). */
    @NonNull
    public JSONObject tracksById(@NonNull String trackId) throws SourceException {
        return fetchWithFailover("/v1/tracks/" + encode(trackId)
                + "?app_name=" + encode(APP_NAME));
    }

    /**
     * Builds the documented stream endpoint URL for a track — a stable media
     * URL whose redirect chain (302 → 307 → signed CDN) Media3 follows
     * natively. No network round-trip happens here; nothing is embedded except
     * the {@code app_name} attribution.
     */
    @NonNull
    public String streamUrlFor(@NonNull String trackId) {
        return FALLBACK_HOST + "/v1/tracks/" + encode(trackId)
                + "/stream?app_name=" + encode(APP_NAME);
    }

    // ---------------------------------------------------------------- internals

    /** Fetches {@code path} against the host list with bounded failover. */
    @NonNull
    private JSONObject fetchWithFailover(@NonNull String path) throws SourceException {
        List<String> hosts = resolveHosts();
        SourceException lastError = null;
        int tried = 0;
        for (String host : hosts) {
            if (tried >= MAX_HOSTS_TRIED && lastError != null) break;
            tried++;
            try {
                return getJson(host + path);
            } catch (SourceException e) {
                lastError = e;
            }
        }
        throw lastError != null ? lastError
                : new SourceException(SourceException.Kind.NETWORK, "No Audius host reachable.");
    }

    /** Blocking GET returning the parsed JSON body; maps failures to typed errors. */
    @NonNull
    private JSONObject getJson(@NonNull String url) throws SourceException {
        Request request = new Request.Builder()
                .url(url)
                .header("User-Agent", "RidhoMusic/1.0 (Android; official Audius API v1)")
                .header("Accept", "application/json")
                .get()
                .build();
        try (Response response = http.newCall(request).execute()) {
            ResponseBody body = response.body();
            if (body == null) {
                throw new SourceException(SourceException.Kind.PARSE, "Empty response from Audius.");
            }
            String text = body.string();
            if (response.code() == 404) {
                throw new SourceException(SourceException.Kind.NOT_FOUND,
                        "Audius track not found (it may have been removed or gated).");
            }
            if (!response.isSuccessful()) {
                throw new SourceException(SourceException.Kind.NETWORK,
                        "Audius responded with HTTP " + response.code() + ".");
            }
            return new JSONObject(text);
        } catch (IOException e) {
            throw new SourceException(SourceException.Kind.NETWORK,
                    "Could not reach Audius. Check your connection.", e);
        } catch (JSONException e) {
            throw new SourceException(SourceException.Kind.PARSE,
                    "Audius returned unexpected data (API may have changed).", e);
        }
    }

    static int clampLimit(int requested) {
        return Math.max(1, Math.min(requested, 100));
    }

    @NonNull
    private static String encode(@NonNull String v) {
        // The Charset overload of URLEncoder.encode requires API 33; minSdk is 24.
        try {
            return URLEncoder.encode(v, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            throw new IllegalStateException("JVM without UTF-8 support", e);
        }
    }

    /** Release OkHttp resources. */
    public void shutdown() {
        http.dispatcher().executorService().shutdown();
        http.connectionPool().evictAll();
    }
}
