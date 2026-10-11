package com.ridho.music.ui.fragment;

import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.view.inputmethod.EditorInfo;
import android.widget.EditText;
import android.widget.ImageButton;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;
import androidx.fragment.app.Fragment;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import com.ridho.music.App;
import com.ridho.music.R;
import com.ridho.music.domain.model.SearchSection;
import com.ridho.music.domain.model.Track;
import com.ridho.music.domain.source.MusicSource;
import com.ridho.music.domain.source.SourceException;
import com.ridho.music.playback.PlaybackRepository;
import com.ridho.music.ui.adapter.SearchResultsAdapter;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Unified search across all browsable sources (local library + experimental
 * YouTube Music). Shows loading / empty / typed error states.
 */
public class SearchFragment extends Fragment implements SearchResultsAdapter.Callback {

    private static final long SEARCH_DEBOUNCE_MS = 350L;

    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final AtomicInteger generation = new AtomicInteger();

    private EditText searchInput;
    private View loadingState;
    private View errorState;
    private View emptyState;
    private TextView errorText;
    private RecyclerView resultsList;
    private SearchResultsAdapter adapter;
    private PlaybackRepository playback;
    private Runnable pendingSearch;

    @Nullable
    @Override
    public View onCreateView(@NonNull LayoutInflater inflater, @Nullable ViewGroup container,
                             @Nullable Bundle savedInstanceState) {
        return inflater.inflate(R.layout.fragment_search, container, false);
    }

    @Override
    public void onViewCreated(@NonNull View view, @Nullable Bundle savedInstanceState) {
        super.onViewCreated(view, savedInstanceState);
        playback = App.locator().playback();

        searchInput = view.findViewById(R.id.search_input);
        loadingState = view.findViewById(R.id.state_loading);
        errorState = view.findViewById(R.id.state_error);
        emptyState = view.findViewById(R.id.state_empty);
        errorText = view.findViewById(R.id.error_text);
        resultsList = view.findViewById(R.id.results_list);
        ImageButton clearButton = view.findViewById(R.id.search_clear);

        resultsList.setLayoutManager(new LinearLayoutManager(getContext()));
        adapter = new SearchResultsAdapter(this);
        resultsList.setAdapter(adapter);

        clearButton.setOnClickListener(v -> {
            searchInput.setText("");
            showIdle();
        });

        searchInput.setOnEditorActionListener((v, actionId, event) -> {
            if (actionId == EditorInfo.IME_ACTION_SEARCH) {
                submitSearch();
                return true;
            }
            return false;
        });

        // Debounced live search.
        searchInput.addTextChangedListener(new android.text.TextWatcher() {
            @Override public void beforeTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void onTextChanged(CharSequence s, int a, int b, int c) { }
            @Override public void afterTextChanged(android.text.Editable s) {
                if (pendingSearch != null) mainHandler.removeCallbacks(pendingSearch);
                String q = s.toString().trim();
                if (q.isEmpty()) {
                    showIdle();
                    return;
                }
                pendingSearch = SearchFragment.this::submitSearch;
                mainHandler.postDelayed(pendingSearch, SEARCH_DEBOUNCE_MS);
            }
        });

        showIdle();
    }

    private void showIdle() {
        loadingState.setVisibility(View.GONE);
        errorState.setVisibility(View.GONE);
        emptyState.setVisibility(View.GONE);
        resultsList.setVisibility(View.GONE);
        adapter.submit(new ArrayList<>(), false);
    }

    private void submitSearch() {
        if (!isAdded()) return;
        final String query = searchInput.getText().toString().trim();
        if (query.isEmpty()) return;

        final int gen = generation.incrementAndGet();
        loadingState.setVisibility(View.VISIBLE);
        errorState.setVisibility(View.GONE);
        emptyState.setVisibility(View.GONE);
        resultsList.setVisibility(View.GONE);

        executor.execute(() -> {
            List<SearchResultsAdapter.Row> rows = new ArrayList<>();
            List<String> errors = new ArrayList<>();
            boolean ytmPresent = false;
            for (MusicSource source : App.locator().browsableSources()) {
                if (gen != generation.get()) return; // stale
                try {
                    List<SearchSection> sections = source.search(query, 10);
                    for (SearchSection section : sections) {
                        if (section.isEmpty()) continue;
                        if (Track.SOURCE_YTM.equals(source.id())) ytmPresent = true;
                        rows.add(SearchResultsAdapter.Row.header(section.title));
                        int count = 0;
                        for (Track t : section.tracks) {
                            rows.add(SearchResultsAdapter.Row.track(t));
                            if (++count >= 8) break;
                        }
                    }
                } catch (SourceException e) {
                    errors.add(source.displayName() + ": " + e.getMessage());
                }
            }
            final boolean finalYtm = ytmPresent;
            if (isAdded()) {
                mainHandler.post(() -> {
                    if (!isAdded() || gen != generation.get()) return;
                    loadingState.setVisibility(View.GONE);
                    if (!errors.isEmpty() && rows.isEmpty()) {
                        errorState.setVisibility(View.VISIBLE);
                        errorText.setText(String.join("\n", errors));
                    } else if (rows.isEmpty()) {
                        emptyState.setVisibility(View.VISIBLE);
                    } else {
                        resultsList.setVisibility(View.VISIBLE);
                        adapter.submit(rows, finalYtm);
                    }
                });
            }
        });
    }

    // SearchResultsAdapter.Callback
    @Override
    public void onRowClick(@NonNull Track track, int position) {
        // Play just this track; user can extend the queue from the track menu.
        if (getActivity() instanceof com.ridho.music.ui.UiPlaybackHost) {
            List<Track> single = new ArrayList<>();
            single.add(track);
            ((com.ridho.music.ui.UiPlaybackHost) getActivity()).playWithPermissions(single, 0);
        }
    }

    @Override
    public void onRowMenu(@NonNull Track track, @NonNull View anchor) {
        if (getActivity() instanceof androidx.appcompat.app.AppCompatActivity) {
            com.ridho.music.ui.TrackMenuHelper.showTrackMenu(
                    (androidx.appcompat.app.AppCompatActivity) getActivity(), anchor, track,
                    playback, false, -1, null);
        }
    }

    @Override
    public void onDestroyView() {
        generation.incrementAndGet(); // cancel in-flight work
        executor.shutdown();
        super.onDestroyView();
    }
}
