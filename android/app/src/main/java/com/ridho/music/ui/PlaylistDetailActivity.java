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
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.google.android.material.dialog.MaterialAlertDialogBuilder;
import com.ridho.music.App;
import com.ridho.music.R;
import com.ridho.music.domain.model.Track;
import com.ridho.music.playback.PlaybackRepository;
import com.ridho.music.ui.adapter.TrackAdapter;

import java.util.ArrayList;

/** Single playlist screen: ordered tracks, remove action, play / shuffle all. */
public class PlaylistDetailActivity extends AppCompatActivity implements TrackAdapter.Callback {

    private static final String EXTRA_PLAYLIST_ID = "playlist_id";
    private static final String EXTRA_PLAYLIST_NAME = "playlist_name";

    private long playlistId;
    private PlaybackRepository playback;
    private final TrackAdapter adapter = new TrackAdapter(this);
    private TextView emptyView;

    public static Intent intent(Context context, long playlistId, String name) {
        Intent intent = new Intent(context, PlaylistDetailActivity.class);
        intent.putExtra(EXTRA_PLAYLIST_ID, playlistId);
        intent.putExtra(EXTRA_PLAYLIST_NAME, name);
        return intent;
    }

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_playlist_detail);
        playlistId = getIntent().getLongExtra(EXTRA_PLAYLIST_ID, -1L);
        String name = getIntent().getStringExtra(EXTRA_PLAYLIST_NAME);
        playback = App.locator().playback();

        setTitle(name == null ? getString(R.string.library_playlists) : name);
        TextView toolbarTitle = findViewById(R.id.pd_title);
        toolbarTitle.setText(name == null ? getString(R.string.library_playlists) : name);

        RecyclerView list = findViewById(R.id.pd_list);
        list.setLayoutManager(new LinearLayoutManager(this));
        list.setAdapter(adapter);
        emptyView = findViewById(R.id.pd_empty);

        ImageButton back = findViewById(R.id.pd_back);
        back.setOnClickListener(v -> finish());
        ImageButton delete = findViewById(R.id.pd_delete);
        delete.setOnClickListener(v -> confirmDelete());
        ImageButton play = findViewById(R.id.pd_play);
        play.setOnClickListener(v -> playAll(false));
        ImageButton shuffle = findViewById(R.id.pd_shuffle);
        shuffle.setOnClickListener(v -> playAll(true));

        reload();
    }

    private void reload() {
        App.locator().library().getPlaylistTracks(playlistId, tracks -> {
            if (isFinishing() || isDestroyed()) return;
            adapter.submit(tracks);
            emptyView.setVisibility(tracks.isEmpty() ? View.VISIBLE : View.GONE);
            emptyView.setText(R.string.playlist_empty);
        });
    }

    private void playAll(boolean shuffle) {
        java.util.List<Track> items = adapter.currentItems();
        if (items.isEmpty()) return;
        int start = 0;
        if (shuffle) {
            items = new ArrayList<>(items);
            java.util.Collections.shuffle(items);
        }
        ((UiPlaybackHost) this).playWithPermissions(items, start);
    }

    private void confirmDelete() {
        new MaterialAlertDialogBuilder(this)
                .setTitle(R.string.playlist_delete)
                .setMessage(R.string.playlist_delete_confirm)
                .setPositiveButton(R.string.playlist_delete, (d, w) -> {
                    App.locator().library().deletePlaylist(playlistId, () -> {
                        if (!isFinishing()) {
                            Toast.makeText(this, R.string.playlist_delete, Toast.LENGTH_SHORT).show();
                            finish();
                        }
                    });
                })
                .setNegativeButton(R.string.playlist_cancel, null)
                .show();
    }

    // TrackAdapter.Callback
    @Override
    public void onTrackClick(Track track, int position) {
        ArrayList<Track> items = new ArrayList<>(adapter.currentItems());
        if (items.isEmpty()) return;
        ((UiPlaybackHost) this).playWithPermissions(items, position);
    }

    @Override
    public void onTrackMenu(Track track, View anchor) {
        TrackMenuHelper.showTrackMenu(this, anchor, track, playback,
                true, playlistId, this::reload);
    }
}
