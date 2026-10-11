package com.ridho.music.player;

import android.net.Uri;
import android.os.Bundle;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.ridho.music.domain.model.Track;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

import androidx.media3.common.MediaItem;
import androidx.media3.common.MediaMetadata;

/**
 * Converts between the app's {@link Track} model and Media3 {@link MediaItem}s.
 * The full track travels as a JSON string inside {@link MediaMetadata#getExtras()}
 * so the service, UI and queue persistence can always recover it without extra lookups.
 */
public final class MediaItemConverter {

    public static final String EXTRA_TRACK_JSON = "ridho_track_json";

    private MediaItemConverter() {
    }

    @NonNull
    public static MediaItem toMediaItem(@NonNull Track t) {
        MediaMetadata.Builder md = new MediaMetadata.Builder()
                .setTitle(t.title)
                .setArtist(t.artist);
        if (t.album != null) md.setAlbumTitle(t.album);

        Uri art = artworkUri(t);
        if (art != null) md.setArtworkUri(art);

        Bundle extras = new Bundle();
        extras.putString(EXTRA_TRACK_JSON, t.toJsonString());
        md.setExtras(extras);

        MediaItem.Builder builder = new MediaItem.Builder()
                .setMediaId(t.id)
                .setMediaMetadata(md.build());
        if (t.hasResolvedStream()) {
            builder.setUri(Uri.parse(t.streamUri));
        }
        return builder.build();
    }

    @Nullable
    public static Uri artworkUri(@Nullable Track t) {
        if (t == null) return null;
        if (t.artworkPath != null && !t.artworkPath.isEmpty()) {
            return Uri.fromFile(new File(t.artworkPath));
        }
        // Only ever load HTTPS artwork from remote sources.
        if (t.artworkUrl != null && t.artworkUrl.startsWith("https://")) {
            return Uri.parse(t.artworkUrl);
        }
        return null;
    }

    @Nullable
    public static Track toTrack(@Nullable MediaItem item) {
        if (item == null
                || item.mediaMetadata == null
                || item.mediaMetadata.extras == null) {
            return null;
        }
        return Track.fromJsonString(item.mediaMetadata.extras.getString(EXTRA_TRACK_JSON));
    }

    @NonNull
    public static List<MediaItem> toMediaItems(@NonNull List<Track> tracks) {
        List<MediaItem> out = new ArrayList<>(tracks.size());
        for (Track t : tracks) out.add(toMediaItem(t));
        return out;
    }
}
