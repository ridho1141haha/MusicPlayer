package com.ridho.music.source.audius;

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
 * <strong>Official</strong> Audius provider (AUDIUS-ANDROID-1) — an open, ad-free
 * catalog of creator-uploaded music served by the documented public API v1
 * (docs.audius.co; verified live 2026-10-13).
 *
 * <p>Design notes:</p>
 * <ul>
 *   <li>Implements the existing {@link MusicSource} contract so search UI and the
 *       Media3 playback engine need zero provider-specific code — the same
 *       pattern as the Jamendo source.</li>
 *   <li>Credentials: NONE exist. Attribution is the documented {@code app_name}
 *       query parameter ({@link AudiusClient#APP_NAME}); no key is required,
 *       stored or hidden.</li>
 *   <li>Unplayable entries are filtered at PARSE time (deleted, not streamable,
 *       not available, or paywalled) — see {@link AudiusSearchParser#isPlayable}.
 *       A track removed between search and play surfaces as a typed playback
 *       error via the engine, with the service's one-shot re-resolution path
 *       retrying through this same source.</li>
 *   <li>Streams: {@link #resolveStreamUri} returns the documented stream
 *       endpoint URL (stable media URL → 302 → 307 → signed CDN, range-capable,
 *       verified HTTP 206 with {@code audio/mpeg} on 2026-10-13). Media3/ExoPlayer
 *       follows the HTTPS redirects natively; no audio is ever downloaded or
 *       cached.</li>
 *   <li>Host discovery + failover live in {@link AudiusClient} (registry
 *       {@code api.audius.co} → cached host list → fallback discovery node).</li>
 * </ul>
 */
public class AudiusSource implements MusicSource {

    static final String SECTION_TITLE = "Audius";

    private final AudiusClient client;
    private volatile String lastDiagnostic;

    public AudiusSource(AudiusClient client) {
        this.client = client;
    }

    // ---------------------------------------------------------------- MusicSource

    @Override
    public String id() {
        return Track.SOURCE_AUDIUS;
    }

    @Override
    public String displayName() {
        return "Audius";
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
            List<Track> tracks = AudiusSearchParser.parseTracks(response);
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
        String audiusId = AudiusSearchParser.stripPrefix(track == null ? null : track.id);
        if (audiusId == null || audiusId.trim().isEmpty()) {
            throw new SourceException(SourceException.Kind.UNSUPPORTED,
                    "Not an Audius track id; cannot resolve a stream.");
        }
        // The documented stream endpoint is itself the playable media URL —
        // ExoPlayer follows its redirect chain natively (no pre-flight round-trip).
        // Availability problems (removed/gated since search) surface as typed
        // playback errors through the engine's existing recovery path.
        return client.streamUrlFor(audiusId);
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
}
