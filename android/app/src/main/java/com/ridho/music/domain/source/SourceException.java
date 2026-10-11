package com.ridho.music.domain.source;

/**
 * Typed errors returned by music sources. The UI maps these to clear, actionable
 * messages; nothing here is ever silently swallowed.
 */
public class SourceException extends Exception {

    public enum Kind {
        /** Connectivity failure or timeout. */
        NETWORK,
        /** The requested media exists but is not legitimately available for playback. */
        UNAVAILABLE,
        /** The provider cannot fulfil this operation at all. */
        UNSUPPORTED,
        /** The requested media does not exist. */
        NOT_FOUND,
        /** The provider responded with malformed data. */
        PARSE
    }

    public final Kind kind;

    public SourceException(Kind kind, String message) {
        super(message);
        this.kind = kind;
    }

    public SourceException(Kind kind, String message, Throwable cause) {
        super(message, cause);
        this.kind = kind;
    }
}
