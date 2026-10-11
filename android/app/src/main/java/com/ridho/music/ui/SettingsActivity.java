package com.ridho.music.ui;

import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.view.View;
import android.widget.ImageButton;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.google.android.material.switchmaterial.SwitchMaterial;
import com.ridho.music.App;
import com.ridho.music.R;
import com.ridho.music.settings.SettingsRepository;
import com.ridho.music.source.LocalMusicSource;
import com.ridho.music.source.yt.InnertubeClient;
import com.ridho.music.source.yt.YouTubeMusicSource;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Settings + source diagnostics. Preferences are plain SharedPreferences —
 * the app stores no accounts, tokens or sensitive data.
 */
public class SettingsActivity extends AppCompatActivity {

    private final ExecutorService io = Executors.newSingleThreadExecutor();

    private SettingsRepository settings;
    private SwitchMaterial ytmSwitch;
    private SwitchMaterial skipSilenceSwitch;
    private SwitchMaterial restoreQueueSwitch;
    private TextView diagYtmStatus;
    private TextView diagLocalStatus;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);
        settings = App.locator().settings();

        ImageButton back = findViewById(R.id.settings_back);
        back.setOnClickListener(v -> finish());

        ytmSwitch = findViewById(R.id.switch_ytm);
        skipSilenceSwitch = findViewById(R.id.switch_skip_silence);
        restoreQueueSwitch = findViewById(R.id.switch_restore_queue);
        diagYtmStatus = findViewById(R.id.diag_ytm_status);
        diagLocalStatus = findViewById(R.id.diag_local_status);
        TextView versionText = findViewById(R.id.settings_version);
        View licensesRow = findViewById(R.id.row_licenses);
        View privacyRow = findViewById(R.id.row_privacy);
        View clearCacheRow = findViewById(R.id.row_clear_cache);
        TextView ytmNote = findViewById(R.id.settings_ytm_note);
        ytmNote.setText(R.string.yt_experimental_note);

        ytmSwitch.setChecked(settings.youtubeMusicEnabled());
        ytmSwitch.setOnCheckedChangeListener((buttonView, isChecked) -> {
            settings.setYoutubeMusicEnabled(isChecked);
            runDiagnostics();
        });

        skipSilenceSwitch.setChecked(settings.skipSilence());
        skipSilenceSwitch.setOnCheckedChangeListener((buttonView, isChecked) ->
                settings.setSkipSilence(isChecked));

        restoreQueueSwitch.setChecked(settings.restoreQueueOnLaunch());
        restoreQueueSwitch.setOnCheckedChangeListener((buttonView, isChecked) ->
                settings.setRestoreQueueOnLaunch(isChecked));

        versionText.setText(getString(R.string.app_name) + " v" + FormatUtils.appVersion(this));

        licensesRow.setOnClickListener(v -> showLicensesDialog());
        privacyRow.setOnClickListener(v -> showPrivacyDialog());
        clearCacheRow.setOnClickListener(v -> clearArtworkCache());
    }

    @Override
    protected void onResume() {
        super.onResume();
        runDiagnostics();
    }

    @Override
    protected void onDestroy() {
        io.shutdown();
        super.onDestroy();
    }

    // ---------------------------------------------------------------- diagnostics

    private void runDiagnostics() {
        diagYtmStatus.setText(R.string.diag_checking);

        // Local folder status (already known synchronously from settings + count)
        LocalMusicSource local = App.locator().localSource();
        if (!local.isConfigured()) {
            diagLocalStatus.setText(R.string.diag_none);
        } else {
            App.locator().library().countLocalTracks(count -> {
                if (isFinishing() || isDestroyed()) return;
                diagLocalStatus.setText(getString(R.string.diag_ok) + " · " + count + " tracks");
            });
        }

        if (!settings.youtubeMusicEnabled()) {
            diagYtmStatus.setText(R.string.diag_none);
            return;
        }
        io.execute(() -> {
            InnertubeClient probe = new InnertubeClient();
            boolean ok = probe.isReachable();
            probe.shutdown();
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) return;
                diagYtmStatus.setText(ok ? R.string.diag_ok : R.string.diag_error);
            });
        });
    }

    // ---------------------------------------------------------------- dialogs / actions

    private void clearArtworkCache() {
        io.execute(() -> {
            File dir = new File(getFilesDir(), "artwork");
            long freed = 0L;
            File[] files = dir.listFiles();
            if (files != null) {
                for (File f : files) {
                    freed += f.length();
                    f.delete();
                }
            }
            long finalFreed = freed;
            runOnUiThread(() -> Toast.makeText(this, getString(
                    R.string.settings_clear_cache_done) + " (" + FormatUtils.formatBytes(finalFreed)
                    + ")", Toast.LENGTH_SHORT).show());
        });
    }

    private void showLicensesDialog() {
        String text = "Ridho Music is MIT-licensed original code and relies on:\n\n"
                + "• AndroidX / Jetpack (appcompat, Room, Media3/ExoPlayer, documentfile, "
                + "recyclerview) — Apache License 2.0\n"
                + "• Material Components for Android — Apache License 2.0\n"
                + "• Glide — BSD, part MIT / Apache 2.0\n"
                + "• OkHttp — Apache License 2.0\n"
                + "• JUnit — Eclipse Public License 1.0\n\n"
                + "Full license texts are included in the project repository "
                + "(THIRD_PARTY_NOTICES.md).";
        new com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle(R.string.settings_licenses)
                .setMessage(text)
                .setPositiveButton(android.R.string.ok, null)
                .show();
    }

    private void showPrivacyDialog() {
        String text = "Ridho Music contains no advertising, analytics or tracking SDKs.\n\n"
                + "• Local files: scanned on-device via the Storage Access Framework; "
                + "nothing is uploaded.\n"
                + "• YouTube Music (optional, experimental): search/stream requests go "
                + "directly over HTTPS to music.youtube.com. No account is used, no "
                + "credentials are stored, no third party sees your queries.\n"
                + "• Data stored on device: favorites, playlists, history and queue "
                + "(app-private database), artwork cache, user preferences.\n"
                + "• Uninstalling the app removes all stored data.";
        new com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle(R.string.settings_privacy)
                .setMessage(text)
                .setPositiveButton(android.R.string.ok, null)
                .show();
    }
}
