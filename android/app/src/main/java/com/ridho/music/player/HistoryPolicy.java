package com.ridho.music.player;

import androidx.annotation.Nullable;
import androidx.media3.common.Player;

/**
 * WEBLAB-22B — decides when a track is written to playback history.
 *
 * <p>Policy: history records REAL playback only. All of the following must hold:
 * <ul>
 *   <li>the player is actually playing (not paused/buffering-stalled);</li>
 *   <li>buffering has completed ({@link Player#STATE_READY}) — the track is
 *       audibly rendering, not merely prepared;</li>
 *   <li>the current media item differs from the last one recorded — one track
 *       yields one history row per service lifetime, which also keeps
 *       repeat-one loops and pause/resume of the same track from spamming
 *       rows.</li>
 * </ul>
 *
 * <p>Root cause fixed (see CHANGELOG 1.2.3): history used to be written from
 * {@code onMediaItemTransition} for every non-repeat reason. Restoring a
 * persisted queue at launch fires that callback with reason
 * {@code MEDIA_ITEM_TRANSITION_REASON_PLAYLIST_CHANGED} while paused, so the
 * app recorded a "recently played" row for a track the user never played.
 *
 * <p>Pure logic, no Android framework calls at runtime — {@code Player.STATE_READY}
 * is a compile-time int constant (inlined), so this class is unit-testable on
 * the JVM. The {@link Player} reference documents intent only.
 */
public final class HistoryPolicy {

    private HistoryPolicy() {
    }

    /**
     * @param isPlaying              {@code player.isPlaying()}
     * @param playbackState          {@code player.getPlaybackState()}
     * @param currentMediaItemId     id of the current item ({@code Track.id});
     *                               {@code null} when nothing is loaded
     * @param lastRecordedMediaItemId id already written to history (null = none yet)
     * @return {@code true} exactly when this moment represents new, real playback
     */
    public static boolean shouldRecord(boolean isPlaying, int playbackState,
                                       @Nullable String currentMediaItemId,
                                       @Nullable String lastRecordedMediaItemId) {
        return isPlaying
                && playbackState == Player.STATE_READY
                && currentMediaItemId != null
                && !currentMediaItemId.equals(lastRecordedMediaItemId);
    }
}
