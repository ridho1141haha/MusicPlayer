package com.ridho.music.data.db;

import android.content.Context;

import androidx.room.Database;
import androidx.room.Room;
import androidx.room.RoomDatabase;

import com.ridho.music.data.dao.HistoryDao;
import com.ridho.music.data.dao.LocalTrackDao;
import com.ridho.music.data.dao.PlaylistDao;
import com.ridho.music.data.dao.QueueDao;
import com.ridho.music.data.dao.SavedTrackDao;
import com.ridho.music.data.entity.HistoryEntity;
import com.ridho.music.data.entity.LocalTrackEntity;
import com.ridho.music.data.entity.PlaylistEntity;
import com.ridho.music.data.entity.PlaylistTrackEntity;
import com.ridho.music.data.entity.QueuedTrackEntity;
import com.ridho.music.data.entity.SavedTrackEntity;

/** Room database. All access is funneled through repositories on background executors. */
@Database(
        entities = {
                SavedTrackEntity.class,
                HistoryEntity.class,
                PlaylistEntity.class,
                PlaylistTrackEntity.class,
                QueuedTrackEntity.class,
                LocalTrackEntity.class
        },
        version = 1,
        exportSchema = false)
public abstract class AppDatabase extends RoomDatabase {

    private static final String DB_NAME = "ridho-music.db";

    private static volatile AppDatabase instance;

    public abstract SavedTrackDao savedTrackDao();

    public abstract HistoryDao historyDao();

    public abstract PlaylistDao playlistDao();

    public abstract QueueDao queueDao();

    public abstract LocalTrackDao localTrackDao();

    public static AppDatabase get(Context context) {
        if (instance == null) {
            synchronized (AppDatabase.class) {
                if (instance == null) {
                    instance = Room.databaseBuilder(
                                    context.getApplicationContext(), AppDatabase.class, DB_NAME)
                            .fallbackToDestructiveMigration()
                            .build();
                }
            }
        }
        return instance;
    }
}
