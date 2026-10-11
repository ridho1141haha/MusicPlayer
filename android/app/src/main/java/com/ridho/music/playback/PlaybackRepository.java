package com.ridho.music.playback;

import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.google.common.util.concurrent.ListenableFuture;
import com.ridho.music.domain.model.Track;
import com.ridho.music.player.MediaItemConverter;
import com.ridho.music.player.PlaybackService;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.session.MediaController;
import androidx.media3.session.SessionToken;

/**
 * UI-facing playback facade. Owns the connection to the {@link PlaybackService}
 * through a MediaController and exposes a small, observable API.
 *
 * <p>The UI never touches ExoPlayer or MediaSession internals — this class is the
 * single seam between screens and the playback engine, which keeps the engine
 * independent from whichever music source is selected.</p>
 */
public class PlaybackRepository {

    private static final String TAG = "PlaybackRepository";

    /** Simple change notification; listeners re-read the snapshot getters. */
    public interface Listener {
        void onPlaybackChanged();
    }

    private final Context appContext;
    private final List<Listener> listeners = new CopyOnWriteArrayList<>();
    private final Object connectLock = new Object();

    @Nullable
    private volatile MediaController controller;
    @Nullable
    private ListenableFuture<MediaController> connectFuture;
    @Nullable
    private volatile Runnable pendingPlay;

    public PlaybackRepository(Context appContext) {
        this.appContext = appContext.getApplicationContext();
    }

    // ---------------------------------------------------------------- connection

    public void connect() {
        if (controller != null) return;
        synchronized (connectLock) {
            if (controller != null || connectFuture != null) return;
            SessionToken token = new SessionToken(appContext,
                    new ComponentName(appContext, PlaybackService.class));
            connectFuture = new MediaController.Builder(appContext, token).buildAsync();
            connectFuture.addListener(() -> {
                try {
                    MediaController c = connectFuture.get();
                    c.addListener(playerListener);
                    controller = c;
                    Runnable pending = pendingPlay;
                    pendingPlay = null;
                    if (pending != null) pending.run();
                    notifyListeners();
                } catch (Exception e) {
                    Log.w(TAG, "controller connect failed: " + e.getClass().getSimpleName());
                    connectFuture = null;
                    notifyListeners();
                }
            }, Runnable::run);
        }
    }

    public void disconnect() {
        // Keep the session alive across activity recreation; only detach listeners.
        MediaController c = controller;
        if (c != null) c.removeListener(playerListener);
    }

    public void addListener(Listener listener) {
        if (!listeners.contains(listener)) listeners.add(listener);
        connect();
    }

    public void removeListener(Listener listener) {
        listeners.remove(listener);
    }

    private void notifyListeners() {
        for (Listener l : listeners) l.onPlaybackChanged();
    }

    private final Player.Listener playerListener = new Player.Listener() {
        @Override
        public void onEvents(Player player, Player.Events events) {
            notifyListeners();
        }

        @Override
        public void onPlayerError(PlaybackException error) {
            notifyListeners();
        }
    };

    // ---------------------------------------------------------------- queue control

    /** Starts playback of {@code tracks} at {@code index}. Safe to call before connect. */
    public void play(List<Track> tracks, int index) {
        Runnable action = () -> {
            MediaController c = controller;
            if (c == null) return;
            c.setMediaItems(MediaItemConverter.toMediaItems(tracks), index, 0L);
            c.prepare();
            c.play();
        };
        MediaController c = controller;
        if (c == null) {
            pendingPlay = action;
            connect();
        } else {
            action.run();
        }
    }

    public void addToQueue(Track track) {
        MediaController c = controller;
        if (c == null) return;
        c.addMediaItem(c.getMediaItemCount(), MediaItemConverter.toMediaItem(track));
    }

    public void clearQueue() {
        MediaController c = controller;
        if (c == null) return;
        c.stop();
        c.clearMediaItems();
    }

    public void playPause() {
        MediaController c = controller;
        if (c == null) return;
        if (c.isPlaying()) {
            c.pause();
        } else {
            if (c.getPlaybackState() == Player.STATE_IDLE) c.prepare();
            c.play();
        }
    }

    public void next() {
        MediaController c = controller;
        if (c == null) return;
        c.seekToNextMediaItem();
        if (!c.isPlaying()) {
            if (c.getPlaybackState() == Player.STATE_IDLE) c.prepare();
            c.play();
        }
    }

    public void previous() {
        MediaController c = controller;
        if (c == null) return;
        if (c.getCurrentPosition() > 3_000L) {
            c.seekTo(0L);
        } else {
            c.seekToPreviousMediaItem();
        }
        if (!c.isPlaying()) {
            if (c.getPlaybackState() == Player.STATE_IDLE) c.prepare();
            c.play();
        }
    }

    public void seekTo(long positionMs) {
        MediaController c = controller;
        if (c == null) return;
        c.seekTo(positionMs);
    }

    public void seekBy(long deltaMs) {
        MediaController c = controller;
        if (c == null) return;
        c.seekTo(Math.max(0L, Math.min(c.getDuration(), c.getCurrentPosition() + deltaMs)));
    }

    public void setShuffleModeEnabled(boolean enabled) {
        MediaController c = controller;
        if (c == null) return;
        c.setShuffleModeEnabled(enabled);
    }

    public void setRepeatMode(int repeatMode) {
        MediaController c = controller;
        if (c == null) return;
        c.setRepeatMode(repeatMode);
    }

    public void removeFromQueue(int position) {
        MediaController c = controller;
        if (c == null) return;
        c.removeMediaItem(position);
    }

    /**
     * Pauses playback after {@code delayMs} (sleep timer). Pass 0 to cancel.
     * The timer lives in the playback service, so it survives UI process death.
     */
    public void setSleepTimerAfterMs(long delayMs) {
        MediaController c = controller;
        if (c == null) return;
        Bundle args = new Bundle();
        args.putLong(PlaybackService.EXTRA_SLEEP_DELAY_MS, Math.max(0L, delayMs));
        c.sendCustomCommand(
                new androidx.media3.session.SessionCommand(
                        PlaybackService.COMMAND_SET_SLEEP_TIMER, Bundle.EMPTY),
                args);
    }

    /** Sets playback speed (0.5–2.0). Persisted via SettingsRepository by callers. */
    public void setPlaybackSpeed(float speed) {
        MediaController c = controller;
        if (c == null) return;
        c.setPlaybackSpeed(speed);
    }

    public float playbackSpeed() {
        MediaController c = controller;
        if (c == null) return 1.0f;
        return c.getPlaybackParameters().speed;
    }

    public void skipToQueueItem(int position) {
        MediaController c = controller;
        if (c == null) return;
        c.seekToDefaultPosition(position);
        if (!c.isPlaying()) {
            if (c.getPlaybackState() == Player.STATE_IDLE) c.prepare();
            c.play();
        }
    }

    // ---------------------------------------------------------------- snapshot getters

    public boolean isConnected() {
        return controller != null;
    }

    public boolean isPlaying() {
        MediaController c = controller;
        return c != null && c.isPlaying();
    }

    public boolean hasQueue() {
        MediaController c = controller;
        return c != null && c.getMediaItemCount() > 0;
    }

    @Nullable
    public Track currentTrack() {
        MediaController c = controller;
        if (c == null) return null;
        return MediaItemConverter.toTrack(c.getCurrentMediaItem());
    }

    public long positionMs() {
        MediaController c = controller;
        return c == null ? 0L : c.getCurrentPosition();
    }

    public long bufferedMs() {
        MediaController c = controller;
        return c == null ? 0L : c.getBufferedPosition();
    }

    public long durationMs() {
        MediaController c = controller;
        if (c == null) return 0L;
        long d = c.getDuration();
        return d == androidx.media3.common.C.TIME_UNSET ? 0L : d;
    }

    public boolean isShuffleEnabled() {
        MediaController c = controller;
        return c != null && c.getShuffleModeEnabled();
    }

    @Player.RepeatMode
    public int repeatMode() {
        MediaController c = controller;
        return c == null ? Player.REPEAT_MODE_OFF : c.getRepeatMode();
    }

    public int queueSize() {
        MediaController c = controller;
        return c == null ? 0 : c.getMediaItemCount();
    }

    public int currentIndex() {
        MediaController c = controller;
        return c == null ? -1 : c.getCurrentMediaItemIndex();
    }

    /** Returns a decoded copy of the current queue (may be empty before connect). */
    @NonNull
    public List<Track> queueTracks() {
        MediaController c = controller;
        List<Track> out = new ArrayList<>();
        if (c == null) return out;
        for (int i = 0; i < c.getMediaItemCount(); i++) {
            Track t = MediaItemConverter.toTrack(c.getMediaItemAt(i));
            if (t != null) out.add(t);
        }
        return out;
    }

    /** Convenience: read title/artist straight from media metadata (works pre-decode). */
    @Nullable
    public MediaMetadata currentMediaMetadata() {
        MediaController c = controller;
        return c == null ? null : c.getMediaMetadata();
    }
}
