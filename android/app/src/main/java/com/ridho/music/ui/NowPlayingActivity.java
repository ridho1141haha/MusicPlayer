package com.ridho.music.ui;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.ImageButton;
import android.widget.TextView;
import android.widget.Toast;
import android.widget.ViewFlipper;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.bumptech.glide.Glide;
import com.google.android.material.slider.Slider;
import com.ridho.music.App;
import com.ridho.music.R;
import com.ridho.music.domain.model.Track;
import com.ridho.music.lyrics.EmbeddedLyricsProvider;
import com.ridho.music.lyrics.LrcParser;
import com.ridho.music.playback.PlaybackErrorInfo;
import com.ridho.music.playback.PlaybackRepository;
import com.ridho.music.player.MediaItemConverter;
import com.ridho.music.ui.adapter.LyricsAdapter;

/**
 * Full-screen player: artwork, lyrics panel, seek bar, transport controls,
 * favorite toggle and the queue sheet. Position updates are driven by a
 * 500 ms handler while the screen is resumed and playing (position has no
 * event-driven callback in Media3; everything else is event-driven).
 */
public class NowPlayingActivity extends AppCompatActivity implements PlaybackRepository.Listener {

    private PlaybackRepository playback;

    private ViewFlipper flipper;
    private android.widget.ImageView artwork;
    private TextView title;
    private TextView artist;
    private TextView emptyState;
    private ImageButton favoriteButton;
    private ImageButton lyricsButton;
    private Slider seekBar;
    private TextView timeCurrent;
    private TextView timeTotal;
    private ImageButton shuffleButton;
    private ImageButton prevButton;
    private ImageButton playPauseButton;
    private ImageButton nextButton;
    private ImageButton repeatButton;
    private RecyclerView lyricsList;
    private TextView lyricsPlain;
    private TextView lyricsEmpty;

    // FOCUS-YTM-1: honest playback-error banner
    private View errorBanner;
    private TextView errorMessage;
    private TextView errorOpenYtm;

    private final LyricsAdapter lyricsAdapter = new LyricsAdapter();
    private final EmbeddedLyricsProvider lyricsProvider = new EmbeddedLyricsProvider();
    private final Handler positionHandler = new Handler(Looper.getMainLooper());
    private boolean userSeeking = false;
    private boolean lyricsMode = false;
    private LrcParser.Lyrics currentLyrics;

    private final Runnable positionTick = new Runnable() {
        @Override
        public void run() {
            updatePositionUi();
            positionHandler.postDelayed(this, 500L);
        }
    };

    public static Intent intent(Context context) {
        return new Intent(context, NowPlayingActivity.class);
    }

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_now_playing);
        playback = App.locator().playback();

        ImageButton closeButton = findViewById(R.id.np_close);
        closeButton.setOnClickListener(v -> finish());

        ImageButton sleepButton = findViewById(R.id.np_sleep);
        TextView speedButton = findViewById(R.id.np_speed);
        ImageButton shareButton = findViewById(R.id.np_share);
        sleepButton.setOnClickListener(v -> showSleepTimerDialog());
        speedButton.setOnClickListener(v -> showPlaybackSpeedDialog());
        shareButton.setOnClickListener(v -> shareCurrentTrack());

        flipper = findViewById(R.id.np_flipper);
        artwork = findViewById(R.id.np_artwork);
        title = findViewById(R.id.np_title);
        artist = findViewById(R.id.np_artist);
        emptyState = findViewById(R.id.np_empty);
        favoriteButton = findViewById(R.id.np_favorite);
        lyricsButton = findViewById(R.id.np_lyrics_toggle);
        seekBar = findViewById(R.id.np_seek);
        timeCurrent = findViewById(R.id.np_time_current);
        timeTotal = findViewById(R.id.np_time_total);
        shuffleButton = findViewById(R.id.np_shuffle);
        prevButton = findViewById(R.id.np_prev);
        playPauseButton = findViewById(R.id.np_play_pause);
        nextButton = findViewById(R.id.np_next);
        repeatButton = findViewById(R.id.np_repeat);
        ImageButton queueButton = findViewById(R.id.np_queue);
        lyricsList = findViewById(R.id.np_lyrics_list);
        lyricsPlain = findViewById(R.id.np_lyrics_plain);
        lyricsEmpty = findViewById(R.id.np_lyrics_empty);

        errorBanner = findViewById(R.id.np_error_banner);
        errorMessage = findViewById(R.id.np_error_message);
        errorOpenYtm = findViewById(R.id.np_error_open_ytm);
        TextView errorDismiss = findViewById(R.id.np_error_dismiss);
        errorDismiss.setOnClickListener(v -> playback.dismissPlaybackError());
        errorOpenYtm.setOnClickListener(v -> {
            PlaybackErrorInfo error = playback.lastPlaybackError();
            if (error != null && !YtmLinks.openTrack(this, error.trackId)) {
                Toast.makeText(this, R.string.err_open_ytm_missing, Toast.LENGTH_SHORT).show();
            }
        });

        lyricsList.setLayoutManager(new LinearLayoutManager(this));
        lyricsList.setAdapter(lyricsAdapter);

        playPauseButton.setOnClickListener(v -> playback.playPause());
        nextButton.setOnClickListener(v -> playback.next());
        prevButton.setOnClickListener(v -> playback.previous());
        queueButton.setOnClickListener(v -> new QueueSheet().show(getSupportFragmentManager(), "queue"));
        favoriteButton.setOnClickListener(v -> toggleFavorite());
        lyricsButton.setOnClickListener(v -> {
            lyricsMode = !lyricsMode;
            flipper.setDisplayedChild(lyricsMode ? 1 : 0);
        });

        shuffleButton.setOnClickListener(v ->
                playback.setShuffleModeEnabled(!playback.isShuffleEnabled()));
        repeatButton.setOnClickListener(v -> {
            int mode = playback.repeatMode();
            int nextMode = mode == androidx.media3.common.Player.REPEAT_MODE_OFF
                    ? androidx.media3.common.Player.REPEAT_MODE_ALL
                    : (mode == androidx.media3.common.Player.REPEAT_MODE_ALL
                    ? androidx.media3.common.Player.REPEAT_MODE_ONE
                    : androidx.media3.common.Player.REPEAT_MODE_OFF);
            playback.setRepeatMode(nextMode);
        });

        seekBar.addOnSliderTouchListener(new Slider.OnSliderTouchListener() {
            @Override public void onStartTrackingTouch(@NonNull Slider slider) {
                userSeeking = true;
            }
            @Override public void onStopTrackingTouch(@NonNull Slider slider) {
                userSeeking = false;
                playback.seekTo((long) slider.getValue());
            }
        });
    }

    @Override
    protected void onStart() {
        super.onStart();
        playback.addListener(this);
        playback.connect();
        onPlaybackChanged();
    }

    @Override
    protected void onStop() {
        playback.removeListener(this);
        positionHandler.removeCallbacks(positionTick);
        super.onStop();
    }

    @Override
    public void onPlaybackChanged() {
        Track track = playback.currentTrack();
        boolean hasTrack = track != null;

        emptyState.setVisibility(hasTrack ? View.GONE : View.VISIBLE);
        flipper.setVisibility(hasTrack ? View.VISIBLE : View.GONE);
        findViewById(R.id.np_controls_block).setVisibility(hasTrack ? View.VISIBLE : View.GONE);
        if (!hasTrack) {
            positionHandler.removeCallbacks(positionTick);
            // FOCUS-YTM-3: a failed first play leaves the queue empty — the honest
            // error banner must still show over the empty state instead of hiding.
            refreshErrorBanner(playback.lastPlaybackError());
            return;
        }

        title.setText(track.title);
        artist.setText(track.artist);
        ((TextView) findViewById(R.id.np_speed)).setText(
                FormatUtils.formatSpeed(playback.playbackSpeed()));
        Glide.with(this)
                .load(MediaItemConverter.artworkUri(track))
                .placeholder(R.drawable.bg_artwork_placeholder)
                .centerCrop()
                .into(artwork);

        // Favorite state (async; avoids blocking the main thread on Room).
        App.locator().library().isFavorite(track.id, isFavorite -> {
            if (isFinishing() || isDestroyed()) return;
            Track current = playback.currentTrack();
            if (current != null && current.id.equals(track.id)) {
                favoriteButton.setImageResource(isFavorite
                        ? R.drawable.ic_heart_filled : R.drawable.ic_heart_outline);
                favoriteButton.setTag(isFavorite);
            }
        });

        // Transport states
        playPauseButton.setImageResource(playback.isPlaying()
                ? R.drawable.ic_pause : R.drawable.ic_play);
        playPauseButton.setContentDescription(playback.isPlaying()
                ? getString(R.string.cd_pause) : getString(R.string.cd_play));
        shuffleButton.setAlpha(playback.isShuffleEnabled() ? 1f : 0.5f);
        shuffleButton.setColorFilter(playback.isShuffleEnabled()
                ? getColor(R.color.primary) : getColor(R.color.on_surface));
        int repeatMode = playback.repeatMode();
        repeatButton.setImageResource(
                repeatMode == androidx.media3.common.Player.REPEAT_MODE_ONE
                        ? R.drawable.ic_repeat_one : R.drawable.ic_repeat);
        repeatButton.setAlpha(repeatMode == androidx.media3.common.Player.REPEAT_MODE_OFF ? 0.5f : 1f);
        repeatButton.setColorFilter(repeatMode == androidx.media3.common.Player.REPEAT_MODE_OFF
                ? getColor(R.color.on_surface) : getColor(R.color.primary));

        // Lyrics
        loadLyrics(track);

        refreshErrorBanner(playback.lastPlaybackError());

        long duration = playback.durationMs();
        timeTotal.setText(FormatUtils.formatDuration(duration));
        seekBar.setValueTo(Math.max(duration, 1L));

        positionHandler.removeCallbacks(positionTick);
        positionHandler.post(positionTick);
    }

    /** FOCUS-YTM-1: keeps the banner in sync with the repository's error snapshot. */
    private void refreshErrorBanner(PlaybackErrorInfo error) {
        if (error == null) {
            errorBanner.setVisibility(View.GONE);
            return;
        }
        errorMessage.setText(PlaybackErrorText.message(this, error));
        boolean ytm = Track.SOURCE_YTM.equals(error.sourceId)
                && YtmLinks.videoIdFromTrackId(error.trackId) != null;
        errorOpenYtm.setVisibility(ytm ? View.VISIBLE : View.GONE);
        errorBanner.setVisibility(View.VISIBLE);
    }

    private void toggleFavorite() {
        Track track = playback.currentTrack();
        if (track == null) return;
        boolean wasFavorite = Boolean.TRUE.equals(favoriteButton.getTag());
        App.locator().library().setFavorite(track, !wasFavorite, isFavorite -> {
            if (isFinishing() || isDestroyed()) return;
            favoriteButton.setImageResource(isFavorite
                    ? R.drawable.ic_heart_filled : R.drawable.ic_heart_outline);
            favoriteButton.setTag(isFavorite);
        });
    }

    private void shareCurrentTrack() {
        Track track = playback.currentTrack();
        if (track == null) return;
        String text = getString(R.string.share_track_text, track.title, track.artist);
        android.content.Intent send = new android.content.Intent(android.content.Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(android.content.Intent.EXTRA_TEXT, text);
        startActivity(android.content.Intent.createChooser(send, null));
    }

    private void showSleepTimerDialog() {
        final int[] minutesOptions = {0, 5, 10, 15, 30, 60};
        String[] labels = new String[minutesOptions.length];
        labels[0] = getString(R.string.sleep_off);
        for (int i = 1; i < minutesOptions.length; i++) {
            labels[i] = minutesOptions[i] + " min";
        }
        new com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle(R.string.sleep_timer_title)
                .setItems(labels, (dialog, which) -> {
                    int minutes = minutesOptions[which];
                    playback.setSleepTimerAfterMs(minutes * 60_000L);
                    Toast.makeText(this,
                            minutes == 0
                                    ? getString(R.string.sleep_timer_off_toast)
                                    : getString(R.string.sleep_timer_set_toast, minutes),
                            Toast.LENGTH_SHORT).show();
                })
                .show();
    }

    private void showPlaybackSpeedDialog() {
        final float[] speeds = {0.75f, 1.0f, 1.25f, 1.5f, 2.0f};
        String[] labels = new String[speeds.length];
        int checked = 1;
        float current = playback.playbackSpeed();
        for (int i = 0; i < speeds.length; i++) {
            labels[i] = FormatUtils.formatSpeed(speeds[i]);
            if (Math.abs(speeds[i] - current) < 0.01f) checked = i;
        }
        new com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle(R.string.playback_speed_title)
                .setSingleChoiceItems(labels, checked, (dialog, which) -> {
                    float speed = speeds[which];
                    playback.setPlaybackSpeed(speed);
                    App.locator().settings().setPlaybackSpeed(speed);
                    ((TextView) findViewById(R.id.np_speed)).setText(FormatUtils.formatSpeed(speed));
                    dialog.dismiss();
                })
                .setNegativeButton(R.string.playlist_cancel, null)
                .show();
    }

    private void loadLyrics(Track track) {
        String raw = lyricsProvider.lyricsFor(track);
        currentLyrics = LrcParser.parse(raw);
        lyricsAdapter.submit(currentLyrics);
        if (raw == null) {
            lyricsEmpty.setVisibility(View.VISIBLE);
            lyricsList.setVisibility(View.GONE);
            lyricsPlain.setVisibility(View.GONE);
            lyricsEmpty.setText(R.string.lyrics_none);
        } else if (currentLyrics.synced) {
            lyricsEmpty.setVisibility(View.GONE);
            lyricsList.setVisibility(View.VISIBLE);
            lyricsPlain.setVisibility(View.GONE);
        } else {
            lyricsEmpty.setVisibility(View.GONE);
            lyricsList.setVisibility(View.GONE);
            lyricsPlain.setVisibility(View.VISIBLE);
            StringBuilder sb = new StringBuilder();
            for (LrcParser.Line line : currentLyrics.lines) {
                if (sb.length() > 0) sb.append('\n');
                sb.append(line.text);
            }
            lyricsPlain.setText(sb.toString());
        }
    }

    private void updatePositionUi() {
        if (isFinishing() || isDestroyed()) return;
        Track track = playback.currentTrack();
        if (track == null) {
            positionHandler.removeCallbacks(positionTick);
            return;
        }
        long duration = playback.durationMs();
        long position = playback.positionMs();
        if (!userSeeking) {
            seekBar.setValue(Math.max(0L, Math.min(duration, position)));
        }
        timeCurrent.setText(FormatUtils.formatDuration(position));
        timeTotal.setText(FormatUtils.formatDuration(duration));

        if (lyricsMode && currentLyrics != null && currentLyrics.synced) {
            int index = LrcParser.activeLineIndex(currentLyrics.lines, position);
            lyricsAdapter.setActiveIndex(index);
            if (index >= 0) {
                LinearLayoutManager lm = (LinearLayoutManager) lyricsList.getLayoutManager();
                if (lm != null) {
                    int first = lm.findFirstCompletelyVisibleItemPosition();
                    int last = lm.findLastCompletelyVisibleItemPosition();
                    if (index < first || index > last) {
                        lyricsList.smoothScrollToPosition(index);
                    }
                }
            }
        }
    }
}
