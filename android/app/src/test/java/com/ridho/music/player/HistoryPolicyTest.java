package com.ridho.music.player;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import androidx.media3.common.Player;

import org.junit.Test;

/**
 * WEBLAB-22B regression tests for the history-recording policy.
 *
 * Bug being locked down: history used to be recorded on every non-repeat
 * media-item transition, so restoring a persisted queue at launch (paused,
 * reason PLAYLIST_CHANGED) wrote a "recently played" row for a track that was
 * never actually played. The policy must record only REAL playback:
 * isPlaying + STATE_READY + a new media item id.
 *
 * Player.STATE_READY / STATE_BUFFERING are compile-time int constants
 * (inlined by javac), so these tests run on the JVM without an Android runtime.
 */
public class HistoryPolicyTest {

    private static final int STATE_READY = Player.STATE_READY;             // 3
    private static final int STATE_BUFFERING = Player.STATE_BUFFERING;     // 2
    private static final int STATE_IDLE = Player.STATE_IDLE;               // 1

    @Test
    public void realPlayback_newItem_records() {
        // Track starts audibly rendering for the first time this session.
        assertTrue(HistoryPolicy.shouldRecord(true, STATE_READY, "track-1", null));
        // A different track after a previously recorded one also records.
        assertTrue(HistoryPolicy.shouldRecord(true, STATE_READY, "track-2", "track-1"));
    }

    @Test
    public void queueRestore_paused_doesNotRecord() {
        // Launch-time restore path: setMediaItems + prepare() while paused
        // (playWhenReady=false → isPlaying=false). Must NOT record history.
        assertFalse(HistoryPolicy.shouldRecord(false, STATE_READY, "track-1", null));
    }

    @Test
    public void buffering_doesNotRecord() {
        // Playback requested but audio not rendering yet — not "real playback".
        assertFalse(HistoryPolicy.shouldRecord(true, STATE_BUFFERING, "track-1", null));
        assertFalse(HistoryPolicy.shouldRecord(true, STATE_IDLE, "track-1", null));
    }

    @Test
    public void sameItem_doesNotRecordTwice() {
        // Repeat-one loops and pause/resume of the same track dedupe to one row
        // per service lifetime (repository 30 s rate limit remains a backstop).
        assertFalse(HistoryPolicy.shouldRecord(true, STATE_READY, "track-1", "track-1"));
    }

    @Test
    public void nullItem_doesNotRecord() {
        // Nothing loaded (cleared queue / idle service) — nothing to record.
        assertFalse(HistoryPolicy.shouldRecord(true, STATE_READY, null, null));
        assertFalse(HistoryPolicy.shouldRecord(false, STATE_IDLE, null, "track-1"));
    }
}
