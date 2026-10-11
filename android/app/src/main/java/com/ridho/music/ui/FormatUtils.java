package com.ridho.music.ui;

import android.content.Context;

import androidx.annotation.NonNull;

import java.util.Locale;

/** Small formatting helpers shared by adapters and the Now Playing screen. */
public final class FormatUtils {

    private FormatUtils() {
    }

    /** Formats milliseconds as m:ss or h:mm:ss; "--:--" when unknown. */
    @NonNull
    public static String formatDuration(long ms) {
        if (ms <= 0L) return "--:--";
        long totalSeconds = ms / 1000L;
        long hours = totalSeconds / 3600L;
        long minutes = (totalSeconds % 3600L) / 60L;
        long seconds = totalSeconds % 60L;
        if (hours > 0) {
            return String.format(Locale.US, "%d:%02d:%02d", hours, minutes, seconds);
        }
        return String.format(Locale.US, "%d:%02d", minutes, seconds);
    }

    /** Human byte counts for the diagnostics screen. */
    @NonNull
    public static String formatBytes(long bytes) {
        if (bytes < 1024L) return bytes + " B";
        double kb = bytes / 1024.0;
        if (kb < 1024.0) return String.format(Locale.US, "%.1f KB", kb);
        double mb = kb / 1024.0;
        return String.format(Locale.US, "%.1f MB", mb);
    }

    /** Robust application versionName via PackageManager (BuildConfig is disabled by default in AGP 8). */
    @NonNull
    public static String appVersion(@NonNull Context context) {
        try {
            return context.getPackageManager()
                    .getPackageInfo(context.getPackageName(), 0)
                    .versionName;
        } catch (Exception e) {
            return "unknown";
        }
    }
}
