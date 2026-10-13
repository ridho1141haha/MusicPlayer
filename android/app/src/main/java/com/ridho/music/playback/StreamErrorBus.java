package com.ridho.music.playback;

import java.util.concurrent.atomic.AtomicReference;

/**
 * FOCUS-YTM-1 — Tiny in-process bus carrying the last stream-resolution failure
 * from the playback service to the UI.
 *
 * <p><b>Why it exists:</b> when a {@code MusicSource.resolveStreamUri()} call fails
 * (e.g. YouTube Music answering {@code LOGIN_REQUIRED}), the typed
 * {@code SourceException} previously died in two places: the
 * {@code onAddMediaItems} future and the one-shot recovery catch block. The UI
 * then showed nothing at all — the user only saw that "nothing happens".</p>
 *
 * <p><b>Why a static bus is safe here:</b> {@code PlaybackService} and the UI run
 * in the same process (the service reads {@code App.locator()} singletons
 * directly, same as every activity). The bus is an {@link AtomicReference}, so
 * cross-thread visibility is guaranteed.</p>
 *
 * <p><b>Lifecycle contract:</b> the service posts one entry per failed resolution;
 * the repository consumes it only when {@code trackId} matches the track that
 * just errored, so a stale entry can never be attributed to the wrong track.</p>
 */
public final class StreamErrorBus {

    private static final AtomicReference<PlaybackErrorInfo> LATEST = new AtomicReference<>();

    private StreamErrorBus() {
    }

    /** Posts a resolution failure. {@code diagnostic} must never contain a URL. */
    public static void post(String trackId, String sourceId, String kind, String diagnostic) {
        LATEST.set(new PlaybackErrorInfo(trackId, sourceId, null, null,
                kind, diagnostic, null, System.currentTimeMillis()));
    }

    /** Returns the last posted failure, or null. */
    public static PlaybackErrorInfo latest() {
        return LATEST.get();
    }

    /** Drops the current entry (used by tests and after successful recovery). */
    public static void clear() {
        LATEST.set(null);
    }
}
