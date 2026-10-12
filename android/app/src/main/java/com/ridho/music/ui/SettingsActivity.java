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
import com.ridho.music.domain.model.SearchSection;
import com.ridho.music.domain.source.SourceException;
import com.ridho.music.settings.SettingsRepository;
import com.ridho.music.source.LocalMusicSource;
import com.ridho.music.source.jamendo.JamendoSource;
import com.ridho.music.source.yt.InnertubeClient;
import com.ridho.music.source.yt.YouTubeMusicSource;

import java.io.File;
import java.util.List;
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
    private SwitchMaterial jamendoSwitch;
    private SwitchMaterial skipSilenceSwitch;
    private SwitchMaterial restoreQueueSwitch;
    private TextView diagYtmStatus;
    private TextView diagJamendoStatus;
    private TextView jamendoClientIdStatus;
    private TextView diagLocalStatus;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);
        settings = App.locator().settings();

        ImageButton back = findViewById(R.id.settings_back);
        back.setOnClickListener(v -> finish());

        ytmSwitch = findViewById(R.id.switch_ytm);
        jamendoSwitch = findViewById(R.id.switch_jamendo);
        skipSilenceSwitch = findViewById(R.id.switch_skip_silence);
        restoreQueueSwitch = findViewById(R.id.switch_restore_queue);
        diagYtmStatus = findViewById(R.id.diag_ytm_status);
        diagJamendoStatus = findViewById(R.id.diag_jamendo_status);
        jamendoClientIdStatus = findViewById(R.id.jamendo_client_id_status);
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

        jamendoSwitch.setChecked(settings.jamendoEnabled());
        jamendoSwitch.setOnCheckedChangeListener((buttonView, isChecked) -> {
            settings.setJamendoEnabled(isChecked);
            runDiagnostics();
        });

        View jamendoClientIdRow = findViewById(R.id.row_jamendo_client_id);
        jamendoClientIdRow.setOnClickListener(v -> showJamendoClientIdDialog());
        refreshJamendoClientIdStatus();

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
        refreshJamendoClientIdStatus();
        runDiagnostics();
    }

    @Override
    protected void onDestroy() {
        io.shutdown();
        super.onDestroy();
    }

    // ---------------------------------------------------------------- diagnostics

    /** Updates the "Jamendo client ID" summary line without ever showing the full id. */
    private void refreshJamendoClientIdStatus() {
        String runtime = settings.jamendoClientId();
        if (runtime != null) {
            String masked = runtime.length() <= 4 ? "••••" : "••••" + runtime.substring(runtime.length() - 4);
            jamendoClientIdStatus.setText(getString(R.string.settings_jamendo_client_id_configured, masked));
        } else {
            jamendoClientIdStatus.setText(R.string.settings_jamendo_client_id_missing);
        }
    }

    /** Input dialog for the runtime Jamendo client id (stored on-device only). */
    private void showJamendoClientIdDialog() {
        final android.widget.EditText input = new android.widget.EditText(this);
        input.setHint(R.string.settings_jamendo_client_id_hint);
        input.setSingleLine(true);
        input.setText(settings.jamendoClientId());

        // setView(View,int,int,int,int) is @RestrictTo — wrap in a padded container instead.
        float d = getResources().getDisplayMetrics().density;
        android.widget.LinearLayout wrap = new android.widget.LinearLayout(this);
        wrap.setOrientation(android.widget.LinearLayout.VERTICAL);
        wrap.setPadding((int) (24 * d), (int) (8 * d), (int) (24 * d), 0);
        wrap.addView(input, new android.widget.LinearLayout.LayoutParams(
                android.view.ViewGroup.LayoutParams.MATCH_PARENT,
                android.view.ViewGroup.LayoutParams.WRAP_CONTENT));

        new com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle(R.string.settings_jamendo_client_id_title)
                .setMessage(R.string.settings_jamendo_client_id_message)
                .setView(wrap)
                .setPositiveButton(R.string.settings_jamendo_client_id_save, (dialog, which) -> {
                    settings.setJamendoClientId(input.getText().toString());
                    refreshJamendoClientIdStatus();
                    Toast.makeText(this, R.string.settings_jamendo_client_id_saved, Toast.LENGTH_SHORT).show();
                    runDiagnostics();
                })
                .setNeutralButton(R.string.settings_jamendo_client_id_clear, (dialog, which) -> {
                    settings.setJamendoClientId(null);
                    refreshJamendoClientIdStatus();
                    Toast.makeText(this, R.string.settings_jamendo_client_id_cleared, Toast.LENGTH_SHORT).show();
                    runDiagnostics();
                })
                .setNegativeButton(android.R.string.cancel, null)
                .show();
    }

    private void runDiagnostics() {
        diagYtmStatus.setText(R.string.diag_checking);
        diagJamendoStatus.setText(R.string.diag_checking);

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

        runJamendoDiagnostics();

        if (!settings.youtubeMusicEnabled()) {
            diagYtmStatus.setText(R.string.diag_none);
            return;
        }
        io.execute(() -> {
            // Probe with a REAL search request, not a bare HTTP check: an HTTP 200 with
            // zero parsed results means the API answered but its layout changed (verified
            // in the 2026-10 audit), which users must be able to see.
            String status;
            YouTubeMusicSource probe = new YouTubeMusicSource(new InnertubeClient());
            try {
                List<SearchSection> sections = probe.search("test", 1);
                int results = 0;
                for (SearchSection section : sections) {
                    results += section.tracks.size();
                }
                status = results > 0
                        ? getString(R.string.diag_ytm_ok_results, results)
                        : getString(R.string.diag_ytm_no_data);
            } catch (SourceException e) {
                status = getString(R.string.diag_ytm_failed, e.getMessage());
            } finally {
                probe.shutdown();
            }
            final String statusText = status;
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) return;
                diagYtmStatus.setText(statusText);
            });
        });
    }

    /** WEBLAB-22A: real-search probe of the official Jamendo API with the effective client id. */
    private void runJamendoDiagnostics() {
        if (!settings.jamendoEnabled()) {
            diagJamendoStatus.setText(R.string.diag_none);
            return;
        }
        JamendoSource source = App.locator().jamendoSource();
        if (source.effectiveClientId() == null) {
            diagJamendoStatus.setText(R.string.diag_jamendo_not_configured);
            return;
        }
        io.execute(() -> {
            String status;
            try {
                List<SearchSection> sections = source.search("test", 1);
                int results = 0;
                for (SearchSection section : sections) {
                    results += section.tracks.size();
                }
                status = results > 0
                        ? getString(R.string.diag_jamendo_ok_results, results)
                        : getString(R.string.diag_ytm_no_data);
            } catch (SourceException e) {
                status = getString(R.string.diag_jamendo_failed, e.getMessage());
            }
            final String statusText = status;
            runOnUiThread(() -> {
                if (isFinishing() || isDestroyed()) return;
                diagJamendoStatus.setText(statusText);
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
