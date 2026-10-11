package com.ridho.music.data.repository;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import com.ridho.music.data.db.AppDatabase;
import com.ridho.music.data.entity.HistoryEntity;
import com.ridho.music.data.entity.LocalTrackEntity;
import com.ridho.music.data.entity.PlaylistEntity;
import com.ridho.music.data.entity.PlaylistTrackEntity;
import com.ridho.music.data.entity.QueuedTrackEntity;
import com.ridho.music.data.entity.SavedTrackEntity;
import com.ridho.music.domain.model.Track;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Repository owning all persistent library data (favorites, history, playlists,
 * queue snapshot, scanned local tracks). All Room access happens on a single
 * background executor; results are delivered on the main thread through callbacks.
 */
public class LibraryRepository {

    /** Callbacks invoked on the main thread. */
    public interface Callback<T> {
        void onResult(T value);
    }

    private final AppDatabase db;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler main = new Handler(Looper.getMainLooper());

    public LibraryRepository(Context context) {
        this.db = AppDatabase.get(context.getApplicationContext());
    }

    // ---------- mapping ----------

    private static SavedTrackEntity toSavedEntity(Track t) {
        SavedTrackEntity e = new SavedTrackEntity();
        e.id = t.id;
        e.sourceId = t.sourceId;
        e.title = t.title;
        e.artist = t.artist;
        e.album = t.album;
        e.durationMs = t.durationMs;
        e.artworkPath = t.artworkPath;
        e.artworkUrl = t.artworkUrl;
        e.streamUri = t.streamUri;
        e.lyrics = t.lyrics;
        e.addedAtMs = t.addedAtMs;
        e.trackJson = t.toJsonString();
        return e;
    }

    private static Track savedEntityToTrack(SavedTrackEntity e) {
        Track fromJson = Track.fromJsonString(e.trackJson);
        if (fromJson != null) return fromJson;
        return new Track(e.id, e.sourceId, e.title, e.artist, e.album, e.durationMs,
                e.artworkPath, e.artworkUrl, e.streamUri, e.lyrics, e.addedAtMs);
    }

    private static Track jsonToTrack(@Nullable String json) {
        return Track.fromJsonString(json);
    }

    // ---------- favorites ----------

    public void getFavorites(final Callback<List<Track>> callback) {
        executor.execute(() -> {
            List<SavedTrackEntity> rows = db.savedTrackDao().getAll();
            List<Track> out = new ArrayList<>(rows.size());
            for (SavedTrackEntity e : rows) out.add(savedEntityToTrack(e));
            main.post(() -> callback.onResult(out));
        });
    }

    public void isFavorite(String trackId, final Callback<Boolean> callback) {
        executor.execute(() -> {
            boolean fav = db.savedTrackDao().getById(trackId) != null;
            main.post(() -> callback.onResult(fav));
        });
    }

    public void setFavorite(Track track, boolean favorite, final Callback<Boolean> callback) {
        executor.execute(() -> {
            if (favorite) {
                Track stamped = new Track(track.id, track.sourceId, track.title, track.artist,
                        track.album, track.durationMs, track.artworkPath, track.artworkUrl,
                        track.streamUri, track.lyrics, System.currentTimeMillis());
                db.savedTrackDao().insert(toSavedEntity(stamped));
            } else {
                db.savedTrackDao().deleteById(track.id);
            }
            main.post(() -> callback.onResult(favorite));
        });
    }

    // ---------- history ----------

    /** Records a playback event. Rate-limited: same track within 30 s is not recorded twice. */
    public void addHistory(Track track) {
        executor.execute(() -> {
            Long last = db.historyDao().getLastPlayedAt(track.id);
            long now = System.currentTimeMillis();
            if (last != null && now - last < 30_000L) return;
            HistoryEntity e = new HistoryEntity();
            e.trackId = track.id;
            e.title = track.title;
            e.artist = track.artist;
            e.playedAtMs = now;
            e.trackJson = track.toJsonString();
            db.historyDao().insert(e);
        });
    }

    public void getRecentHistory(int limit, final Callback<List<Track>> callback) {
        executor.execute(() -> {
            List<HistoryEntity> rows = db.historyDao().getRecent(limit);
            List<Track> out = new ArrayList<>(rows.size());
            for (HistoryEntity e : rows) {
                Track t = jsonToTrack(e.trackJson);
                if (t != null) out.add(t);
            }
            main.post(() -> callback.onResult(out));
        });
    }

    // ---------- playlists ----------

    public void getPlaylists(final Callback<List<PlaylistEntity>> callback) {
        executor.execute(() -> {
            List<PlaylistEntity> rows = db.playlistDao().getAll();
            main.post(() -> callback.onResult(rows));
        });
    }

    public void createPlaylist(String name, final Callback<Long> callback) {
        executor.execute(() -> {
            PlaylistEntity e = new PlaylistEntity();
            e.name = name;
            e.createdAtMs = System.currentTimeMillis();
            long id = db.playlistDao().insert(e);
            main.post(() -> callback.onResult(id));
        });
    }

    public void deletePlaylist(long playlistId, final Runnable onComplete) {
        executor.execute(() -> {
            db.playlistDao().deleteById(playlistId);
            if (onComplete != null) main.post(onComplete);
        });
    }

    public void getPlaylistTracks(long playlistId, final Callback<List<Track>> callback) {
        executor.execute(() -> {
            List<PlaylistTrackEntity> rows = db.playlistDao().getTracks(playlistId);
            List<Track> out = new ArrayList<>(rows.size());
            for (PlaylistTrackEntity e : rows) {
                Track t = jsonToTrack(e.trackJson);
                if (t != null) out.add(t);
            }
            main.post(() -> callback.onResult(out));
        });
    }

    public void addToPlaylist(long playlistId, Track track, final Runnable onComplete) {
        executor.execute(() -> {
            Integer max = db.playlistDao().maxPosition(playlistId);
            PlaylistTrackEntity e = new PlaylistTrackEntity();
            e.playlistId = playlistId;
            e.trackId = track.id;
            e.position = (max == null ? -1 : max) + 1;
            e.trackJson = track.toJsonString();
            db.playlistDao().insertTrack(e);
            if (onComplete != null) main.post(onComplete);
        });
    }

    public void removeFromPlaylist(long playlistId, String trackId, final Runnable onComplete) {
        executor.execute(() -> {
            db.playlistDao().removeTrack(playlistId, trackId);
            if (onComplete != null) main.post(onComplete);
        });
    }

    // ---------- queue persistence ----------

    public void saveQueue(List<Track> queue, int currentIndex, long positionMs) {
        executor.execute(() -> {
            db.queueDao().clear();
            List<QueuedTrackEntity> rows = new ArrayList<>(queue.size());
            for (int i = 0; i < queue.size(); i++) {
                Track t = queue.get(i);
                QueuedTrackEntity e = new QueuedTrackEntity();
                e.position = i;
                e.trackId = t.id;
                e.trackJson = t.toJsonString();
                rows.add(e);
            }
            if (!rows.isEmpty()) db.queueDao().insertAll(rows);
        });
    }

    public void restoreQueue(final Callback<List<Track>> callback) {
        executor.execute(() -> {
            List<QueuedTrackEntity> rows = db.queueDao().getAll();
            List<Track> out = new ArrayList<>(rows.size());
            for (QueuedTrackEntity e : rows) {
                Track t = jsonToTrack(e.trackJson);
                if (t != null) out.add(t);
            }
            main.post(() -> callback.onResult(out));
        });
    }

    public void clearQueueSnapshot() {
        executor.execute(db.queueDao()::clear);
    }

    // ---------- local tracks ----------

    public void replaceLocalTracks(List<Track> tracks) {
        executor.execute(() -> {
            db.localTrackDao().clear();
            List<LocalTrackEntity> rows = new ArrayList<>(tracks.size());
            long now = System.currentTimeMillis();
            for (Track t : tracks) {
                LocalTrackEntity e = new LocalTrackEntity();
                e.id = t.id;
                e.documentUri = t.streamUri;
                e.title = t.title;
                e.artist = t.artist;
                e.album = t.album;
                e.durationMs = t.durationMs;
                e.artworkPath = t.artworkPath;
                e.lyrics = t.lyrics;
                e.fileSizeBytes = 0;
                e.scannedAtMs = now;
                e.trackJson = t.toJsonString();
                rows.add(e);
            }
            if (!rows.isEmpty()) db.localTrackDao().insertAll(rows);
        });
    }

    public void getLocalTracks(final Callback<List<Track>> callback) {
        executor.execute(() -> {
            List<LocalTrackEntity> rows = db.localTrackDao().getAll();
            List<Track> out = new ArrayList<>(rows.size());
            for (LocalTrackEntity e : rows) {
                Track t = jsonToTrack(e.trackJson);
                if (t != null) out.add(t);
            }
            main.post(() -> callback.onResult(out));
        });
    }

    public void countLocalTracks(final Callback<Integer> callback) {
        executor.execute(() -> {
            int n = db.localTrackDao().count();
            main.post(() -> callback.onResult(n));
        });
    }

    // ---------- search helper (used by Search over the local library) ----------

    /** Simple case-insensitive filter over cached local tracks. */
    public void searchLocal(String query, final Callback<List<Track>> callback) {
        executor.execute(() -> {
            List<LocalTrackEntity> rows = db.localTrackDao().getAll();
            String q = query.toLowerCase();
            List<Track> out = new ArrayList<>();
            for (LocalTrackEntity e : rows) {
                boolean match = contains(e.title, q) || contains(e.artist, q) || contains(e.album, q);
                if (match) {
                    Track t = jsonToTrack(e.trackJson);
                    if (t != null) out.add(t);
                    if (out.size() >= 50) break;
                }
            }
            main.post(() -> callback.onResult(out));
        });
    }

    private static boolean contains(@Nullable String value, String lowerQuery) {
        return value != null && value.toLowerCase().contains(lowerQuery);
    }

    /** Builds a track JSON JSONObject from a track — helper kept for tools/tests. */
    @NonNull
    public static JSONObject trackJsonUnsafe(Track t) throws JSONException {
        return t.toJson();
    }
}
