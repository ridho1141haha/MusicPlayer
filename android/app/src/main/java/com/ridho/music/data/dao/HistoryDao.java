package com.ridho.music.data.dao;

import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.Query;

import com.ridho.music.data.entity.HistoryEntity;

import java.util.List;

@Dao
public interface HistoryDao {

    @Query("SELECT * FROM history ORDER BY played_at_ms DESC LIMIT :limit")
    List<HistoryEntity> getRecent(int limit);

    @Query("SELECT played_at_ms FROM history WHERE track_id = :trackId ORDER BY played_at_ms DESC LIMIT 1")
    Long getLastPlayedAt(String trackId);

    @Insert
    void insert(HistoryEntity entity);

    @Query("DELETE FROM history")
    void clear();
}
