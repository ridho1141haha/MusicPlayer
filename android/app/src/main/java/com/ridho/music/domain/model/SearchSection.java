package com.ridho.music.domain.model;

import java.util.Collections;
import java.util.List;

/** A titled group of results returned by a {@link com.ridho.music.domain.source.MusicSource} search. */
public class SearchSection {

    public final String title;
    public final List<Track> tracks;

    public SearchSection(String title, List<Track> tracks) {
        this.title = title;
        this.tracks = tracks == null ? Collections.emptyList() : tracks;
    }

    public boolean isEmpty() {
        return tracks.isEmpty();
    }
}
