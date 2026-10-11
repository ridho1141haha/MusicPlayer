package com.ridho.music.ui.fragment;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.TextView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.ridho.music.App;
import com.ridho.music.R;
import com.ridho.music.domain.model.Track;
import com.ridho.music.playback.PlaybackRepository;
import com.ridho.music.source.LocalMusicSource;
import com.ridho.music.ui.MainActivity;
import com.ridho.music.ui.UiPlaybackHost;
import com.ridho.music.ui.adapter.HorizontalTrackAdapter;
import com.ridho.music.ui.adapter.TrackAdapter;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Home: onboarding (folder picker), recently played, favorites, shuffle-all.
 */
public class HomeFragment extends Fragment implements TrackAdapter.Callback {

    private PlaybackRepository playback;
    private LocalMusicSource localSource;

    private View onboardingCard;
    private TextView emptyRecent;
    private TextView emptyFavorites;
    private View recentSection;
    private View favoritesSection;
    private RecyclerView recentList;
    private RecyclerView favoritesList;
    private Button shuffleAll;
    private Button pickFolder;
    private HorizontalTrackAdapter recentAdapter;
    private TrackAdapter favoritesAdapter;

    private final ActivityResultLauncher<Uri> folderPicker =
            registerForActivityResult(new ActivityResultContracts.OpenDocumentTree(), uri -> {
                if (uri == null || getContext() == null) return;
                try {
                    getContext().getContentResolver().takePersistableUriPermission(uri,
                            Intent.FLAG_GRANT_READ_URI_PERMISSION);
                } catch (SecurityException ignored) {
                    // Some providers do not support persistable grants; scanning still
                    // works for this session.
                }
                App.locator().settings().setLocalFolderUri(uri.toString());
                startScan();
            });

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_home, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        playback = App.locator().playback();
        localSource = App.locator().localSource();

        onboardingCard = view.findViewById(R.id.onboarding_card);
        emptyRecent = view.findViewById(R.id.empty_recent);
        emptyFavorites = view.findViewById(R.id.empty_favorites);
        recentSection = view.findViewById(R.id.section_recent);
        favoritesSection = view.findViewById(R.id.section_favorites);
        recentList = view.findViewById(R.id.list_recent);
        favoritesList = view.findViewById(R.id.list_favorites);
        shuffleAll = view.findViewById(R.id.btn_shuffle_all);
        pickFolder = view.findViewById(R.id.btn_pick_folder);
        TextView onboardingBody = view.findViewById(R.id.onboarding_body);
        onboardingBody.setText(getString(R.string.home_onboarding_body) + "\n\n"
                + getString(R.string.local_pick_hint));

        recentList.setLayoutManager(new LinearLayoutManager(getContext(),
                LinearLayoutManager.HORIZONTAL, false));
        recentAdapter = new HorizontalTrackAdapter((track, position) ->
                playFrom(recentAdapter.currentItems(), position));
        recentList.setAdapter(recentAdapter);

        favoritesList.setLayoutManager(new LinearLayoutManager(getContext()));
        favoritesList.setNestedScrollingEnabled(false);
        favoritesAdapter = new TrackAdapter(this);
        favoritesList.setAdapter(favoritesAdapter);

        pickFolder.setOnClickListener(v -> folderPicker.launch(null));
        shuffleAll.setOnClickListener(v -> {
            App.locator().library().getLocalTracks(tracks -> {
                if (tracks.isEmpty() || !isAdded()) return;
                List<Track> shuffled = new ArrayList<>(tracks);
                Collections.shuffle(shuffled);
                UiPlaybackHost host = (UiPlaybackHost) requireActivity();
                host.playWithPermissions(shuffled, 0);
            });
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        refresh();
    }

    private void refresh() {
        if (!isAdded()) return;

        boolean configured = localSource.isConfigured();
        onboardingCard.setVisibility(configured ? View.GONE : View.VISIBLE);
        shuffleAll.setVisibility(configured ? View.VISIBLE : View.GONE);

        App.locator().library().getRecentHistory(12, tracks -> {
            if (!isAdded()) return;
            boolean empty = tracks.isEmpty();
            recentSection.setVisibility(empty ? View.GONE : View.VISIBLE);
            emptyRecent.setVisibility(empty ? View.VISIBLE : View.GONE);
            recentAdapter.submit(tracks);
        });

        App.locator().library().getFavorites(tracks -> {
            if (!isAdded()) return;
            boolean empty = tracks.isEmpty();
            favoritesSection.setVisibility(empty ? View.GONE : View.VISIBLE);
            emptyFavorites.setVisibility(empty ? View.VISIBLE : View.GONE);
            favoritesAdapter.submit(tracks.size() > 10 ? tracks.subList(0, 10) : tracks);
        });
    }

    private void startScan() {
        if (!isAdded()) return;
        pickFolder.setText(R.string.library_scanning);
        pickFolder.setEnabled(false);
        localSource.rescan((count, error) -> {
            if (!isAdded()) return;
            pickFolder.setText(R.string.home_pick_folder);
            pickFolder.setEnabled(true);
            refresh();
        });
    }

    private void playFrom(List<Track> tracks, int position) {
        if (tracks.isEmpty() || !isAdded()) return;
        UiPlaybackHost host = (UiPlaybackHost) requireActivity();
        host.playWithPermissions(new ArrayList<>(tracks), position);
    }

    // TrackAdapter.Callback
    @Override
    public void onTrackClick(@NonNull Track track, int position) {
        playFrom(favoritesAdapter.currentItems(), position);
    }

    @Override
    public void onTrackMenu(@NonNull Track track, @NonNull View anchor) {
        if (getActivity() instanceof AppCompatActivity) {
            com.ridho.music.ui.TrackMenuHelper.showTrackMenu(
                    (AppCompatActivity) getActivity(), anchor, track, playback,
                    false, -1, null);
        }
    }
}
