package com.ridho.music.source.yt;

import androidx.annotation.Nullable;

import com.ridho.music.domain.model.SearchSection;
import com.ridho.music.domain.model.Track;
import com.ridho.music.domain.source.MusicSource;
import com.ridho.music.domain.source.SourceException;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * YouTube Music provider.
 *
 * <p><b>Search:</b> catalog search (songs, videos, albums, artists) through the
 * same unauthenticated JSON API the YouTube Music web player uses — mature and
 * stable.</p>
 *
 * <p><b>Stream playback (FOCUS-YTM-2, user-approved design change):</b> playback
 * uses the user's OWN signed-in session. The user logs into music.youtube.com in
 * an official WebView (password never seen by this app); the captured session is
 * stored encrypted (AndroidKeyStore) and replayed with the {@code Cookie} +
 * {@code SAPISIDHASH} headers the official web player itself sends. This is
 * authentication, not circumvention: no signature deciphering, no po-token
 * forging, no credential automation, no extraction/download — only what the
 * user's own account is served, streamed (never downloaded) via Media3.</p>
 *
 * <p><b>Measured reality (probe 2026-10-13, tool-results/ytm-diag/):</b> every
 * UNAUTHENTICATED public InnerTube client is gated server-side —
 * ANDROID_MUSIC/WEB → LOGIN_REQUIRED, TVHTML5 embed → "no longer supported".
 * Signed-out remote playback therefore fails with a typed
 * CONFIGURATION_REQUIRED error pointing at Settings sign-in. With a session,
 * the {@code player} endpoint returns plain {@code url} fields — the extractor
 * below still never touches {@code signatureCipher}.</p>
 *
 * <p><b>Honest limits:</b> some videos may still refuse playback even when
 * signed in (age/region/attestation) — surfaced as typed UNAVAILABLE, never
 * worked around. Personal use; third-party ToS risk is disclosed in the
 * sign-in dialog and README.</p>
 */
public class YouTubeMusicSource implements MusicSource {

    /** Supplies the stored session cookie header (null when signed out). */
    public interface CookieProvider {
        @Nullable String cookieHeader();
    }

    // Filter params documented in public InnerTube references; may stop working anytime.
    static final String PARAM_SONGS = "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D";
    static final String PARAM_VIDEOS = "EgWKAQIQAWoKEAkQChAFEAMQBA%3D%3D";

    private static final String PREFERRED_ITAG = "140"; // 128 kbps AAC (m4a)

    private final InnertubeClient client;
    @Nullable private final CookieProvider credentials;
    private volatile String lastDiagnostic;

    /** Signed-out variant (kept for tests); remote playback will require sign-in. */
    public YouTubeMusicSource(InnertubeClient client) {
        this(client, null);
    }

    public YouTubeMusicSource(InnertubeClient client, @Nullable CookieProvider credentials) {
        this.client = client;
        this.credentials = credentials;
    }

    // ---------------------------------------------------------------- MusicSource

    @Override
    public String id() {
        return Track.SOURCE_YTM;
    }

    @Override
    public String displayName() {
        return "YouTube Music (experimental)";
    }

    @Override
    public boolean isRemote() {
        return true;
    }

    @Override
    public List<SearchSection> search(String query, int limitPerSection) throws SourceException {
        try {
            JSONObject body = new JSONObject().put("query", query);
            JSONObject response = client.post("search", body, false);
            List<SearchSection> sections = YtMusicSearchParser.parse(response);
            if (sections == null) {
                lastDiagnostic = "Unexpected search response";
                throw new SourceException(SourceException.Kind.PARSE,
                        "The catalog returned unexpected data (API may have changed).");
            }
            lastDiagnostic = null;
            List<SearchSection> trimmed = new ArrayList<>(sections.size());
            for (SearchSection s : sections) {
                List<Track> limited = s.tracks.size() > limitPerSection
                        ? new ArrayList<>(s.tracks.subList(0, limitPerSection))
                        : s.tracks;
                trimmed.add(new SearchSection(s.title, limited));
            }
            return trimmed;
        } catch (SourceException e) {
            lastDiagnostic = e.getMessage();
            throw e;
        } catch (Exception e) {
            lastDiagnostic = "Search failed";
            throw new SourceException(SourceException.Kind.NETWORK, "Search failed.", e);
        }
    }

    @Nullable
    @Override
    public String resolveStreamUri(Track track) throws SourceException {
        String videoId = stripPrefix(track.id);
        if (videoId == null) {
            throw new SourceException(SourceException.Kind.UNSUPPORTED,
                    "Album and artist entries are catalog links, not playable tracks.");
        }
        String cookie = credentials == null ? null : credentials.cookieHeader();
        if (cookie == null || !SapisidHash.looksAuthenticated(cookie)) {
            lastDiagnostic = "Not signed in";
            throw new SourceException(SourceException.Kind.CONFIGURATION_REQUIRED,
                    "Sign in to YouTube Music in Settings → Music sources to enable playback.");
        }
        try {
            JSONObject body = new JSONObject()
                    .put("videoId", videoId)
                    .put("contentCheckOk", true)
                    .put("racyCheckOk", true);
            // Authenticated web-session request — same as the official web player.
            JSONObject response = client.post("player", body, cookie);
            return extractStreamUrl(response);
        } catch (SourceException e) {
            lastDiagnostic = e.getMessage();
            throw e;
        } catch (Exception e) {
            lastDiagnostic = "Stream resolution failed";
            throw new SourceException(SourceException.Kind.NETWORK,
                    "Could not contact the stream resolver.", e);
        }
    }

    @Override
    public boolean supportsStreamResolution() {
        // Best-effort only — the README explains why this may legitimately fail.
        return true;
    }

    @Nullable
    @Override
    public String lastDiagnosticMessage() {
        return lastDiagnostic;
    }

    @Override
    public void shutdown() {
        client.shutdown();
    }

    // ---------------------------------------------------------------- internals

    /** Visible for tests: extracts a playable URL from a player response, or throws typed errors. */
    String extractStreamUrl(JSONObject response) throws SourceException {
        JSONObject playability = response.optJSONObject("playabilityStatus");
        String status = playability == null ? null : playability.optString("status", null);
        if (status != null && !"OK".equals(status)) {
            String reason = playability.optString("reason", "Restricted content");
            if ("LOGIN_REQUIRED".equals(status)) {
                throw new SourceException(SourceException.Kind.UNAVAILABLE,
                        "This track requires sign-in or age verification; "
                                + "Ridho Music cannot bypass that.");
            }
            throw new SourceException(SourceException.Kind.UNAVAILABLE,
                    "Track not playable: " + reason);
        }

        JSONObject streamingData = response.optJSONObject("streamingData");
        JSONArray formats = streamingData == null
                ? null
                : streamingData.optJSONArray("adaptiveFormats");
        if (formats == null) {
            throw new SourceException(SourceException.Kind.UNAVAILABLE,
                    "No stream data returned. YouTube's anti-bot measures likely block "
                            + "unauthenticated clients (see README).");
        }

        String bestUrl = null;
        long bestBitrate = -1L;
        for (int i = 0; i < formats.length(); i++) {
            JSONObject f = formats.optJSONObject(i);
            if (f == null) continue;
            String mime = f.optString("mimeType", "");
            if (!mime.startsWith("audio/")) continue;
            // Only formats with a direct, un-ciphered URL are usable. If a format ships
            // a signatureCipher we deliberately do NOT decipher it.
            String url = f.optString("url", "");
            String cipher = f.optString("signatureCipher", "");
            if (url.isEmpty() || !cipher.isEmpty()) continue;
            if (!url.startsWith("https://")) continue;
            String itag = f.optString("itag", "");
            long bitrate = f.optLong("bitrate", 0L);
            if (PREFERRED_ITAG.equals(itag)) return url;
            if (bitrate > bestBitrate) {
                bestBitrate = bitrate;
                bestUrl = url;
            }
        }
        if (bestUrl == null) {
            throw new SourceException(SourceException.Kind.UNAVAILABLE,
                    "Audio streams require signature deciphering, which Ridho Music "
                            + "does not implement (see README for alternatives).");
        }
        return bestUrl;
    }

    @Nullable
    static String stripPrefix(String id) {
        if (id == null) return null;
        if (id.startsWith(YtMusicSearchParser.ID_PREFIX_SONG)) {
            return id.substring(YtMusicSearchParser.ID_PREFIX_SONG.length());
        }
        if (id.startsWith(YtMusicSearchParser.ID_PREFIX_ALBUM)
                || id.startsWith(YtMusicSearchParser.ID_PREFIX_ARTIST)) {
            return null;
        }
        return null;
    }
}
