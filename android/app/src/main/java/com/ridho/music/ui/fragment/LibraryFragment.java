package com.ridho.music.ui.fragment;

import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.TextView;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.chip.Chip;
import com.google.android.material.chip.ChipGroup;
import com.ridho.music.App;
import com.ridho.music.R;
import com.ridho.music.data.entity.PlaylistEntity;
import com.ridho.music.domain.model.Track;
import com.ridho.music.playback.PlaybackRepository;
import com.ridho.music.ui.PlaylistDetailActivity;
import com.ridho.music.ui.TrackMenuHelper;
import com.ridho.music.ui.UiPlaybackHost;
import com.ridho.music.ui.adapter.PlaylistAdapter;
import com.ridho.music.ui.adapter.TrackAdapter;

import java.util.List;

/**
 * Library: favorites, playlists, listening history and scanned local files,
 * selected via chips.
 */
public class LibraryFragment extends Fragment implements TrackAdapter.Callback,
        PlaylistAdapter.Callback {

    private static final int MODE_FAVORITES = 0;
    private static final int MODE_PLAYLISTS = 1;
    private static final int MODE_HISTORY = 2;
    private static final int MODE_LOCAL = 3;
    private static final int MODE_TOP = 4;

    private PlaybackRepository playback;
    private ChipGroup modeChips;
    private RecyclerView listView;
    private TextView emptyText;
    private Button newPlaylist;
    private Button rescan;
    private View progress;

    private final TrackAdapter trackAdapter = new TrackAdapter(this);
    private final PlaylistAdapter playlistAdapter = new PlaylistAdapter(this);

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_library, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        playback = App.locator().playback();

        modeChips = view.findViewById(R.id.mode_chips);
        listView = view.findViewById(R.id.library_list);
        emptyText = view.findViewById(R.id.library_empty);
        newPlaylist = view.findViewById(R.id.btn_new_playlist);
        rescan = view.findViewById(R.id.btn_rescan);
        progress = view.findViewById(R.id.library_progress);

        listView.setLayoutManager(new LinearLayoutManager(getContext()));
        listView.setAdapter(trackAdapter);

        modeChips.setOnCheckedStateChangeListener((group, checkedIds) -> {
            if (checkedIds.isEmpty()) return;
            int id = checkedIds.get(0);
            if (id == R.id.chip_favorites) showMode(MODE_FAVORITES);
            else if (id == R.id.chip_playlists) showMode(MODE_PLAYLISTS);
            else if (id == R.id.chip_history) showMode(MODE_HISTORY);
            else if (id == R.id.chip_local) showMode(MODE_LOCAL);
            else if (id == R.id.chip_top) showMode(MODE_TOP);
        });
        modeChips.check(R.id.chip_favorites);

        newPlaylist.setOnClickListener(v -> {
            if (getActivity() instanceof AppCompatActivity) {
                TrackMenuHelper.promptNewPlaylist((AppCompatActivity) getActivity(),
                        playlistId -> showMode(MODE_PLAYLISTS));
            }
        });

        rescan.setOnClickListener(v -> startRescan());
    }

    @Override
    public void onResume() {
        super.onResume();
        // Re-read the current mode (favorites may have changed elsewhere).
        int checked = modeChips.getCheckedChipId();
        if (checked == R.id.chip_playlists) showMode(MODE_PLAYLISTS);
        else if (checked == R.id.chip_history) showMode(MODE_HISTORY);
        else if (checked == R.id.chip_local) showMode(MODE_LOCAL);
        else if (checked == R.id.chip_top) showMode(MODE_TOP);
        else showMode(MODE_FAVORITES);
    }

    private void showMode(int mode) {
        if (!isAdded()) return;
        newPlaylist.setVisibility(mode == MODE_PLAYLISTS ? View.VISIBLE : View.GONE);
        rescan.setVisibility(mode == MODE_LOCAL ? View.VISIBLE : View.GONE);
        progress.setVisibility(View.GONE);
        emptyText.setVisibility(View.GONE);
        listView.setAdapter(mode == MODE_PLAYLISTS ? playlistAdapter : trackAdapter);
        if (mode != MODE_TOP) trackAdapter.setPlayCounts(null);

        switch (mode) {
            case MODE_PLAYLISTS:
                App.locator().library().getPlaylists(playlists -> {
                    if (!isAdded()) return;
                    playlistAdapter.submit(playlists);
                    showEmptyIf(playlists.isEmpty(), R.string.library_empty_playlists);
                });
                break;
            case MODE_HISTORY:
                App.locator().library().getRecentHistory(200, tracks -> {
                    if (!isAdded()) return;
                    trackAdapter.submit(tracks);
                    showEmptyIf(tracks.isEmpty(), R.string.library_empty_history);
                });
                break;
            case MODE_LOCAL:
                App.locator().library().getLocalTracks(tracks -> {
                    if (!isAdded()) return;
                    trackAdapter.submit(tracks);
                    showEmptyIf(tracks.isEmpty(), R.string.library_empty_local);
                });
                break;
            case MODE_TOP:
                trackAdapter.setPlayCounts(java.util.Collections.emptyMap());
                App.locator().library().getTopTracks(100, result -> {
                    if (!isAdded()) return;
                    trackAdapter.setPlayCounts(result.playCounts);
                    trackAdapter.submit(result.tracks);
                    showEmptyIf(result.tracks.isEmpty(), R.string.library_empty_top);
                });
                break;
            case MODE_FAVORITES:
            default:
                App.locator().library().getFavorites(tracks -> {
                    if (!isAdded()) return;
                    trackAdapter.submit(tracks);
                    showEmptyIf(tracks.isEmpty(), R.string.library_empty_favorites);
                });
                break;
        }
    }

    private void showEmptyIf(boolean empty, int messageRes) {
        emptyText.setVisibility(empty ? View.VISIBLE : View.GONE);
        emptyText.setText(messageRes);
        listView.setVisibility(empty ? View.GONE : View.VISIBLE);
    }

    private void startRescan() {
        if (!isAdded()) return;
        rescan.setEnabled(false);
        progress.setVisibility(View.VISIBLE);
        App.locator().localSource().rescan((count, error) -> {
            if (!isAdded()) return;
            rescan.setEnabled(true);
            progress.setVisibility(View.GONE);
            if (error != null) {
                Toast.makeText(getContext(),
                        getString(R.string.search_state_error), Toast.LENGTH_SHORT).show();
            } else {
                Toast.makeText(getContext(), count + " tracks", Toast.LENGTH_SHORT).show();
            }
            showMode(MODE_LOCAL);
        });
    }

    // TrackAdapter.Callback
    @Override
    public void onTrackClick(@NonNull Track track, int position) {
        if (!isAdded()) return;
        List<Track> items = trackAdapter.currentItems();
        if (items.isEmpty()) return;
        ((UiPlaybackHost) requireActivity()).playWithPermissions(items, position);
    }

    @Override
    public void onTrackMenu(@NonNull Track track, @NonNull View anchor) {
        if (!(getActivity() instanceof AppCompatActivity)) return;
        boolean allowRemove = modeChips.getCheckedChipId() == R.id.chip_playlists;
        // Remove-from-playlist is handled inside PlaylistDetailActivity; the chip list
        // shows the plain menu.
        TrackMenuHelper.showTrackMenu((AppCompatActivity) getActivity(), anchor, track,
                playback, false, -1, this::showModeFromChip);
    }

    private void showModeFromChip() {
        int checked = modeChips.getCheckedChipId();
        if (checked == R.id.chip_playlists) showMode(MODE_PLAYLISTS);
        else if (checked == R.id.chip_history) showMode(MODE_HISTORY);
        else if (checked == R.id.chip_local) showMode(MODE_LOCAL);
        else if (checked == R.id.chip_top) showMode(MODE_TOP);
        else showMode(MODE_FAVORITES);
    }

    // PlaylistAdapter.Callback
    @Override
    public void onPlaylistClick(@NonNull PlaylistEntity playlist) {
        startActivity(PlaylistDetailActivity.intent(requireContext(), playlist.id, playlist.name));
    }

    @Override
    public void onPlaylistLongClick(@NonNull PlaylistEntity playlist, @NonNull View anchor) {
        if (!(getActivity() instanceof AppCompatActivity)) return;
        new com.google.android.material.dialog.MaterialAlertDialogBuilder(requireContext())
                .setTitle(playlist.name)
                .setMessage(R.string.playlist_delete_confirm)
                .setPositiveButton(R.string.playlist_delete, (d, w) ->
                        App.locator().library().deletePlaylist(playlist.id,
                                () -> showMode(MODE_PLAYLISTS)))
                .setNegativeButton(R.string.playlist_cancel, null)
                .show();
    }
}
