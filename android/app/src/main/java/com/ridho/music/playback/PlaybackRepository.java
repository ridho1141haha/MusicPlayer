package com.ridho.music.playback;

import android.content.ComponentName;
import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
 *
 * <p>FOCUS-YTM-1: playback failures are now observable. Two previously silent
 * paths are covered: (1) a failed {@code setMediaItems}/{@code addMediaItem}
 * future (stream resolution refused by the source — e.g. YouTube answering
 * {@code LOGIN_REQUIRED}) and (2) {@code onPlayerError} on an already-resolved
 * item. Both surface through {@link #lastPlaybackError()} as a typed,
 * dedupe-friendly snapshot instead of vanishing without feedback.</p>
 *
 * <p>FOCUS-YTM-3: device testing proved the failure could STILL vanish silently —
 * a refused resolution usually produces no further player events, so the bus
 * match (and the grace expiry) that only ran inside {@code onEvents} never
 * executed. The repository now runs an active watchdog: while a track is
 * pending resolution it polls the bus/queue every few hundred milliseconds and
 * guarantees a typed error (or a timeout error) reaches the UI no matter what
 * the session does. Every new play attempt also clears the bus so a stale
 * diagnostic can never short-circuit a fresh attempt.</p>
 */
public class PlaybackRepository {

    private static final String TAG = "PlaybackRepository";

    /** FOCUS-YTM-1: how long a play()/addToQueue() call watches for a bus failure. */
    private static final long RESOLUTION_GRACE_MS = 15_000L;
    /** FOCUS-YTM-3: watchdog poll cadence while a resolution is pending. */
    private static final long WATCHDOG_POLL_MS = 400L;

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

    /** Last playback failure snapshot (FOCUS-YTM-1); null while playback is healthy. */
    @Nullable
    private volatile PlaybackErrorInfo lastError;

    /**
     * FOCUS-YTM-1: track awaiting stream resolution after play()/addToQueue().
     * MediaController's set/add APIs are void, so a refused resolution (typed
     * SourceException inside the session's onAddMediaItems) never surfaces as a
     * controller future — instead the service posts to {@link StreamErrorBus} and
     * the listener below matches it against this pending track.
     */
    @Nullable
    private volatile Track pendingResolutionTrack;
    private volatile long pendingResolutionAtMs;

    /** FOCUS-YTM-3: main-thread poller that guarantees failure feedback lands. */
    private final Handler watchdogHandler = new Handler(Looper.getMainLooper());
    private final Runnable watchdogTick = this::runWatchdog;

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
            // Playback became healthy again — clear the stale error so banners vanish.
            if (player.getPlaybackState() == Player.STATE_READY && lastError != null) {
                lastError = null;
            }
            checkPendingResolution(player);
            notifyListeners();
        }

        @Override
        public void onPlayerError(PlaybackException error) {
            lastError = buildError(currentTrack(), error.getErrorCodeName());
            notifyListeners();
        }
    };

    /**
     * Fast path (player events): matches a posted {@link StreamErrorBus} entry
     * against the pending track. Kept alongside the FOCUS-YTM-3 watchdog — a
     * refused resolution usually fires no events, so the watchdog is what
     * actually guarantees feedback.
     */
    private void checkPendingResolution(Player player) {
        Track pending = pendingResolutionTrack;
        if (pending == null) return;
        PlaybackErrorInfo matched = matchBusForPending(pending);
        if (matched != null) {
            pendingResolutionTrack = null;
            lastError = matched;
            return;
        }
        if (player.getMediaItemCount() > 0 || player.isPlaying()) {
            pendingResolutionTrack = null; // resolved and queued fine
            return;
        }
        if (System.currentTimeMillis() - pendingResolutionAtMs > RESOLUTION_GRACE_MS) {
            pendingResolutionTrack = null;
            lastError = timeoutError(pending);
        }
    }

    /**
     * FOCUS-YTM-3 watchdog: while a resolution is pending, poll every
     * {@link #WATCHDOG_POLL_MS} until (a) the bus carries the typed failure,
     * (b) the queue accepted the item, or (c) the grace lapses — in every case
     * the UI hears the outcome. Runs on the main looper like all controller use.
     */
    private void runWatchdog() {
        Track pending = pendingResolutionTrack;
        if (pending == null) return;
        PlaybackErrorInfo matched = matchBusForPending(pending);
        if (matched != null) {
            pendingResolutionTrack = null;
            lastError = matched;
            notifyListeners();
            return;
        }
        MediaController c = controller;
        if (c != null && (c.getMediaItemCount() > 0 || c.isPlaying())) {
            pendingResolutionTrack = null; // resolved fine
            return;
        }
        if (System.currentTimeMillis() - pendingResolutionAtMs > RESOLUTION_GRACE_MS) {
            pendingResolutionTrack = null;
            lastError = timeoutError(pending);
            notifyListeners();
            return;
        }
        watchdogHandler.postDelayed(watchdogTick, WATCHDOG_POLL_MS);
    }

    private void startWatchdog() {
        watchdogHandler.removeCallbacks(watchdogTick);
        watchdogHandler.post(watchdogTick);
    }

    /** Bus entry adopted only when it belongs to the pending track (fresh by contract). */
    @Nullable
    private PlaybackErrorInfo matchBusForPending(Track pending) {
        PlaybackErrorInfo bus = StreamErrorBus.latest();
        if (bus == null || !bus.belongsTo(pending.id)) return null;
        return new PlaybackErrorInfo(pending.id, pending.sourceId,
                pending.title, pending.artist, bus.kind, bus.sourceDiagnostic,
                null, System.currentTimeMillis());
    }

    private PlaybackErrorInfo timeoutError(Track pending) {
        return new PlaybackErrorInfo(pending.id, pending.sourceId,
                pending.title, pending.artist, PlaybackErrorInfo.KIND_TIMEOUT,
                null, null, System.currentTimeMillis());
    }

    // ---------------------------------------------------------------- queue control

    /** Starts playback of {@code tracks} at {@code index}. Safe to call before connect. */
    public void play(List<Track> tracks, int index) {
        Runnable action = () -> {
            MediaController c = controller;
            if (c == null) return;
            // FOCUS-YTM-1: this call is void — a refused stream resolution (e.g.
            // YouTube answering LOGIN_REQUIRED) used to vanish silently. The
            // service now posts the typed reason to StreamErrorBus and the player
            // listener surfaces it while this track is still pending.
            Track starter = tracks.isEmpty() ? null
                    : tracks.get(Math.max(0, Math.min(index, tracks.size() - 1)));
            StreamErrorBus.clear(); // fresh attempt — never adopt a stale diagnostic
            pendingResolutionTrack = starter;
            pendingResolutionAtMs = System.currentTimeMillis();
            c.setMediaItems(MediaItemConverter.toMediaItems(tracks), index, 0L);
            c.prepare();
            c.play();
            startWatchdog();
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
        StreamErrorBus.clear(); // fresh attempt — never adopt a stale diagnostic
        pendingResolutionTrack = track;
        pendingResolutionAtMs = System.currentTimeMillis();
        c.addMediaItem(c.getMediaItemCount(), MediaItemConverter.toMediaItem(track));
        startWatchdog();
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

    /** Moves one queue entry (drag-to-reorder). Positions follow the live player order. */
    public void moveQueueItem(int from, int to) {
        MediaController c = controller;
        if (c == null) return;
        if (from == to || from < 0 || to < 0 || from >= c.getMediaItemCount()
                || to >= c.getMediaItemCount()) {
            return;
        }
        c.moveMediaItem(from, to);
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

    /**
     * Last playback failure (FOCUS-YTM-1), or null while healthy/after recovery.
     * Carries the typed source diagnostic when the failure was a refused stream
     * resolution — the UI uses it for honest, actionable messaging.
     */
    @Nullable
    public PlaybackErrorInfo lastPlaybackError() {
        return lastError;
    }

    /** User acknowledged the failure (banner/snackbar dismiss). */
    public void dismissPlaybackError() {
        lastError = null;
        notifyListeners();
    }

    /**
     * Builds the error snapshot for the UI. Prefers the typed diagnostic from
     * {@link StreamErrorBus} — but only when it belongs to the track that actually
     * failed, so a stale entry can never be attributed to the wrong track.
     */
    private PlaybackErrorInfo buildError(@Nullable Track track, @Nullable String errorCodeName) {
        long now = System.currentTimeMillis();
        if (track == null) {
            PlaybackErrorInfo bus = StreamErrorBus.latest();
            if (bus != null) {
                // Resolution failed before the item was even set — the bus is the
                // only place that knows which track and why.
                return new PlaybackErrorInfo(bus.trackId, bus.sourceId, null, null,
                        bus.kind, bus.sourceDiagnostic, errorCodeName, now);
            }
            return new PlaybackErrorInfo(PlaybackErrorInfo.KIND_UNKNOWN,
                    PlaybackErrorInfo.KIND_UNKNOWN, null, null,
                    PlaybackErrorInfo.KIND_UNKNOWN, null, errorCodeName, now);
        }
        PlaybackErrorInfo bus = StreamErrorBus.latest();
        boolean busMatches = bus != null && bus.belongsTo(track.id);
        return new PlaybackErrorInfo(track.id, track.sourceId, track.title, track.artist,
                busMatches ? bus.kind : PlaybackErrorInfo.KIND_PLAYER,
                busMatches ? bus.sourceDiagnostic : null,
                errorCodeName, now);
    }

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
