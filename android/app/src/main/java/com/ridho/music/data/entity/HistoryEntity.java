package com.ridho.music.data.entity;

import androidx.room.ColumnInfo;
import androidx.room.Entity;
import androidx.room.PrimaryKey;

/** One row per playback transition — powers "Recently played" and the History list. */
@Entity(tableName = "history")
public class HistoryEntity {

    @PrimaryKey(autoGenerate = true)
    @ColumnInfo(name = "row_id")
    public long rowId;

    @ColumnInfo(name = "track_id")
    public String trackId;

    @ColumnInfo(name = "title")
    public String title;

    @ColumnInfo(name = "artist")
    public String artist;

    @ColumnInfo(name = "played_at_ms")
    public long playedAtMs;

    /** Full track JSON snapshot so the entry survives even if the source disappears. */
    @ColumnInfo(name = "track_json")
    public String trackJson;
}
