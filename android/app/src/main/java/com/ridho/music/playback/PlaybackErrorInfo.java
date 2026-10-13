package com.ridho.music.playback;

import androidx.annotation.Nullable;

/**
 * FOCUS-YTM-1 — Immutable snapshot of a playback failure, built for the UI.
 *
 * <p>Two failure shapes exist in this app and both used to be invisible:</p>
 * <ol>
 *   <li><b>Stream resolution failure</b> (the MusicSource could not hand out a
 *       playable URL — e.g. YouTube answering {@code LOGIN_REQUIRED}). The typed
 *       reason used to die inside the service callback. It now travels through
 *       {@link StreamErrorBus} and is enriched into this record.</li>
 *   <li><b>Player error</b> (ExoPlayer failed on an already-resolved URI, e.g.
 *       mid-stream network loss). The generic error code is recorded.</li>
 * </ol>
 *
 * <p>Pure Java (no Android types) so the shape and semantics are unit-testable.</p>
 */
public final class PlaybackErrorInfo {

    /** Track id the failure belongs to (best effort — may be unknown). */
    public final String trackId;
    /** Source id of the failing track ("ytm", "jamendo", "audius", "local", or "?"). */
    public final String sourceId;
    @Nullable public final String trackTitle;
    @Nullable public final String trackArtist;
    /**
     * Either a {@link com.ridho.music.domain.source.SourceException.Kind} name
     * (resolution failures) or {@link #KIND_PLAYER} / {@link #KIND_UNKNOWN}.
     */
    public final String kind;
    /** Human-readable diagnostic from the source, when available (never a URL). */
    @Nullable public final String sourceDiagnostic;
    /** Media3 error code name for player-level failures, when available. */
    @Nullable public final String errorCodeName;
    /** Wall-clock timestamp — the UI uses it to dedupe repeated notifications. */
    public final long atMs;

    public static final String KIND_PLAYER = "PLAYER";
    /** FOCUS-YTM-3: resolution never finished within the grace period (no answer at all). */
    public static final String KIND_TIMEOUT = "TIMEOUT";
    public static final String KIND_UNKNOWN = "?";

    public PlaybackErrorInfo(String trackId, String sourceId,
                             @Nullable String trackTitle, @Nullable String trackArtist,
                             String kind, @Nullable String sourceDiagnostic,
                             @Nullable String errorCodeName, long atMs) {
        this.trackId = trackId == null || trackId.isEmpty() ? KIND_UNKNOWN : trackId;
        this.sourceId = sourceId == null || sourceId.isEmpty() ? KIND_UNKNOWN : sourceId;
        this.trackTitle = trackTitle;
        this.trackArtist = trackArtist;
        this.kind = kind == null || kind.isEmpty() ? KIND_UNKNOWN : kind;
        this.sourceDiagnostic = sourceDiagnostic;
        this.errorCodeName = errorCodeName;
        this.atMs = atMs;
    }

    /** True when the info belongs to the given track (used to drop stale diagnostics). */
    public boolean belongsTo(String otherTrackId) {
        return trackId.equals(otherTrackId);
    }

    @Override
    public String toString() {
        // Never include URIs — diagnostics only (privacy rule mirrored from Track).
        return "PlaybackErrorInfo{" + sourceId + ", kind=" + kind
                + (sourceDiagnostic == null ? "" : ", diag=" + sourceDiagnostic)
                + (errorCodeName == null ? "" : ", code=" + errorCodeName) + "}";
    }
}
