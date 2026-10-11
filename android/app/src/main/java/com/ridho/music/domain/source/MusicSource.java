package com.ridho.music.domain.source;

import androidx.annotation.Nullable;

import com.ridho.music.domain.model.SearchSection;
import com.ridho.music.domain.model.Track;

import java.util.List;

/**
 * Contract every catalog/stream provider must implement. The playback engine
 * ({@code player} package) and the UI depend only on this interface — provider
 * specifics (e.g. YouTube Music's unofficial API) must never leak into them.
 *
 * <p>All methods are blocking and MUST be called from a background thread.
 * Implementations must use HTTPS, must not bypass authentication or access
 * controls, and must return typed {@link SourceException}s on failure.</p>
 */
public interface MusicSource {

    /** Stable identifier, e.g. {@code "local"} or {@code "ytm"}. */
    String id();

    /** Human-readable display name. */
    String displayName();

    /** True if this source serves remote media over the network. */
    boolean isRemote();

    /**
     * Search the catalog. Returns possibly empty list of titled sections.
     *
     * @throws SourceException with a typed kind on failure.
     */
    List<SearchSection> search(String query, int limitPerSection) throws SourceException;

    /**
     * Returns a playable URI for the track, or {@code null} when the source cannot
     * legitimately provide one. Never returns an HTML page URL or other non-media URL.
     *
     * @throws SourceException with a typed kind on failure.
     */
    @Nullable
    String resolveStreamUri(Track track) throws SourceException;

    /** Whether {@link #resolveStreamUri} is expected to succeed for remote tracks. */
    boolean supportsStreamResolution();

    /**
     * Last known error message for diagnostics screens, or {@code null} when healthy.
     * Implementations must not include tokens, cookies or full URLs in the message.
     */
    @Nullable
    String lastDiagnosticMessage();

    /** Release any resources (HTTP clients, executors). */
    void shutdown();
}
