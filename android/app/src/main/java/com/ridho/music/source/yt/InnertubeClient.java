package com.ridho.music.source.yt;

import androidx.annotation.NonNull;

import com.ridho.music.domain.source.SourceException;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.IOException;
import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.ResponseBody;

/**
 * Minimal HTTPS client for YouTube Music's <em>unofficial</em> InnerTube web API
 * (the same JSON endpoints the public web player calls without authentication).
 *
 * <p>Compliance notes:
 * <ul>
 *   <li>HTTPS only; certificate validation is never disabled.</li>
 *   <li>No accounts, cookies, tokens or private keys are sent or stored.</li>
 *   <li>No attempt is made to bypass authentication, geo-restrictions, DRM or
 *       paid features. If the API answers "LOGIN_REQUIRED" the app surfaces a
 *       typed UNAVAILABLE error instead of working around it.</li>
 * </ul>
 *
 * <p>This integration is unofficial and can break without notice — the README
 * documents this in detail.</p>
 */
public class InnertubeClient {

    private static final String BASE_URL = "https://music.youtube.com/youtubei/v1/";

    /** Public, unauthenticated "WEB_REMIX" client context used by the YT Music web player. */
    static final String CLIENT_CONTEXT_JSON =
            "{\"client\":{\"clientName\":\"WEB_REMIX\",\"clientVersion\":\"1.20241028.01.00\","
                    + "\"hl\":\"en\",\"gl\":\"US\"}}";

    /** Public, unauthenticated Android client context — historically returns direct audio URLs. */
    static final String ANDROID_CLIENT_CONTEXT_JSON =
            "{\"client\":{\"clientName\":\"ANDROID_MUSIC\",\"clientVersion\":\"6.42.32\","
                    + "\"androidSdkVersion\":30,\"hl\":\"en\",\"gl\":\"US\"}}";

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
        try {
            JSONObject context = new JSONObject(
                    androidClient ? ANDROID_CLIENT_CONTEXT_JSON : CLIENT_CONTEXT_JSON);
            body.putOpt("context", context);
        } catch (JSONException e) {
            throw new SourceException(SourceException.Kind.PARSE,
                    "Failed to build request body.", e);
        }

        Request request = new Request.Builder()
                .url(BASE_URL + endpoint + "?prettyPrint=false")
                .header("Content-Type", "application/json")
                .header("Origin", "https://music.youtube.com")
                .header("Referer", "https://music.youtube.com/")
                .header("User-Agent",
                        "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) "
                                + "Chrome/128.0.0.0 Safari/537.36")
                .post(RequestBody.create(body.toString(), JSON))
                .build();

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
