package com.ridho.music.data.dao;

import androidx.room.Dao;
import androidx.room.Delete;
import androidx.room.Insert;
import androidx.room.OnConflictStrategy;
import androidx.room.Query;

import com.ridho.music.data.entity.SavedTrackEntity;

import java.util.List;

@Dao
public interface SavedTrackDao {

    @Query("SELECT * FROM saved_tracks ORDER BY added_at_ms DESC")
    List<SavedTrackEntity> getAll();

    @Query("SELECT * FROM saved_tracks WHERE id = :trackId")
    SavedTrackEntity getById(String trackId);

    @Query("SELECT COUNT(*) FROM saved_tracks")
    int count();

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void insert(SavedTrackEntity entity);

    @Delete
    void delete(SavedTrackEntity entity);

    @Query("DELETE FROM saved_tracks WHERE id = :trackId")
    void deleteById(String trackId);
}
