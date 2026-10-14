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
 * YouTube Music provider with multi-client stream resolution fallback:
 * <ol>
 *   <li><b>IOS (20.10.4)</b> and <b>ANDROID_VR (1.61.48)</b> native clients —
 *       return direct, un-ciphered MP4/Opus audio URLs ({@code itag 140} / {@code 251})
 *       without requiring JS {@code signatureCipher} deciphering.</li>
 *   <li><b>Authenticated ANDROID_VR & WEB_REMIX</b> (with fixed canonical {@code SAPISIDHASH}) —
 *       used as fallback when signed in.</li>
 * </ol>
 */
public class YouTubeMusicSource implements MusicSource {

    /** Supplies the stored session cookie header (null when signed out). */
    public interface CookieProvider {
        @Nullable String cookieHeader();
    }

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

        SourceException lastError = null;

        // 1. Try IOS 20.10.4 client first (returns direct itag=140 MP4 audio URLs,
        //    avoiding WEB_REMIX "Video unavailable" and signatureCipher-only responses).
        try {
            JSONObject iosResponse = client.postPlayerIos(videoId);
            String url = extractStreamUrl(iosResponse);
            lastDiagnostic = null;
            return url;
        } catch (SourceException e) {
            lastError = e;
        } catch (Exception ignored) {
        }

        // 2. Try ANDROID_VR (1.61.48) without cookies (returns direct itag=140/251 audio streams).
        try {
            JSONObject vrResponse = client.postPlayerAndroidVr(videoId, null);
            String url = extractStreamUrl(vrResponse);
            lastDiagnostic = null;
            return url;
        } catch (SourceException e) {
            lastError = e;
        } catch (Exception ignored) {
        }

        // 3. Try ANDROID_VR with user's authenticated session cookies + fixed SAPISIDHASH.
        try {
            JSONObject vrAuthResponse = client.postPlayerAndroidVr(videoId, cookie);
            String url = extractStreamUrl(vrAuthResponse);
            lastDiagnostic = null;
            return url;
        } catch (SourceException e) {
            lastError = e;
        } catch (Exception ignored) {
        }

        // 4. Fallback to authenticated WEB_REMIX with fixed canonical SAPISIDHASH.
        try {
            JSONObject body = new JSONObject()
                    .put("videoId", videoId)
                    .put("contentCheckOk", true)
                    .put("racyCheckOk", true);
            JSONObject webResponse = client.post("player", body, cookie);
            String url = extractStreamUrl(webResponse);
            lastDiagnostic = null;
            return url;
        } catch (SourceException e) {
            lastError = e;
            lastDiagnostic = e.getMessage();
            throw e;
        } catch (Exception e) {
            if (lastError != null) {
                lastDiagnostic = lastError.getMessage();
                throw lastError;
            }
            lastDiagnostic = "Stream resolution failed";
            throw new SourceException(SourceException.Kind.NETWORK,
                    "Could not contact the stream resolver.", e);
        }
    }

    @Override
    public boolean supportsStreamResolution() {
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
        if (streamingData == null) {
            throw new SourceException(SourceException.Kind.UNAVAILABLE,
                    "No stream data returned. YouTube's anti-bot measures likely block "
                            + "unauthenticated clients (see README).");
        }

        String bestUrl = pickBestAudioUrl(streamingData.optJSONArray("adaptiveFormats"));
        if (bestUrl != null) return bestUrl;

        bestUrl = pickBestAudioUrl(streamingData.optJSONArray("formats"));
        if (bestUrl != null) return bestUrl;

        if (streamingData.optJSONArray("adaptiveFormats") == null
                && streamingData.optJSONArray("formats") == null) {
            throw new SourceException(SourceException.Kind.UNAVAILABLE,
                    "No stream data returned. YouTube's anti-bot measures likely block "
                            + "unauthenticated clients (see README).");
        }

        throw new SourceException(SourceException.Kind.UNAVAILABLE,
                "Audio streams require signature deciphering, which Ridho Music "
                        + "does not implement (see README for alternatives).");
    }

    @Nullable
    private static String pickBestAudioUrl(@Nullable JSONArray formats) {
        if (formats == null) return null;
        String bestUrl = null;
        long bestBitrate = -1L;
        for (int i = 0; i < formats.length(); i++) {
            JSONObject f = formats.optJSONObject(i);
            if (f == null) continue;
            String mime = f.optString("mimeType", "");
            if (!mime.startsWith("audio/") && !mime.startsWith("video/mp4")) continue;
            boolean isAudioOnly = mime.startsWith("audio/");
            String url = f.optString("url", "");
            String cipher = f.optString("signatureCipher", "");
            if (url.isEmpty() || !cipher.isEmpty()) continue;
            if (!url.startsWith("https://")) continue;
            String itag = String.valueOf(f.opt("itag"));
            long bitrate = f.optLong("bitrate", 0L);
            if (PREFERRED_ITAG.equals(itag)) return url;
            if (isAudioOnly && bitrate > bestBitrate) {
                bestBitrate = bitrate;
                bestUrl = url;
            } else if (bestUrl == null) {
                bestUrl = url;
            }
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
