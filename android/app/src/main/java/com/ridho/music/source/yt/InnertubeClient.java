package com.ridho.music.source.yt;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.ridho.music.domain.source.SourceException;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.Locale;
import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * HTTPS client for YouTube Music's InnerTube API with multi-client stream
 * resolution support (IOS 20.10.4, ANDROID_VR 1.61.48, and authenticated WEB_REMIX).
 */
public class InnertubeClient {

    private static final String BASE_URL_YTM = "https://music.youtube.com/youtubei/v1/";
    private static final String BASE_URL_YT = "https://www.youtube.com/youtubei/v1/";
    private static final String ORIGIN_YTM = "https://music.youtube.com";

    private static final String UA_WEB =
            "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) "
                    + "Chrome/131.0.0.0 Mobile Safari/537.36";

    /** iOS 20.10.4 client User-Agent (returns direct MP4/AAC streams without signatureCipher). */
    public static final String UA_IOS =
            "com.google.ios.youtube/20.10.4 (iPhone16,2; U; CPU iOS 18_3_2 like Mac OS X;)";

    /** Android VR (Oculus Quest 3) User-Agent (returns direct audio streams without PO token). */
    public static final String UA_ANDROID_VR =
            "com.google.android.apps.youtube.vr.oculus/1.61.48 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip";

    /** Public "WEB_REMIX" client context used by YT Music search and authenticated web requests. */
    static final String CLIENT_CONTEXT_JSON =
            "{"client":{"clientName":"WEB_REMIX","clientVersion":"1.20250310.01.00","
                    + ""hl":"en","gl":"ID"}}";

    /** Android VR context replacing stale ANDROID_MUSIC 6.42.32. */
    static final String ANDROID_CLIENT_CONTEXT_JSON =
            "{"client":{"clientName":"ANDROID_VR","clientVersion":"1.61.48","
                    + ""deviceMake":"Oculus","deviceModel":"Quest 3","
                    + ""androidSdkVersion":32,"osName":"Android","osVersion":"12L","
                    + ""hl":"en","gl":"ID"}}";

    private static final MediaType JSON = MediaType.parse("application/json; charset=utf-8");

    private final OkHttpClient client;

    public InnertubeClient() {
        this.client = new OkHttpClient.Builder()
                .connectTimeout(10, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .callTimeout(25, TimeUnit.SECONDS)
                .build();
    }

    /** POSTs {@code body} merged with the standard client context. Blocking. */
    @NonNull
    public JSONObject post(String endpoint, JSONObject body, boolean androidClient)
            throws SourceException {
        if (androidClient && "player".equals(endpoint)) {
            return executePlayerAndroidVr(body, null);
        }
        return execute(BASE_URL_YTM, endpoint, body, buildWebRemixContext(),
                UA_WEB, ORIGIN_YTM, "67", "1.20250310.01.00", null, null);
    }

    /**
     * POSTs with the user's own signed-in web session: the WEB_REMIX context
     * plus {@code Cookie} and canonical {@code SAPISIDHASH} headers.
     */
    @NonNull
    public JSONObject post(String endpoint, JSONObject body, @Nullable String cookieHeader)
            throws SourceException {
        String sapisid = SapisidHash.extractSapisid(cookieHeader);
        String authorization = sapisid == null ? null
                : SapisidHash.authorizationHeader(
                        sapisid, System.currentTimeMillis() / 1000L, ORIGIN_YTM);
        return execute(BASE_URL_YTM, endpoint, body, buildWebRemixContext(),
                UA_WEB, ORIGIN_YTM, "67", "1.20250310.01.00", cookieHeader, authorization);
    }

    /**
     * Resolves a track via the iOS 20.10.4 InnerTube client against youtube.com.
     * Note: iOS 19.x returns HTTP 400 FAILED_PRECONDITION; iOS 20.10.4 returns
     * direct playable MP4 audio URLs (itag 140). Web cookies must NOT be sent
     * on unauthenticated iOS client calls.
     */
    @NonNull
    public JSONObject postPlayerIos(String videoId) throws SourceException {
        try {
            JSONObject body = new JSONObject()
                    .put("videoId", videoId)
                    .put("contentCheckOk", true)
                    .put("racyCheckOk", true);
            return execute(BASE_URL_YT, "player", body, buildIosContext(),
                    UA_IOS, null, "5", "20.10.4", null, null);
        } catch (JSONException e) {
            throw new SourceException(SourceException.Kind.PARSE, "Failed to build iOS player request.", e);
        }
    }

    /**
     * Resolves a track via the ANDROID_VR (1.61.48) InnerTube client, which
     * returns direct un-ciphered audio URLs (itag 140 / 251) without requiring PO tokens.
     */
    @NonNull
    public JSONObject postPlayerAndroidVr(String videoId, @Nullable String cookieHeader)
            throws SourceException {
        try {
            JSONObject body = new JSONObject()
                    .put("videoId", videoId)
                    .put("contentCheckOk", true)
                    .put("racyCheckOk", true);
            return executePlayerAndroidVr(body, cookieHeader);
        } catch (JSONException e) {
            throw new SourceException(SourceException.Kind.PARSE, "Failed to build VR player request.", e);
        }
    }

    @NonNull
    private JSONObject executePlayerAndroidVr(JSONObject body, @Nullable String cookieHeader)
            throws SourceException {
        String sapisid = SapisidHash.extractSapisid(cookieHeader);
        String authorization = sapisid == null ? null
                : SapisidHash.authorizationHeader(
                        sapisid, System.currentTimeMillis() / 1000L, ORIGIN_YTM);
        return execute(BASE_URL_YT, "player", body, buildAndroidVrContext(),
                UA_ANDROID_VR, ORIGIN_YTM, "28", "1.61.48", cookieHeader, authorization);
    }

    @NonNull
    private static JSONObject buildWebRemixContext() throws SourceException {
        try {
            String gl = currentCountry();
            String hl = currentLanguage();
            JSONObject client = new JSONObject()
                    .put("clientName", "WEB_REMIX")
                    .put("clientVersion", "1.20250310.01.00")
                    .put("hl", hl)
                    .put("gl", gl);
            return new JSONObject().put("client", client);
        } catch (JSONException e) {
            throw new SourceException(SourceException.Kind.PARSE, "Failed to build WEB_REMIX context.", e);
        }
    }

    @NonNull
    private static JSONObject buildIosContext() throws SourceException {
        try {
            String gl = currentCountry();
            String hl = currentLanguage();
            JSONObject client = new JSONObject()
                    .put("clientName", "IOS")
                    .put("clientVersion", "20.10.4")
                    .put("deviceMake", "Apple")
                    .put("deviceModel", "iPhone16,2")
                    .put("osName", "iPhone")
                    .put("osVersion", "18.3.2.22D82")
                    .put("hl", hl)
                    .put("gl", gl);
            return new JSONObject().put("client", client);
        } catch (JSONException e) {
            throw new SourceException(SourceException.Kind.PARSE, "Failed to build IOS context.", e);
        }
    }

    @NonNull
    private static JSONObject buildAndroidVrContext() throws SourceException {
        try {
            String gl = currentCountry();
            String hl = currentLanguage();
            JSONObject client = new JSONObject()
                    .put("clientName", "ANDROID_VR")
                    .put("clientVersion", "1.61.48")
                    .put("deviceMake", "Oculus")
                    .put("deviceModel", "Quest 3")
                    .put("androidSdkVersion", 32)
                    .put("osName", "Android")
                    .put("osVersion", "12L")
                    .put("hl", hl)
                    .put("gl", gl);
            return new JSONObject().put("client", client);
        } catch (JSONException e) {
            throw new SourceException(SourceException.Kind.PARSE, "Failed to build ANDROID_VR context.", e);
        }
    }

    private static String currentCountry() {
        String c = Locale.getDefault().getCountry();
        return (c == null || c.length() != 2) ? "ID" : c.toUpperCase(Locale.ROOT);
    }

    private static String currentLanguage() {
        String l = Locale.getDefault().getLanguage();
        return (l == null || l.isEmpty()) ? "en" : l;
    }

    @NonNull
    private JSONObject execute(
            String baseUrl,
            String endpoint,
            JSONObject body,
            JSONObject context,
            String userAgent,
            @Nullable String origin,
            String clientNameId,
            String clientVersion,
            @Nullable String cookieHeader,
            @Nullable String authorization) throws SourceException {
        try {
            JSONObject payload = new JSONObject(body.toString());
            payload.put("context", context);
            if ("player".equals(endpoint) && !payload.has("playbackContext")) {
                JSONObject contentPlaybackContext = new JSONObject()
                        .put("html5Preference", "HTML5_PREF_WANTS")
                        .put("signatureTimestamp", 20192);
                payload.put("playbackContext", new JSONObject()
                        .put("contentPlaybackContext", contentPlaybackContext));
            }

            Request.Builder builder = new Request.Builder()
                    .url(baseUrl + endpoint + "?prettyPrint=false")
                    .header("Content-Type", "application/json")
                    .header("User-Agent", userAgent)
                    .header("X-Goog-Api-Format-Version", "2")
                    .header("X-YouTube-Client-Name", clientNameId)
                    .header("X-YouTube-Client-Version", clientVersion)
                    .post(RequestBody.create(payload.toString(), JSON));

            if (origin != null) {
                builder.header("Origin", origin);
                builder.header("Referer", origin + "/");
            }

            if (cookieHeader != null && !cookieHeader.isEmpty()) {
                builder.header("Cookie", cookieHeader);
                builder.header("X-Origin", ORIGIN_YTM);
                builder.header("X-Goog-AuthUser", "0");
                if (authorization != null) {
                    builder.header("Authorization", authorization);
                }
            }

            Request request = builder.build();

            try (Response response = client.newCall(request).execute()) {
                ResponseBody responseBody = response.body();
                if (responseBody == null) {
                    throw new SourceException(SourceException.Kind.PARSE,
                            "Empty response from catalog.");
                }
                String text = responseBody.string();
                if (response.code() == 404) {
                    throw new SourceException(SourceException.Kind.NOT_FOUND,
                            "Catalog endpoint not found.");
                }
                if (!response.isSuccessful()) {
                    throw new SourceException(SourceException.Kind.NETWORK,
                            "Catalog responded with HTTP " + response.code());
                }
                return new JSONObject(text);
            }
        } catch (IOException e) {
            throw new SourceException(SourceException.Kind.NETWORK,
                    "Could not reach the catalog. Check your connection.", e);
        } catch (JSONException e) {
            throw new SourceException(SourceException.Kind.PARSE,
                    "The catalog returned unexpected data (API may have changed).", e);
        }
    }

    /** Lightweight reachability probe used by the diagnostics screen. Blocking. */
    public boolean isReachable() {
        try {
            JSONObject body = new JSONObject().put("query", "test");
            post("search", body, false);
            return true;
        } catch (SourceException | JSONException e) {
            return false;
        }
    }

    public void shutdown() {
        client.dispatcher().executorService().shutdown();
        client.connectionPool().evictAll();
    }
}
