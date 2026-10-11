package com.ridho.music.ui;

import android.app.AlertDialog;
import android.view.View;
import android.widget.PopupMenu;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

import com.ridho.music.App;
import com.ridho.music.R;
import com.ridho.music.data.entity.PlaylistEntity;
import com.ridho.music.domain.model.Track;
import com.ridho.music.playback.PlaybackRepository;
import com.ridho.music.ui.fragment.LibraryFragment;

import java.util.List;

/**
 * Shared context-menu logic for track rows ("add to queue", "add to playlist",
 * contextual removal). Used by every adapter that shows tracks.
 */
public final class TrackMenuHelper {

    public interface OnPlaylistChanged {
        void onPlaylistMutated();
    }

    private TrackMenuHelper() {
    }

    public static void showTrackMenu(@NonNull AppCompatActivity activity,
                                     @NonNull View anchor,
                                     @NonNull Track track,
                                     @NonNull PlaybackRepository playback,
                                     boolean allowRemoveFromPlaylist,
                                     long playlistId,
                                     OnPlaylistChanged onChanged) {
        PopupMenu popup = new PopupMenu(activity, anchor);
        popup.getMenuInflater().inflate(R.menu.menu_track, popup.getMenu());
        popup.getMenu().findItem(R.id.action_remove_from_playlist).setVisible(allowRemoveFromPlaylist);

        popup.setOnMenuItemClickListener(item -> {
            int id = item.getItemId();
            if (id == R.id.action_add_to_queue) {
                playback.addToQueue(track);
                return true;
            } else if (id == R.id.action_add_to_playlist) {
                showAddToPlaylistDialog(activity, track, onChanged);
                return true;
            } else if (id == R.id.action_remove_from_playlist) {
                App.locator().library().removeFromPlaylist(playlistId, track.id,
                        () -> {
                            if (onChanged != null) onChanged.onPlaylistMutated();
                        });
                return true;
            }
            return false;
        });
        popup.show();
    }

    public static void showAddToPlaylistDialog(@NonNull AppCompatActivity activity,
                                               @NonNull Track track,
                                               OnPlaylistChanged onChanged) {
        App.locator().library().getPlaylists(playlists ->
                new AlertDialog.Builder(activity)
                        .setTitle(R.string.menu_add_to_playlist)
                        .setItems(playlistNames(activity, playlists), (dialog, which) -> {
                            if (which == playlists.size()) {
                                promptNewPlaylistAndAdd(activity, track, onChanged);
                            } else {
                                App.locator().library().addToPlaylist(
                                        playlists.get(which).id, track,
                                        () -> {
                                            if (onChanged != null) onChanged.onPlaylistMutated();
                                        });
                            }
                        })
                        .show());
    }

    /** Opens the "new playlist" flow and, once created, adds the track to it. */
    public static void promptNewPlaylistAndAdd(@NonNull AppCompatActivity activity,
                                               @NonNull Track track,
                                               OnPlaylistChanged onChanged) {
        promptNewPlaylist(activity, playlistId ->
                App.locator().library().addToPlaylist(playlistId, track,
                        () -> {
                            if (onChanged != null) onChanged.onPlaylistMutated();
                        }));
    }

    /** Standard "create playlist" name prompt; returns id via callback. */
    public static void promptNewPlaylist(@NonNull AppCompatActivity activity,
                                         @NonNull java.util.function.Consumer<Long> onCreated) {
        final android.widget.EditText input = new android.widget.EditText(activity);
        input.setHint(R.string.playlist_name_hint);
        input.setSingleLine(true);
        int pad = (int) (16 * activity.getResources().getDisplayMetrics().density);
        android.widget.FrameLayout container = new android.widget.FrameLayout(activity);
        container.setPadding(pad, pad, pad, 0);
        container.addView(input);

        new AlertDialog.Builder(activity)
                .setTitle(R.string.playlist_new_title)
                .setView(container)
                .setPositiveButton(R.string.playlist_create, (dialog, which) -> {
                    String name = input.getText().toString().trim();
                    if (name.isEmpty()) return;
                    App.locator().library().createPlaylist(name, onCreated::accept);
                })
                .setNegativeButton(R.string.playlist_cancel, null)
                .show();
    }

    private static String[] playlistNames(android.content.Context context, List<PlaylistEntity> playlists) {
        String[] names = new String[playlists.size() + 1];
        for (int i = 0; i < playlists.size(); i++) names[i] = playlists.get(i).name;
        names[playlists.size()] = context.getString(R.string.library_create_playlist);
        return names;
    }
}
