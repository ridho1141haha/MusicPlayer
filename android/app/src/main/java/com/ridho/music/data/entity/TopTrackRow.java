package com.ridho.music.data.entity;

/**
 * Projection row for "Top tracks" — play counts aggregated over the history
 * table. Plain POJO returned by a Room query; not an entity. Field names match
 * the query aliases in {@code HistoryDao#getTopTracks}.
 */
public class TopTrackRow {

    @androidx.annotation.NonNull
    public String trackId;

    public int playCount;
}
