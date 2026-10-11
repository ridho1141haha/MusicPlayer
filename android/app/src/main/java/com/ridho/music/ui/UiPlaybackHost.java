package com.ridho.music.ui;

import com.ridho.music.domain.model.Track;

import java.util.List;

/**
 * Implemented by {@link MainActivity} so fragments can start playback after the
 * POST_NOTIFICATIONS runtime permission flow (Android 13+) has been handled.
 */
public interface UiPlaybackHost {

    /** Requests notification permission if needed (non-blocking) then starts playback. */
    void playWithPermissions(List<Track> tracks, int startIndex);
}
