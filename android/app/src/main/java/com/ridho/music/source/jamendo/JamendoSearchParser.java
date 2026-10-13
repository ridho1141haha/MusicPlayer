package com.ridho.music.source.jamendo;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.ridho.music.domain.model.Track;
import com.ridho.music.domain.source.SourceException;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Parses Jamendo v3.0 {@code /tracks/} result documents into {@link Track}s.
 *
 * <p>Pure org.json + the domain model — no Android framework calls — so the JVM
 * unit-test suite can exercise it against a real (client-id-masked) API capture.</p>
 *
 * <p>Field mapping follows the official documentation (verified 2026-10-12):
 * results carry {@code id, name, duration (seconds), artist_name, album_name,
 * album_image, image, audio, audiodownload, audiodownload_allowed[, licenses]}.
 * Documented quirks handled here:</p>
 * <ul>
 *   <li>Singles have <b>empty</b> {@code album_name}/{@code album_image} — mapped
 *       to null, never an empty-string album title.</li>
 *   <li>Only {@code https://} artwork and audio URLs are accepted.</li>
 *   <li>{@code duration} is seconds → milliseconds.</li>
 *   <li>Entries missing an id are skipped rather than crashing the whole search.</li>
 * </ul>
 */
public final class JamendoSearchParser {

    public static final String ID_PREFIX = "jamendo:";

    private JamendoSearchParser() {
    }

    /**
     * Parses the {@code results} array of a successful (envelope-validated) response.
     * Returns one flat list — the caller wraps it in a single titled section.
     *
     * @throws SourceException Kind.PARSE when the document has no results array
     *                         (structural change), per the MusicSource contract.
     */
    @NonNull
    public static List<Track> parseTracks(@NonNull JSONObject response) throws SourceException {
        JSONArray results = response.optJSONArray("results");
        if (results == null) {
            throw new SourceException(SourceException.Kind.PARSE,
                    "Jamendo response has no results array (API may have changed).");
        }
        List<Track> out = new ArrayList<>(results.length());
        for (int i = 0; i < results.length(); i++) {
            JSONObject t = results.optJSONObject(i);
            if (t == null) continue;
            String id = t.optString("id", "");
            if (id.isEmpty()) continue; // cannot be queued or re-resolved without an id
            String[] license = licenseFromCcurl(t.optString("license_ccurl", ""));
            out.add(new Track(
                    ID_PREFIX + id,
                    Track.SOURCE_JAMENDO,
                    t.optString("name", ""),
                    t.optString("artist_name", ""),
                    emptyToNull(t.optString("album_name", "")),
                    t.optLong("duration", 0L) * 1000L,
                    null,
                    httpsOnly(t.optString("image", "")),
                    httpsOnly(t.optString("audio", "")),
                    null,
                    license[0],
                    license[1],
                    System.currentTimeMillis()));
        }
        return out;
    }

    /** Extracts the raw numeric Jamendo track id from a Track id, or null. */
    @Nullable
    public static String stripPrefix(@Nullable String id) {
        if (id == null) return null;
        if (id.startsWith(ID_PREFIX)) return id.substring(ID_PREFIX.length());
        return null;
    }

    @Nullable
    static String emptyToNull(@Nullable String s) {
        return s == null || s.trim().isEmpty() ? null : s;
    }

    @Nullable
    static String httpsOnly(@Nullable String url) {
        if (url == null || !url.startsWith("https://")) return null;
        return url;
    }

    /**
     * Derives attribution metadata from the documented {@code license_ccurl} field
     * (e.g. http://creativecommons.org/licenses/by-nc-nd/3.0/ →
     * {"CC BY-NC-ND 3.0", "https://creativecommons.org/licenses/by-nc-nd/3.0/"}).
     * Returns {null, null} when the field is absent or unrecognized.
     */
    @NonNull
    static String[] licenseFromCcurl(@Nullable String ccurl) {
        if (ccurl == null || ccurl.isEmpty()) return new String[]{null, null};
        String code = null;
        String version = null;
        java.util.regex.Matcher m = CC_URL_PATTERN.matcher(ccurl);
        if (m.matches()) {
            code = m.group(1);
            version = m.group(2);
        }
        if (code == null) return new String[]{null, null};
        String name = "CC " + code.toUpperCase(java.util.Locale.US);
        if (version != null && !version.isEmpty()) name += " " + version;
        String deed = "https://creativecommons.org/licenses/" + code
                + (version == null || version.isEmpty() ? "/" : "/" + version + "/");
        return new String[]{name, deed};
    }

    private static final java.util.regex.Pattern CC_URL_PATTERN = java.util.regex.Pattern.compile(
            "https?://creativecommons\\.org/licenses/([a-z\\-]+)/([0-9.]+)/?\\z");
}
