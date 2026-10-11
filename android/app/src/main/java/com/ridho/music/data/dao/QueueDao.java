package com.ridho.music.data.dao;

import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.OnConflictStrategy;
import androidx.room.Query;

import com.ridho.music.data.entity.QueuedTrackEntity;

import java.util.List;

@Dao
public interface QueueDao {

    @Query("SELECT * FROM queued_tracks ORDER BY position ASC")
    List<QueuedTrackEntity> getAll();

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void insertAll(List<QueuedTrackEntity> entities);

    @Query("DELETE FROM queued_tracks")
    void clear();

    @Query("SELECT COUNT(*) FROM queued_tracks")
    int count();
}
