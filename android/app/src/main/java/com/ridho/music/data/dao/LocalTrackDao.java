package com.ridho.music.data.dao;

import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.OnConflictStrategy;
import androidx.room.Query;

import com.ridho.music.data.entity.LocalTrackEntity;

import java.util.List;

@Dao
public interface LocalTrackDao {

    @Query("SELECT * FROM local_tracks ORDER BY title COLLATE NOCASE ASC")
    List<LocalTrackEntity> getAll();

    @Query("SELECT COUNT(*) FROM local_tracks")
    int count();

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void insertAll(List<LocalTrackEntity> entities);

    @Query("DELETE FROM local_tracks")
    void clear();
}
