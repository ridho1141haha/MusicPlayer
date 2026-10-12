package com.ridho.music.source.jamendo;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.ridho.music.domain.model.SearchSection;
import com.ridho.music.domain.model.Track;
import com.ridho.music.domain.source.MusicSource;
import com.ridho.music.domain.source.SourceException;

import org.json.JSONObject;

import java.util.Collections;
import java.util.List;

/**
 * <strong>Official</strong> Jamendo provider (WEBLAB-22A) — a free, legal catalog
 * of independent Creative Commons music served by the documented v3.0 API.
 *
 * <p>Design notes:</p>
 * <ul>
 *   <li>Implements the existing {@link MusicSource} contract so search UI and the
 *       Media3 playback engine need zero provider-specific code.</li>
 *   <li>Credentials: the client id resolves at request time — runtime setting
 *       (user-entered in Settings) first, then the build-time
 *       {@code BuildConfig.JAMENDO_CLIENT_ID} default. When neither exists every
 *       call fails with {@link SourceException.Kind#CONFIGURATION_REQUIRED} and an
 *       actionable message — never a generic error.</li>
 *   <li>Streams: search responses already carry the official {@code audio} stream
 *       URL (a canonical, non-expiring CDN link — verified 2026-10-12), so search
 *       results are immediately playable with no second round-trip.
 *       {@link #resolveStreamUri} tries a FRESH lookup by track id first; when that
 *       lookup comes back empty (Jamendo's id-lookup is eventually consistent —
 *       observed live, the same query flips 0↔1 results within seconds) it falls
 *       back to the cached URL, because those URLs are stable rather than stale.</li>
 *   <li>No audio is ever downloaded or cached; playback streams progressively.</li>
 * </ul>
 */
public class JamendoSource implements MusicSource {

    /** Supplies the effective client id (runtime setting → build default → null). */
    public interface ClientIdProvider {
        @Nullable
        String get();
    }

    static final String SECTION_TITLE = "Jamendo";

    private final JamendoClient client;
    private volatile String lastDiagnostic;

    public JamendoSource(JamendoClient client) {
        this.client = client;
    }

    // ---------------------------------------------------------------- MusicSource

    @Override
    public String id() {
        return Track.SOURCE_JAMENDO;
    }

    @Override
    public String displayName() {
        return "Jamendo";
    }

    @Override
    public boolean isRemote() {
        return true;
    }

    @NonNull
    @Override
    public List<SearchSection> search(String query, int limitPerSection) throws SourceException {
        try {
            JSONObject response = client.searchTracks(query, limitPerSection);
            List<Track> tracks = JamendoSearchParser.parseTracks(response);
            lastDiagnostic = null;
            if (tracks.isEmpty()) return Collections.emptyList(); // honest NO_RESULTS, not an error
            return Collections.singletonList(new SearchSection(SECTION_TITLE, tracks));
        } catch (SourceException e) {
            lastDiagnostic = e.getMessage();
            throw e;
        }
    }

    @Nullable
    @Override
    public String resolveStreamUri(Track track) throws SourceException {
        String jamendoId = JamendoSearchParser.stripPrefix(track == null ? null : track.id);
        if (jamendoId == null) {
            throw new SourceException(SourceException.Kind.UNSUPPORTED,
                    "Not a Jamendo track id; cannot resolve a stream.");
        }
        try {
            // Preferred: a FRESH lookup by track id.
            JSONObject response = client.tracksById(jamendoId);
            List<Track> tracks = JamendoSearchParser.parseTracks(response);
            for (Track t : tracks) {
                if (t.id.equals(track.id) && t.hasResolvedStream()) return t.streamUri;
            }
            // Observed live (2026-10-12): Jamendo's id-lookup is eventually consistent —
            // the SAME query form can return 0 results seconds after the search returned
            // that very id. Search-time stream URLs are canonical and stable (verified),
            // so falling back to the cached URL is the RELIABLE path, not a stale risk.
            if (track.hasResolvedStream()) return track.streamUri;
            // Both paths failed: catalog no longer lists this id, or the artist
            // disabled streaming, or the id-lookup index lagged with nothing cached.
            lastDiagnostic = "Track not playable (no stream returned by Jamendo).";
            throw new SourceException(SourceException.Kind.UNAVAILABLE, lastDiagnostic);
        } catch (SourceException e) {
            // Network/parse failures during re-resolution must not lose a usable cached URL.
            if (track.hasResolvedStream()) return track.streamUri;
            lastDiagnostic = e.getMessage();
            throw e;
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

    /** The client id that would be used right now (diagnostics), or null. */
    @Nullable
    public String effectiveClientId() {
        String id = client.currentClientId();
        return id == null ? null : mask(id);
    }

    // ---------------------------------------------------------------- internals

    /** Never exposes the full id in UI: keeps the last 4 characters only. */
    @NonNull
    private static String mask(@NonNull String id) {
        return id.length() <= 4 ? "••••" : "••••" + id.substring(id.length() - 4);
    }
}
