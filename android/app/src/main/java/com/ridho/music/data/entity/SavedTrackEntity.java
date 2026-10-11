package com.ridho.music.data.entity;

import androidx.annotation.NonNull;
import androidx.room.ColumnInfo;
import androidx.room.Entity;
import androidx.room.PrimaryKey;

/**
 * A favorite track. Columns mirror {@link com.ridho.music.domain.model.Track} fields;
 * a full JSON snapshot is also kept as a resilient fallback.
 */
@Entity(tableName = "saved_tracks")
public class SavedTrackEntity {

    @NonNull
    @PrimaryKey
    @ColumnInfo(name = "id")
    public String id;

    @ColumnInfo(name = "source_id")
    public String sourceId;

    @ColumnInfo(name = "title")
    public String title;

    @ColumnInfo(name = "artist")
    public String artist;

    @ColumnInfo(name = "album")
    public String album;

    @ColumnInfo(name = "duration_ms")
    public long durationMs;

    @ColumnInfo(name = "artwork_path")
    public String artworkPath;

    @ColumnInfo(name = "artwork_url")
    public String artworkUrl;

    @ColumnInfo(name = "stream_uri")
    public String streamUri;

    @ColumnInfo(name = "lyrics")
    public String lyrics;

    @ColumnInfo(name = "added_at_ms")
    public long addedAtMs;

    @ColumnInfo(name = "track_json")
    public String trackJson;
}
