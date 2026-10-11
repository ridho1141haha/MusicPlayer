package com.ridho.music.data.entity;

import androidx.room.ColumnInfo;
import androidx.room.Entity;
import androidx.room.PrimaryKey;

/** Persisted play queue used to restore the last session (paused) after a process restart. */
@Entity(tableName = "queued_tracks")
public class QueuedTrackEntity {

    @PrimaryKey
    @ColumnInfo(name = "position")
    public int position;

    @ColumnInfo(name = "track_id")
    public String trackId;

    @ColumnInfo(name = "track_json")
    public String trackJson;
}
