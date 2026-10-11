package com.ridho.music.lyrics;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.ridho.music.domain.model.Track;

/**
 * Serves lyrics embedded in the track metadata (ID3 USLT / LRC sidecar content
 * extracted during the local scan, or provider-supplied text).
 */
public class EmbeddedLyricsProvider implements LyricsProvider {

    @Nullable
    @Override
    public String lyricsFor(@NonNull Track track) {
        String lyrics = track.lyrics;
        if (lyrics == null || lyrics.trim().isEmpty()) return null;
        return lyrics;
    }
}
