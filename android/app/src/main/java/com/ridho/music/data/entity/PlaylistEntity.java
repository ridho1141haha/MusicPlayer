package com.ridho.music.data.entity;

import androidx.room.ColumnInfo;
import androidx.room.Entity;
import androidx.room.Index;
import androidx.room.PrimaryKey;

/** A user playlist. */
@Entity(tableName = "playlists", indices = {@Index(value = {"name"}, unique = true)})
public class PlaylistEntity {

    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "id")
    public long id;

    @ColumnInfo(name = "name")
    public String name;

    @ColumnInfo(name = "created_at_ms")
    public long createdAtMs;
}
