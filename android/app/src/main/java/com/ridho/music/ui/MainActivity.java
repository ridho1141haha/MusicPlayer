package com.ridho.music.ui;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.Fragment;
import androidx.fragment.app.FragmentManager;
import androidx.fragment.app.FragmentTransaction;

import com.bumptech.glide.Glide;
import com.google.android.material.snackbar.Snackbar;
import com.ridho.music.App;
import com.ridho.music.R;
import com.ridho.music.domain.model.Track;
import com.ridho.music.playback.PlaybackErrorInfo;
import com.ridho.music.playback.PlaybackRepository;
import com.ridho.music.player.MediaItemConverter;
import com.ridho.music.ui.fragment.HomeFragment;
import com.ridho.music.ui.fragment.LibraryFragment;
import com.ridho.music.ui.fragment.SearchFragment;

import java.util.List;

/**
 * Hosts the three top-level tabs (Home / Search / Library), the mini-player
 * and the bottom navigation. Fragments are shown/hidden (never recreated) so
 * their state survives tab switches.
 */
public class MainActivity extends AppCompatActivity implements UiPlaybackHost,
        PlaybackRepository.Listener {

    private PlaybackRepository playback;

    private View miniPlayer;
    private ImageView miniArtwork;
    private TextView miniTitle;
    private TextView miniArtist;
    private ImageButton miniPlayPause;

    private HomeFragment homeFragment;
    private SearchFragment searchFragment;
    private LibraryFragment libraryFragment;

    // FOCUS-YTM-1: honest playback-failure feedback (deduped per failure instance).
    private Snackbar errorSnackbar;
    private long lastShownErrorAtMs;

    private final ActivityResultLauncher<String> notificationPermissionLauncher =
            registerForActivityResult(new ActivityResultContracts.RequestPermission(), granted -> {
                if (!granted) {
                    Toast.makeText(this, R.string.err_notification_needed, Toast.LENGTH_SHORT).show();
                }
            });

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        playback = App.locator().playback();

        miniPlayer = findViewById(R.id.mini_player);
        miniArtwork = findViewById(R.id.mini_artwork);
        miniTitle = findViewById(R.id.mini_title);
        miniArtist = findViewById(R.id.mini_artist);
        miniPlayPause = findViewById(R.id.mini_play_pause);
        ImageButton miniNext = findViewById(R.id.mini_next);

        miniPlayer.setOnClickListener(v -> startActivity(new Intent(this, NowPlayingActivity.class)));
        miniPlayPause.setOnClickListener(v -> playback.playPause());
        miniNext.setOnClickListener(v -> playback.next());

        ImageButton settingsButton = findViewById(R.id.btn_settings);
        settingsButton.setOnClickListener(v ->
                startActivity(new Intent(this, SettingsActivity.class)));

        if (savedInstanceState == null) {
            homeFragment = new HomeFragment();
            searchFragment = new SearchFragment();
            libraryFragment = new LibraryFragment();
            getSupportFragmentManager().beginTransaction()
                    .add(R.id.fragment_container, homeFragment, "home")
                    .add(R.id.fragment_container, searchFragment, "search")
                    .hide(searchFragment)
                    .add(R.id.fragment_container, libraryFragment, "library")
                    .hide(libraryFragment)
                    .commit();
        } else {
            FragmentManager fm = getSupportFragmentManager();
            homeFragment = (HomeFragment) fm.findFragmentByTag("home");
            searchFragment = (SearchFragment) fm.findFragmentByTag("search");
            libraryFragment = (LibraryFragment) fm.findFragmentByTag("library");
        }

        com.google.android.material.bottomnavigation.BottomNavigationView nav =
                findViewById(R.id.bottom_nav);
        nav.setOnItemSelectedListener(item -> {
            int id = item.getItemId();
            if (id == R.id.nav_home) {
                show(homeFragment);
            } else if (id == R.id.nav_search) {
                show(searchFragment);
            } else if (id == R.id.nav_library) {
                show(libraryFragment);
            } else {
                return false;
            }
            return true;
        });
    }

    /** Shows exactly one of the three fragments, hiding all others. */
    private void show(Fragment target) {
        if (target == null) return;
        FragmentManager fm = getSupportFragmentManager();
        FragmentTransaction tx = fm.beginTransaction();
        for (Fragment f : fm.getFragments()) {
            if (f == target) tx.show(f);
            else tx.hide(f);
        }
        tx.commit();
    }

    // ---------------------------------------------------------------- UiPlaybackHost

    @Override
    public void playWithPermissions(List<Track> tracks, int startIndex) {
        ensureNotificationPermission();
        playback.play(tracks, startIndex);
    }

    private void ensureNotificationPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            boolean granted = ContextCompat.checkSelfPermission(this,
                    Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED;
            if (!granted) {
                notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS);
            }
        }
    }

    // ---------------------------------------------------------------- PlaybackRepository.Listener

    @Override
    public void onPlaybackChanged() {
        Track current = playback.currentTrack();
        if (current == null) {
            miniPlayer.setVisibility(View.GONE);
            return;
        }
        miniPlayer.setVisibility(View.VISIBLE);
        miniTitle.setText(current.title);
        miniArtist.setText(current.artist);
        miniPlayPause.setImageResource(playback.isPlaying()
                ? R.drawable.ic_pause : R.drawable.ic_play);
        miniPlayPause.setContentDescription(playback.isPlaying()
                ? getString(R.string.cd_pause) : getString(R.string.cd_play));
        Glide.with(this)
                .load(MediaItemConverter.artworkUri(current))
                .placeholder(R.drawable.bg_artwork_placeholder)
                .centerCrop()
                .into(miniArtwork);

        showOrClearPlaybackError();
    }

    /** FOCUS-YTM-1: surfaces the last playback failure once, with an escape hatch for YTM. */
    private void showOrClearPlaybackError() {
        PlaybackErrorInfo error = playback.lastPlaybackError();
        if (error == null) {
            if (errorSnackbar != null) {
                errorSnackbar.dismiss();
                errorSnackbar = null;
            }
            return;
        }
        if (error.atMs == lastShownErrorAtMs) return; // already showing this failure
        lastShownErrorAtMs = error.atMs;

        Snackbar snackbar = Snackbar.make(
                findViewById(android.R.id.content),
                PlaybackErrorText.message(this, error),
                Snackbar.LENGTH_LONG);
        if (Track.SOURCE_YTM.equals(error.sourceId)
                && YtmLinks.videoIdFromTrackId(error.trackId) != null) {
            snackbar.setAction(R.string.menu_open_in_ytm, v -> {
                if (!YtmLinks.openTrack(this, error.trackId)) {
                    Toast.makeText(this, R.string.err_open_ytm_missing, Toast.LENGTH_SHORT).show();
                }
            });
        }
        snackbar.show();
        errorSnackbar = snackbar;
    }

    @Override
    protected void onStart() {
        super.onStart();
        playback.addListener(this);
        playback.connect();
    }

    @Override
    protected void onStop() {
        playback.removeListener(this);
        super.onStop();
    }
}
