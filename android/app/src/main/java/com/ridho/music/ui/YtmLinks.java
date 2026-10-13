package com.ridho.music.ui;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;

import androidx.annotation.Nullable;

import com.ridho.music.domain.model.Track;
import com.ridho.music.source.yt.YtMusicSearchParser;

import java.util.regex.Pattern;

/**
 * FOCUS-YTM-1 — Opens a track in the <b>official</b> YouTube Music app (or any
 * browser when the app is not installed) via a standard HTTPS deep link.
 *
 * <p>This is the compliant "watch it somewhere that actually plays" escape hatch:
 * YouTube blocks third-party stream playback for unauthenticated clients, and
 * Ridho Music deliberately does not bypass that. Deep linking into the official
 * app is plain Android integration — no extraction, no bypass.</p>
 */
public final class YtmLinks {

    /** Official YouTube Music Android package (used as a deep-link preference hint). */
    public static final String YTM_PACKAGE = "com.google.android.apps.youtube.music";

    /** Defensive: video ids are URL-safe base64-ish; accept 8-16 chars, no separators. */
    private static final Pattern VIDEO_ID = Pattern.compile("[A-Za-z0-9_-]{8,16}");

    private YtmLinks() {
    }

    /** Extracts the YouTube video id from a YTM track id ({@code ytm:<videoId>}), or null. */
    @Nullable
    public static String videoIdFromTrackId(@Nullable String trackId) {
        if (trackId == null) return null;
        if (!trackId.startsWith(YtMusicSearchParser.ID_PREFIX_SONG)) return null;
        String videoId = trackId.substring(YtMusicSearchParser.ID_PREFIX_SONG.length());
        if (!VIDEO_ID.matcher(videoId).matches()) return null;
        return videoId;
    }

    /** Convenience overload for tracks. */
    @Nullable
    public static String videoIdOf(@Nullable Track track) {
        if (track == null || !Track.SOURCE_YTM.equals(track.sourceId)) return null;
        return videoIdFromTrackId(track.id);
    }

    /** Canonical watch URL on music.youtube.com (app links route it into the official app). */
    public static String watchUrl(String videoId) {
        return "https://music.youtube.com/watch?v=" + videoId;
    }

    /**
     * Opens the track: prefers the official YouTube Music app, falls back to any
     * browser. Returns false only if no app at all can handle the link.
     */
    public static boolean openTrack(Activity activity, String trackId) {
        String videoId = videoIdFromTrackId(trackId);
        if (videoId == null) return false;
        Uri uri = Uri.parse(watchUrl(videoId));

        Intent inYtmApp = new Intent(Intent.ACTION_VIEW, uri);
        inYtmApp.setPackage(YTM_PACKAGE);
        try {
            activity.startActivity(inYtmApp);
            return true;
        } catch (ActivityNotFoundException appMissing) {
            Intent inAnyApp = new Intent(Intent.ACTION_VIEW, uri);
            try {
                activity.startActivity(inAnyApp);
                return true;
            } catch (Exception nothingHandlesIt) {
                return false;
            }
        }
    }
}
