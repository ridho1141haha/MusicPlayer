package com.ridho.music.data.entity;

import androidx.annotation.NonNull;
import androidx.room.ColumnInfo;
import androidx.room.Entity;
import androidx.room.ForeignKey;
import androidx.room.Index;

/** Ordered membership of a track inside a playlist. */
@Entity(
        tableName = "playlist_tracks",
        primaryKeys = {"playlist_id", "track_id"},
        indices = {@Index("playlist_id")},
        foreignKeys = @ForeignKey(
                entity = PlaylistEntity.class,
                parentColumns = "id",
                childColumns = "playlist_id",
                onDelete = ForeignKey.CASCADE))
public class PlaylistTrackEntity {

    @ColumnInfo(name = "playlist_id")
    public long playlistId;

    @NonNull
    @ColumnInfo(name = "track_id")
    public String trackId;

    @ColumnInfo(name = "position")
    public int position;

    /** Full track JSON snapshot. */
    @ColumnInfo(name = "track_json")
    public String trackJson;
}
