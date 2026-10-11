package com.ridho.music.lyrics;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.ridho.music.domain.model.Track;

/**
 * Lyrics resolution contract. Implementations must never perform network calls
 * on the main thread and must not fetch lyrics behind authentication walls.
 */
public interface LyricsProvider {

    /** Returns raw lyrics text (plain or LRC), or null when unavailable. */
    @Nullable
    String lyricsFor(@NonNull Track track);
}
