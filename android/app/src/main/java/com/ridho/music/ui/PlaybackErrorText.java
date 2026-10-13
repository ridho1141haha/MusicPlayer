package com.ridho.music.ui;

import android.content.Context;

import com.ridho.music.R;
import com.ridho.music.domain.model.Track;
import com.ridho.music.domain.source.SourceException;
import com.ridho.music.playback.PlaybackErrorInfo;

/**
 * FOCUS-YTM-1 — Maps a {@link PlaybackErrorInfo} to one honest, user-facing
 * sentence. Kept separate from activities so the mapping has a single home and
 * the app speaks with one voice about YouTube's gating.
 */
public final class PlaybackErrorText {

    private PlaybackErrorText() {
    }

    /** Builds the user-facing message for a playback failure. Never includes URLs. */
    public static String message(Context context, PlaybackErrorInfo info) {
        if (info == null) return context.getString(R.string.err_playback);

        // FOCUS-YTM-3: the watchdog synthesized timeout — applies to any source.
        if (PlaybackErrorInfo.KIND_TIMEOUT.equals(info.kind)) {
            return context.getString(R.string.err_playback_no_response);
        }
        // FOCUS-YTM-4: items arrived but audio never started — the honest stuck case.
        if (PlaybackErrorInfo.KIND_STALLED.equals(info.kind)) {
            return context.getString(R.string.err_playback_stalled);
        }

        if (Track.SOURCE_YTM.equals(info.sourceId)) {
            if (SourceException.Kind.UNAVAILABLE.name().equals(info.kind)) {
                return context.getString(R.string.err_playback_ytm_gated);
            }
            if (SourceException.Kind.UNSUPPORTED.name().equals(info.kind)) {
                return context.getString(R.string.err_playback_ytm_catalog);
            }
            if (SourceException.Kind.CONFIGURATION_REQUIRED.name().equals(info.kind)) {
                return context.getString(R.string.err_playback_ytm_signin);
            }
        }

        if (SourceException.Kind.NETWORK.name().equals(info.kind)) {
            return context.getString(R.string.err_network);
        }
        if (SourceException.Kind.UNAVAILABLE.name().equals(info.kind)) {
            return context.getString(R.string.err_unavailable);
        }
        if (SourceException.Kind.UNSUPPORTED.name().equals(info.kind)) {
            return context.getString(R.string.err_unsupported);
        }
        if (SourceException.Kind.NOT_FOUND.name().equals(info.kind)) {
            return context.getString(R.string.err_not_found);
        }
        if (SourceException.Kind.CONFIGURATION_REQUIRED.name().equals(info.kind)) {
            return context.getString(R.string.err_config_required);
        }
        return context.getString(R.string.err_playback);
    }
}
