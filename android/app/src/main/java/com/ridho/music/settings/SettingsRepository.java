package com.ridho.music.settings;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.annotation.Nullable;

/**
 * Small typed wrapper around SharedPreferences. No sensitive data is ever stored:
 * the app has no accounts, no tokens and no passwords.
 */
public class SettingsRepository {

    private static final String PREFS = "ridho_settings";

    private final SharedPreferences prefs;

    public SettingsRepository(Context context) {
        this.prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** SAF tree URI of the user-chosen local music folder (persisted permission), or null. */
    @Nullable
    public String localFolderUri() {
        return prefs.getString("local_folder_uri", null);
    }

    public void setLocalFolderUri(@Nullable String uri) {
        SharedPreferences.Editor e = prefs.edit().putString("local_folder_uri", uri);
        if (uri == null) e.remove("local_folder_uri");
        e.apply();
    }

    public boolean youtubeMusicEnabled() {
        return prefs.getBoolean("ytm_enabled", true);
    }

    public void setYoutubeMusicEnabled(boolean enabled) {
        prefs.edit().putBoolean("ytm_enabled", enabled).apply();
    }

    // ---------------------------------------------------------------- Jamendo (WEBLAB-22A)

    /**
     * Runtime Jamendo client id entered by the user in Settings, or null when unset.
     * Takes precedence over the build-time {@code BuildConfig.JAMENDO_CLIENT_ID} default.
     * A client id is an application identifier (not a secret) — it travels in every
     * Jamendo API URL by design — but Ridho Music still treats it as config data:
     * it is never written to logs.
     */
    @Nullable
    public String jamendoClientId() {
        String v = prefs.getString("jamendo_client_id", null);
        if (v == null) return null;
        v = v.trim();
        return v.isEmpty() ? null : v;
    }

    public void setJamendoClientId(@Nullable String clientId) {
        SharedPreferences.Editor e = prefs.edit();
        if (clientId == null || clientId.trim().isEmpty()) {
            e.remove("jamendo_client_id");
        } else {
            e.putString("jamendo_client_id", clientId.trim());
        }
        e.apply();
    }

    /** Whether the Jamendo source participates in search (default: on). */
    public boolean jamendoEnabled() {
        return prefs.getBoolean("jamendo_enabled", true);
    }

    public void setJamendoEnabled(boolean enabled) {
        prefs.edit().putBoolean("jamendo_enabled", enabled).apply();
    }

    // ---------------------------------------------------------------- Audius (AUDIUS-ANDROID-1)

    /** Whether the Audius source participates in search (default: on). */
    public boolean audiusEnabled() {
        return prefs.getBoolean("audius_enabled", true);
    }

    public void setAudiusEnabled(boolean enabled) {
        prefs.edit().putBoolean("audius_enabled", enabled).apply();
    }

    public boolean skipSilence() {
        return prefs.getBoolean("skip_silence", false);
    }

    public void setSkipSilence(boolean enabled) {
        prefs.edit().putBoolean("skip_silence", enabled).apply();
    }

    public boolean restoreQueueOnLaunch() {
        return prefs.getBoolean("restore_queue", true);
    }

    public void setRestoreQueueOnLaunch(boolean enabled) {
        prefs.edit().putBoolean("restore_queue", enabled).apply();
    }

    /** Index of the current item in the persisted queue (-1 when none). */
    public int persistedQueueIndex() {
        return prefs.getInt("queue_index", -1);
    }

    /** Persisted playback position within the current item (ms). */
    public long persistedQueuePositionMs() {
        return prefs.getLong("queue_position_ms", 0L);
    }

    public void persistQueueState(int index, long positionMs) {
        prefs.edit().putInt("queue_index", index).putLong("queue_position_ms", positionMs).apply();
    }

    public void clearQueueState() {
        prefs.edit().remove("queue_index").remove("queue_position_ms").apply();
    }

    /** Remembered playback speed (0.5–2.0); applied when the player is created. */
    public float playbackSpeed() {
        return prefs.getFloat("playback_speed", 1.0f);
    }

    public void setPlaybackSpeed(float speed) {
        prefs.edit().putFloat("playback_speed", speed).apply();
    }
}
