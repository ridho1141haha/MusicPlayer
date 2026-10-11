package com.ridho.music.data.dao;

import androidx.room.Dao;
import androidx.room.Insert;
import androidx.room.OnConflictStrategy;
import androidx.room.Query;

import com.ridho.music.data.entity.PlaylistEntity;
import com.ridho.music.data.entity.PlaylistTrackEntity;

import java.util.List;

@Dao
public interface PlaylistDao {

    @Query("SELECT * FROM playlists ORDER BY created_at_ms DESC")
    List<PlaylistEntity> getAll();

    @Query("SELECT * FROM playlists WHERE id = :id")
    PlaylistEntity getById(long id);

    @Insert
    long insert(PlaylistEntity entity);

    @Query("DELETE FROM playlists WHERE id = :id")
    void deleteById(long id);

    @Query("SELECT * FROM playlist_tracks WHERE playlist_id = :playlistId ORDER BY position ASC")
    List<PlaylistTrackEntity> getTracks(long playlistId);

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    void insertTrack(PlaylistTrackEntity entity);

    @Query("SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id = :playlistId")
    int countTracks(long playlistId);

    @Query("DELETE FROM playlist_tracks WHERE playlist_id = :playlistId AND track_id = :trackId")
    void removeTrack(long playlistId, String trackId);

    @Query("SELECT MAX(position) FROM playlist_tracks WHERE playlist_id = :playlistId")
    Integer maxPosition(long playlistId);
}
