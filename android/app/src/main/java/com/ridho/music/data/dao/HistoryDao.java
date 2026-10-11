package com.ridho.music.data.dao;

import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.Query;

import com.ridho.music.data.entity.HistoryEntity;
import com.ridho.music.data.entity.TopTrackRow;

import java.util.List;

@Dao
public interface HistoryDao {

    @Query("SELECT * FROM history ORDER BY played_at_ms DESC LIMIT :limit")
    List<HistoryEntity> getRecent(int limit);

    @Query("SELECT track_id AS trackId, COUNT(*) AS playCount FROM history "
            + "GROUP BY track_id ORDER BY playCount DESC LIMIT :limit")
    List<TopTrackRow> getTopTracks(int limit);

    @Query("SELECT track_json FROM history WHERE track_id = :trackId "
            + "ORDER BY played_at_ms DESC LIMIT 1")
    String getLatestTrackJson(String trackId);

    @Query("SELECT COUNT(*) FROM history WHERE track_id = :trackId")
    int countPlays(String trackId);

    @Query("SELECT played_at_ms FROM history WHERE track_id = :trackId ORDER BY played_at_ms DESC LIMIT 1")
    Long getLastPlayedAt(String trackId);

    @Insert
    void insert(HistoryEntity entity);

    @Query("DELETE FROM history")
    void clear();
}
