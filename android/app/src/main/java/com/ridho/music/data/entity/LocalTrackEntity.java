package com.ridho.music.data.entity;

import androidx.annotation.NonNull;
import androidx.room.ColumnInfo;
import androidx.room.Entity;
import androidx.room.PrimaryKey;

/** Cached metadata for a locally scanned audio file (SAF document). */
@Entity(tableName = "local_tracks")
public class LocalTrackEntity {

    @NonNull
    @PrimaryKey
    @ColumnInfo(name = "id")
    public String id;

    @ColumnInfo(name = "document_uri")
    public String documentUri;

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

    @ColumnInfo(name = "lyrics")
    public String lyrics;

    @ColumnInfo(name = "file_size_bytes")
    public long fileSizeBytes;

    @ColumnInfo(name = "scanned_at_ms")
    public long scannedAtMs;

    @ColumnInfo(name = "track_json")
    public String trackJson;
}
