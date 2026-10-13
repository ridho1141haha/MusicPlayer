package com.ridho.music.source.audius;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.ridho.music.domain.model.Track;
import com.ridho.music.domain.source.SourceException;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Parses Audius v1 {@code /tracks/search} documents ({@code {"data":[…]}}) into
 * {@link Track}s.
 *
 * <p>Pure org.json + the domain model — no Android framework calls — so the JVM
 * unit-test suite can exercise it against a real API capture.</p>
 *
 * <p>Field mapping follows the live API (verified 2026-10-13): entries carry
 * {@code id (base58), title, duration (seconds), user.name, artwork{150x480,1000},
 * is_streamable, is_delete, is_available, access.stream}. Documented quirks
 * handled here:</p>
 * <ul>
 *   <li>Track ids are short base58 strings (e.g. {@code "OZR0Jg"}) — they are
 *       prefixed ({@value #ID_PREFIX}) so they can never collide with ids of
 *       other sources sharing the queue/database.</li>
 *   <li>Honest gating: entries that are deleted, flagged not-streamable, not
 *       available, or whose {@code access.stream} is anything but {@code true}
 *       (paywalled content ships an object there) are SKIPPED — a search result
 *       that can never play must not be offered, but one bad entry must not
 *       fail the whole search either.</li>
 *   <li>Artwork prefers {@code 480x480} (bandwidth/screen balance), then
 *       {@code 1000x1000}, then {@code 150x150}; only {@code https://} URLs are
 *       accepted.</li>
 *   <li>{@code duration} is seconds → milliseconds.</li>
 * </ul>
 */
public final class AudiusSearchParser {

    public static final String ID_PREFIX = "audius:";

    private AudiusSearchParser() {
    }

    /**
     * Parses the {@code data} array of a successful search response.
     * Returns one flat list — the caller wraps it in a single titled section.
     *
     * @throws SourceException Kind.PARSE when the document has no data array
     *                         (structural change), per the MusicSource contract.
     */
    @NonNull
    public static List<Track> parseTracks(@NonNull JSONObject response) throws SourceException {
        JSONArray data = response.optJSONArray("data");
        if (data == null) {
            throw new SourceException(SourceException.Kind.PARSE,
                    "Audius response has no data array (API may have changed).");
        }
        List<Track> out = new ArrayList<>(data.length());
        for (int i = 0; i < data.length(); i++) {
            JSONObject t = data.optJSONObject(i);
            if (t == null) continue;
            String id = t.optString("id", "");
            if (id.isEmpty()) continue; // cannot be queued or re-resolved without an id
            if (!isPlayable(t)) continue; // honest gating — never offer unplayable entries
            out.add(new Track(
                    ID_PREFIX + id,
                    Track.SOURCE_AUDIUS,
                    t.optString("title", ""),
                    artistOf(t),
                    null, // Audius search entries carry no album field we can rely on
                    t.optLong("duration", 0L) * 1000L,
                    null,
                    artworkOf(t),
                    null, // resolution happens via the documented stream endpoint at queue time
                    null,
                    null,
                    null,
                    System.currentTimeMillis()));
        }
        return out;
    }

    /** Extracts the raw Audius track id from a Track id, or null when foreign. */
    @Nullable
    public static String stripPrefix(@Nullable String id) {
        if (id == null) return null;
        if (id.startsWith(ID_PREFIX)) return id.substring(ID_PREFIX.length());
        return null;
    }

    /**
     * Honest playability gate: deleted / not-streamable / not-available entries
     * and gated content are excluded. Two gating representations are handled
     * (verified against the live API 2026-10-13): {@code access.stream} that is
     * anything but the boolean {@code true} (paywalled content ships an object
     * there), and a non-null {@code stream_conditions} field (usdc_purchase /
     * follow-gate / token-gate conditions).
     */
    static boolean isPlayable(@NonNull JSONObject t) {
        if (t.optBoolean("is_delete", false)) return false;
        if (!t.optBoolean("is_streamable", false)) return false;
        if (!t.optBoolean("is_available", true)) return false;
        // stream_conditions: absent or JSON null → free; any value → gated.
        // (org.json maps an explicit JSON null to JSONObject.NULL, so this must
        // use isNull(), not a Java-null comparison.)
        if (!t.isNull("stream_conditions")) return false; // purchase/gated content
        JSONObject access = t.optJSONObject("access");
        if (access != null) {
            Object stream = access.opt("stream");
            // Boolean false → blocked. Object (stream_conditions/paywall) → gated.
            if (stream != null && !(stream instanceof Boolean)) return false;
            if (Boolean.FALSE.equals(stream)) return false;
        }
        return true;
    }

    /** Artist display name: {@code user.name} with {@code user.handle} fallback. */
    @NonNull
    private static String artistOf(@NonNull JSONObject t) {
        JSONObject user = t.optJSONObject("user");
        if (user != null) {
            String name = user.optString("name", "");
            if (!name.trim().isEmpty()) return name;
            String handle = user.optString("handle", "");
            if (!handle.trim().isEmpty()) return handle;
        }
        return "";
    }

    /** Preferred artwork URL ({@code 480x480} → {@code 1000x1000} → {@code 150x150}), https-only. */
    @Nullable
    private static String artworkOf(@NonNull JSONObject t) {
        JSONObject artwork = t.optJSONObject("artwork");
        if (artwork == null) return null;
        String url = httpsOnly(artwork.optString("480x480", ""));
        if (url == null) url = httpsOnly(artwork.optString("1000x1000", ""));
        if (url == null) url = httpsOnly(artwork.optString("150x150", ""));
        return url;
    }

    @Nullable
    static String httpsOnly(@Nullable String url) {
        if (url == null || !url.startsWith("https://")) return null;
        return url;
    }
}
