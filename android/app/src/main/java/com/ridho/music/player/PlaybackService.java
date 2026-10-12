package com.ridho.music.player;

import android.app.PendingIntent;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.annotation.OptIn;
import androidx.media3.common.AudioAttributes;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.util.UnstableApi;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.session.DefaultMediaNotificationProvider;
import androidx.media3.session.MediaSession;
import androidx.media3.session.MediaSessionService;
import androidx.media3.session.SessionCommand;
import androidx.media3.session.SessionCommands;
import androidx.media3.session.SessionResult;

import com.google.common.collect.ImmutableList;
import com.google.common.util.concurrent.Futures;
import com.google.common.util.concurrent.ListenableFuture;
import com.google.common.util.concurrent.SettableFuture;
import com.ridho.music.App;
import com.ridho.music.R;
import com.ridho.music.data.repository.LibraryRepository;
import com.ridho.music.domain.model.Track;
import com.ridho.music.domain.source.MusicSource;
import com.ridho.music.domain.source.SourceException;
import com.ridho.music.settings.SettingsRepository;
import com.ridho.music.ui.NowPlayingActivity;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Background playback service built on Media3 {@link MediaSessionService}.
 *
 * <p>Responsibilities:
 * <ul>
 *   <li>Own the ExoPlayer instance (audio focus, becoming-noisy, wake mode handled by Media3).</li>
 *   <li>Expose a MediaSession so Android System UI, lock screen, wear and Bluetooth
 *       controllers can control playback — the media notification with artwork is
 *       provided by Media3's {@link DefaultMediaNotificationProvider}.</li>
 *   <li>Resolve remote stream URIs for tracks the UI queued (see {@code MusicSource}
 *       contract; resolution happens here, never in the UI).</li>
 *   <li>Persist the queue so the last session can be restored (paused) after restart.</li>
 *   <li>Record listening history.</li>
 * </ul>
 *
 * <p>The service never talks to a concrete music provider directly — it goes through
 * {@link MusicSource}, keeping the playback engine provider-agnostic.</p>
 */
@OptIn(markerClass = UnstableApi.class)
public class PlaybackService extends MediaSessionService {

    private static final String TAG = "PlaybackService";
    private static final int NOTIFICATION_ID = 1001;
    private static final long PERSIST_DEBOUNCE_MS = 400L;
    /** Above this position we treat "previous" as a seek-to-start, matching platform conventions. */
    private static final long PREVIOUS_SEEK_THRESHOLD_MS = 3_000L;

    /** Custom session command: pause playback after {@code delayMs} (0 cancels the timer). */
    public static final String COMMAND_SET_SLEEP_TIMER = "com.ridho.music.SET_SLEEP_TIMER";
    public static final String EXTRA_SLEEP_DELAY_MS = "delayMs";

    private ExoPlayer player;
    private MediaSession session;
    private LibraryRepository library;
    private SettingsRepository settings;
    private ExecutorService io;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final Runnable persistRunnable = this::persistQueueNow;
    private boolean queueRestored = false;

    /** Media id of the track last written to history (dedupe; see maybeRecordHistory). */
    @Nullable
    private String lastHistoryMediaItemId;

    // ---------------------------------------------------------------- lifecycle

    @Override
    public void onCreate() {
        super.onCreate();

        App app = (App) getApplication();
        library = App.locator().library();
        settings = App.locator().settings();
        io = Executors.newSingleThreadExecutor();

        player = new ExoPlayer.Builder(this)
                // Audio focus + ducking handled by Media3: pauses on transient loss,
                // ducks during notifications, resumes afterwards.
                .setAudioAttributes(
                        new AudioAttributes.Builder()
                                .setUsage(C.USAGE_MEDIA)
                                .setContentType(C.AUDIO_CONTENT_TYPE_MUSIC)
                                .build(),
                        /* handleAudioFocus= */ true)
                .setHandleAudioBecomingNoisy(true) // pause when headphones unplug
                .setWakeMode(C.WAKE_MODE_NETWORK)  // hold WifiLock while streaming
                .setSeekBackIncrementMs(10_000L)
                .setSeekForwardIncrementMs(10_000L)
                .build();
        player.setSkipSilenceEnabled(settings.skipSilence());
        player.setPlaybackSpeed(settings.playbackSpeed());
        player.addListener(playerListener);

        session = new MediaSession.Builder(this, player)
                .setSessionActivity(PendingIntent.getActivity(
                        this,
                        /* requestCode= */ 0,
                        new Intent(this, NowPlayingActivity.class),
                        PendingIntent.FLAG_IMMUTABLE))
                .setCallback(sessionCallback)
                .build();

        DefaultMediaNotificationProvider notificationProvider =
                new DefaultMediaNotificationProvider(
                        this,
                        /* notificationIdProvider= */ session -> NOTIFICATION_ID,
                        App.NOTIF_CHANNEL_ID,
                        R.string.notif_channel_name);
        notificationProvider.setSmallIcon(R.drawable.ic_music_note);
        setMediaNotificationProvider(notificationProvider);

        restoreQueueIfNeeded();
    }

    @Nullable
    @Override
    public MediaSession onGetSession(@NonNull MediaSession.ControllerInfo controllerInfo) {
        return session;
    }

    @Override
    public void onTaskRemoved(@Nullable Intent rootIntent) {
        // Requirement: do not keep unnecessary services alive. If the user swiped the
        // app away while nothing plays, tear everything down instead of lingering.
        if (player == null || !player.getPlayWhenReady() || player.getMediaItemCount() == 0) {
            persistQueueNow();
            stopSelf();
        }
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        mainHandler.removeCallbacks(persistRunnable);
        mainHandler.removeCallbacks(sleepTimerTask);
        persistQueueNow();
        if (session != null) {
            session.release();
            session = null;
        }
        if (player != null) {
            player.release();
            player = null;
        }
        if (io != null) {
            io.shutdown();
        }
        super.onDestroy();
    }

    // ---------------------------------------------------------------- session callbacks

    private final MediaSession.Callback sessionCallback = new MediaSession.Callback() {

        @NonNull
        @Override
        public MediaSession.ConnectionResult onConnect(
                @NonNull MediaSession mediaSession,
                @NonNull MediaSession.ControllerInfo controller) {
            // Least-privilege: expose only the custom commands this app supports.
            SessionCommands sessionCommands = new SessionCommands.Builder()
                    .add(new SessionCommand(COMMAND_SET_SLEEP_TIMER, Bundle.EMPTY))
                    .build();
            return new MediaSession.ConnectionResult.AcceptedResultBuilder(mediaSession)
                    .setAvailableSessionCommands(sessionCommands)
                    .build();
        }

        @NonNull
        @Override
        public ListenableFuture<List<MediaItem>> onAddMediaItems(
                @NonNull MediaSession mediaSession,
                @NonNull MediaSession.ControllerInfo controller,
                @NonNull List<MediaItem> mediaItems) {
            // Called whenever a controller (UI, Bluetooth, Assistant) adds items that
            // have no local URI. Resolve each through its source on the IO executor.
            SettableFuture<List<MediaItem>> future = SettableFuture.create();
            io.execute(() -> {
                try {
                    List<MediaItem> resolved = new ArrayList<>(mediaItems.size());
                    for (MediaItem item : mediaItems) {
                        resolved.add(resolveMediaItem(item));
                    }
                    future.set(ImmutableList.copyOf(resolved));
                } catch (Exception e) {
                    future.setException(e);
                }
            });
            return future;
        }

        @NonNull
        @Override
        public ListenableFuture<SessionResult> onCustomCommand(
                @NonNull MediaSession mediaSession,
                @NonNull MediaSession.ControllerInfo controller,
                @NonNull SessionCommand customCommand,
                @NonNull Bundle args) {
            if (COMMAND_SET_SLEEP_TIMER.equals(customCommand.customAction)) {
                long delayMs = args.getLong(EXTRA_SLEEP_DELAY_MS, 0L);
                scheduleSleepTimer(delayMs);
                return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS));
            }
            return Futures.immediateFuture(new SessionResult(SessionResult.RESULT_SUCCESS));
        }
    };

    /** Schedules (or cancels with 0) a sleep timer that pauses playback — never kills the process. */
    private void scheduleSleepTimer(long delayMs) {
        mainHandler.removeCallbacks(sleepTimerTask);
        if (delayMs <= 0L) {
            Log.i(TAG, "sleepTimer canceled");
            return;
        }
        Log.i(TAG, "sleepTimer scheduled");
        mainHandler.postDelayed(sleepTimerTask, delayMs);
    }

    private final Runnable sleepTimerTask = new Runnable() {
        @Override
        public void run() {
            if (player != null && player.isPlaying()) {
                player.pause();
            }
        }
    };

    /** Resolves a single (possibly URI-less) media item against its source. */
    private MediaItem resolveMediaItem(MediaItem item) throws SourceException {
        Track track = MediaItemConverter.toTrack(item);
        if (track == null) {
            // Not our metadata (e.g. Assistant voice query) — keep as-is if playable, else drop.
            if (item.localConfiguration != null) return item;
            throw new SourceException(SourceException.Kind.UNSUPPORTED,
                    "Cannot resolve an item without track metadata.");
        }
        if (item.localConfiguration != null || track.hasResolvedStream()) {
            return item.localConfiguration != null
                    ? item
                    : MediaItemConverter.toMediaItem(track.withStreamUri(track.streamUri));
        }
        MusicSource source = findSource(track.sourceId);
        if (source == null) {
            throw new SourceException(SourceException.Kind.UNSUPPORTED,
                    "No source registered for id: " + track.sourceId);
        }
        String uri = source.resolveStreamUri(track);
        if (uri == null) {
            throw new SourceException(SourceException.Kind.UNAVAILABLE,
                    "Source could not provide a playable stream for this track.");
        }
        return MediaItemConverter.toMediaItem(track.withStreamUri(uri));
    }

    @Nullable
    private MusicSource findSource(String sourceId) {
        for (MusicSource s : App.locator().allSources()) {
            if (s.id().equals(sourceId)) return s;
        }
        return null;
    }

    // ---------------------------------------------------------------- player events

    /**
     * WEBLAB-22B fix — history records REAL playback only: playing + STATE_READY
     * + a media item different from the last recorded one (decision in
     * {@link HistoryPolicy}). Previously every non-repeat media-item transition
     * wrote history, so restoring a persisted queue at launch (setMediaItems +
     * prepare while paused, reason PLAYLIST_CHANGED) recorded a row for a track
     * the user never played this session. Event pairs (READY→isPlaying,
     * mid-play seeks) dedupe via {@code lastHistoryMediaItemId}; the repository's
     * 30 s per-track rate limit remains as a backstop.
     */
    private void maybeRecordHistory() {
        if (player == null) return;
        Track track = MediaItemConverter.toTrack(player.getCurrentMediaItem());
        if (track == null) return;
        if (!HistoryPolicy.shouldRecord(player.isPlaying(), player.getPlaybackState(),
                track.id, lastHistoryMediaItemId)) {
            return;
        }
        lastHistoryMediaItemId = track.id;
        library.addHistory(track);
    }

    private final Player.Listener playerListener = new Player.Listener() {

        @Override
        public void onMediaItemTransition(@Nullable MediaItem mediaItem, int reason) {
            maybeRecordHistory();
            schedulePersist();
        }

        @Override
        public void onPlaybackStateChanged(int playbackState) {
            maybeRecordHistory();
            schedulePersist();
        }

        @Override
        public void onPlayWhenReadyChanged(boolean playWhenReady, int reason) {
            maybeRecordHistory();
            schedulePersist();
        }

        @Override
        public void onIsPlayingChanged(boolean isPlaying) {
            maybeRecordHistory();
            schedulePersist();
        }

        @Override
        public void onPlayerError(@NonNull PlaybackException error) {
            // Never log full URLs — errorName only, plus a safe cause summary.
            Log.w(TAG, "playbackError " + error.getErrorCodeName());
            Throwable cause = error.getCause();
            if (cause != null) {
                Log.w(TAG, "cause: " + cause.getClass().getSimpleName());
            }
            attemptOneShotRecovery();
        }
    };

    /**
     * One-shot recovery for transient network failures on the current item:
     * re-resolve its stream URI once and retry. If that also fails the error is
     * surfaced to the UI through the controller — no silent retries forever.
     */
    private void attemptOneShotRecovery() {
        if (player == null || player.getMediaItemCount() == 0) return;
        int index = player.getCurrentMediaItemIndex();
        MediaItem current = player.getMediaItemAt(index);
        Track track = MediaItemConverter.toTrack(current);
        if (track == null || current.localConfiguration != null) return;
        MusicSource source = findSource(track.sourceId);
        if (source == null) return;
        io.execute(() -> {
            try {
                String uri = source.resolveStreamUri(track);
                if (uri == null) return;
                mainHandler.post(() -> {
                    if (player == null || player.getMediaItemCount() == 0) return;
                    Track resolved = track.withStreamUri(uri);
                    MediaItem newItem = MediaItemConverter.toMediaItem(resolved);
                    player.replaceMediaItem(index, newItem);
                    player.prepare();
                    player.play();
                });
            } catch (SourceException se) {
                // Recovery failed; the UI will show a typed error via the controller.
                Log.w(TAG, "recovery failed: " + se.kind);
            }
        });
    }

    // ---------------------------------------------------------------- queue persistence

    private void schedulePersist() {
        mainHandler.removeCallbacks(persistRunnable);
        mainHandler.postDelayed(persistRunnable, PERSIST_DEBOUNCE_MS);
    }

    private void persistQueueNow() {
        mainHandler.removeCallbacks(persistRunnable);
        if (player == null) return;
        int count = player.getMediaItemCount();
        if (count == 0) {
            settings.clearQueueState();
            return;
        }
        List<Track> tracks = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            Track t = MediaItemConverter.toTrack(player.getMediaItemAt(i));
            if (t != null) tracks.add(t);
        }
        int index = player.getCurrentMediaItemIndex();
        long position = player.getCurrentPosition();
        library.saveQueue(tracks, index, position);
        settings.persistQueueState(index, position);
    }

    private void restoreQueueIfNeeded() {
        if (queueRestored || !settings.restoreQueueOnLaunch()) return;
        io.execute(() -> {
            library.restoreQueue(tracks -> {
                if (tracks.isEmpty() || player == null || player.getMediaItemCount() > 0) return;
                int index = Math.max(0, Math.min(settings.persistedQueueIndex(), tracks.size() - 1));
                long position = settings.persistedQueuePositionMs();
                // Restore paused at the last position; never auto-start playback after restart.
                player.setMediaItems(MediaItemConverter.toMediaItems(tracks), index, position);
                player.prepare();
                queueRestored = true;
            });
        });
    }
}
