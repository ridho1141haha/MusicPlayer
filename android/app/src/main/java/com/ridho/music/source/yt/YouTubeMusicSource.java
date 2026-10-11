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
 * <strong>Experimental, unofficial</strong> YouTube Music provider.
 *
 * <p><b>What works:</b> catalog search (songs, videos, albums, artists) through the
 * same unauthenticated JSON API the YouTube Music web player uses.</p>
 *
 * <p><b>What may not work:</b> remote stream playback. Extracting a playable audio
 * URL from YouTube requires either the InnerTube <code>player</code> endpoint to
 * return direct URLs (increasingly gated behind attestation/po-token mechanisms)
 * or third-party signature deciphering (NewPipe Extractor, GPLv3). This class
 * implements a best-effort direct-URL attempt and fails with a typed
 * {@link SourceException.Kind#UNAVAILABLE} error when the platform refuses —
 * it never bypasses authentication, attestation, DRM or paid features.</p>
 *
 * <p>See README.md for the full integration analysis and legal notes.</p>
 */
public class YouTubeMusicSource implements MusicSource {

    // Filter params documented in public InnerTube references; may stop working anytime.
    static final String PARAM_SONGS = "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D";
    static final String PARAM_VIDEOS = "EgWKAQIQAWoKEAkQChAFEAMQBA%3D%3D";

    private static final String PREFERRED_ITAG = "140"; // 128 kbps AAC (m4a)

    private final InnertubeClient client;
    private volatile String lastDiagnostic;

    public YouTubeMusicSource(InnertubeClient client) {
        this.client = client;
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
        try {
            JSONObject body = new JSONObject()
                    .put("videoId", videoId)
                    .put("contentCheckOk", true)
                    .put("racyCheckOk", true);
            JSONObject response = client.post("player", body, true);
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
