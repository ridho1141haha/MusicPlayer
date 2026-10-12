package com.ridho.music.source.jamendo;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.ridho.music.domain.source.SourceException;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.net.URLEncoder;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Minimal HTTPS client for the <strong>official</strong> Jamendo API v3.0
 * (https://developer.jamendo.com/v3.0/docs — verified 2026-10-12).
 *
 * <p>Compliance notes:
 * <ul>
 *   <li>Read methods are plain HTTPS GETs authenticated by the application's
 *       {@code client_id} (Jamendo's documented "app authentication" model —
 *       no OAuth, no client secret, no user data).</li>
 *   <li>HTTPS only; certificate validation is never disabled.</li>
 *   <li>The client id is application configuration (it travels in every request
 *       URL by design), but Ridho Music still treats it as credential-adjacent:
 *       it is never written to logs and never appears in exception messages —
 *       {@link #sanitize(String)} strips it defensively.</li>
 *   <li>Only public read endpoints are used; nothing is downloaded, nothing is
 *       uploaded and no DRM or access control is ever bypassed.</li>
 * </ul>
 *
 * <p>Credentials resolve at REQUEST time through the shared
 * {@link JamendoSource.ClientIdProvider} (runtime setting → build-time default →
 * null), so changing the id in Settings takes effect immediately without
 * recreating this object. An unresolved id fails fast with
 * {@link SourceException.Kind#CONFIGURATION_REQUIRED}.</p>
 *
 * <p>Response envelope per the official docs:
 * {@code headers: {status, code, error_message, warnings, results_count}} with
 * {@code results: [...]}. Note that Jamendo returns <b>HTTP 200 even for API
 * errors</b> (e.g. an invalid client id answers 200 with
 * {@code status:"failed", code:5}) — so the envelope, not the HTTP code, is the
 * source of truth. This was verified against the live API on 2026-10-12.</p>
 */
public class JamendoClient {

    static final String BASE_URL = "https://api.jamendo.com/v3.0/";

    /** Query params documented on developer.jamendo.com/v3.0/tracks (verified 2026-10-12). */
    static final String AUDIO_FORMAT = "mp32";      // VBR, good quality (mp31 would be 96 kbps)
    static final String IMAGE_SIZE = "300";         // artwork px (enum value from the docs)
    static final String INCLUDE = "licenses";       // CC attribution metadata
    static final String TYPE = "single albumtrack"; // include singles too (default is albumtracks only)

    /** Jamendo's "invalid credential" response code (observed live 2026-10-12: code 5). */
    static final int CODE_INVALID_CLIENT_ID = 5;

    private final OkHttpClient http;
    @NonNull private final JamendoSource.ClientIdProvider clientIdProvider;

    /** @param clientIdProvider resolves the effective client id at request time. */
    public JamendoClient(@NonNull JamendoSource.ClientIdProvider clientIdProvider) {
        this(new OkHttpClient.Builder()
                        .connectTimeout(10, TimeUnit.SECONDS)
                        .readTimeout(15, TimeUnit.SECONDS)
                        .callTimeout(25, TimeUnit.SECONDS)
                        .build(),
                clientIdProvider);
    }

    /** Visible for tests: inject a prebuilt OkHttpClient. */
    JamendoClient(OkHttpClient http, @NonNull JamendoSource.ClientIdProvider clientIdProvider) {
        this.http = http;
        this.clientIdProvider = clientIdProvider;
    }

    /** The client id that would be used right now, or null when unconfigured. */
    @Nullable
    public String currentClientId() {
        return normalized(clientIdProvider.get());
    }

    /** Whether requests can be attempted at all. */
    public boolean isConfigured() {
        return currentClientId() != null;
    }

    /**
     * GETs {@code path} with {@code params} plus the documented auth/format params.
     * Blocking; validates the envelope and throws typed {@link SourceException}s.
     */
    @NonNull
    public JSONObject get(@NonNull String path, @NonNull Map<String, String> params)
            throws SourceException {
        String clientId = currentClientId();
        if (clientId == null) {
            throw new SourceException(SourceException.Kind.CONFIGURATION_REQUIRED,
                    "Jamendo is not configured. Add your free client ID in Settings → Sources.");
        }
        StringBuilder url = new StringBuilder(BASE_URL).append(path).append('/');
        url.append("?client_id=").append(encode(clientId));
        for (Map.Entry<String, String> e : params.entrySet()) {
            url.append('&').append(encode(e.getKey())).append('=').append(encode(e.getValue()));
        }

        Request request = new Request.Builder()
                .url(url.toString())
                .header("User-Agent", "RidhoMusic/1.0 (Android; official Jamendo API v3.0)")
                .get()
                .build();

        try (Response response = http.newCall(request).execute()) {
            ResponseBody body = response.body();
            if (body == null) {
                throw new SourceException(SourceException.Kind.PARSE, "Empty response from Jamendo.");
            }
            String text = body.string();
            if (!response.isSuccessful()) {
                throw new SourceException(SourceException.Kind.NETWORK,
                        "Jamendo responded with HTTP " + response.code() + ".");
            }
            JSONObject json = new JSONObject(text);
            return validateEnvelope(json, clientId);
        } catch (IOException e) {
            throw new SourceException(SourceException.Kind.NETWORK,
                    "Could not reach Jamendo. Check your connection.", e);
        } catch (JSONException e) {
            throw new SourceException(SourceException.Kind.PARSE,
                    "Jamendo returned unexpected data (API may have changed).", e);
        }
    }

    /** Official track search: free-text across track/album/artist names and tags. */
    @NonNull
    public JSONObject searchTracks(@NonNull String query, int limit) throws SourceException {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("format", "json");
        params.put("search", query);
        params.put("limit", String.valueOf(clampLimit(limit)));
        params.put("audioformat", AUDIO_FORMAT);
        params.put("imagesize", IMAGE_SIZE);
        params.put("include", INCLUDE);
        params.put("type", TYPE);
        return get("tracks", params);
    }

    /** Re-resolution lookup by track id (queue restore / one-shot recovery). */
    @NonNull
    public JSONObject tracksById(@NonNull String trackId) throws SourceException {
        Map<String, String> params = new LinkedHashMap<>();
        params.put("format", "json");
        params.put("id", trackId);
        params.put("limit", "1");
        params.put("audioformat", AUDIO_FORMAT);
        return get("tracks", params);
    }

    // ---------------------------------------------------------------- envelope

    /** Validates the documented response envelope; maps failed statuses to typed errors. */
    @NonNull
    private JSONObject validateEnvelope(@NonNull JSONObject json, @NonNull String clientId)
            throws SourceException {
        JSONObject headers = json.optJSONObject("headers");
        if (headers == null) {
            throw new SourceException(SourceException.Kind.PARSE,
                    "Jamendo response missing its headers block (API may have changed).");
        }
        String status = headers.optString("status", "");
        if ("success".equals(status)) return json;

        int code = headers.optInt("code", -1);
        String message = sanitize(headers.optString("error_message", "Unknown Jamendo error"), clientId);
        if (code == CODE_INVALID_CLIENT_ID) {
            throw new SourceException(SourceException.Kind.CONFIGURATION_REQUIRED,
                    "Jamendo rejected the client ID (invalid or revoked). "
                            + "Update it in Settings → Sources.");
        }
        // Unknown failure codes are surfaced verbatim (sanitized) — never guessed.
        throw new SourceException(SourceException.Kind.NETWORK,
                "Jamendo API error (code " + code + "): " + message);
    }

    /** Strips the client id from any string destined for UI/logs (defense in depth). */
    @NonNull
    String sanitize(@Nullable String message, @Nullable String clientId) {
        if (message == null) return "";
        if (clientId != null && !clientId.isEmpty() && message.contains(clientId)) {
            message = message.replace(clientId, "•••");
        }
        return message;
    }

    static int clampLimit(int requested) {
        return Math.max(1, Math.min(requested, 200)); // docs: default 10, max 200
    }

    @Nullable
    private static String normalized(@Nullable String v) {
        if (v == null) return null;
        v = v.trim();
        return v.isEmpty() ? null : v;
    }

    private static String encode(String v) {
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
