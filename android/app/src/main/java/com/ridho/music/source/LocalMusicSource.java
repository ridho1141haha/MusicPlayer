package com.ridho.music.source;

import android.content.Context;
import android.net.Uri;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.documentfile.provider.DocumentFile;

import com.ridho.music.data.repository.LibraryRepository;
import com.ridho.music.domain.model.SearchSection;
import com.ridho.music.domain.model.Track;
import com.ridho.music.domain.source.MusicSource;
import com.ridho.music.domain.source.SourceException;
import com.ridho.music.settings.SettingsRepository;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import android.media.MediaMetadataRetriever;

/**
 * Local-file music source built on the Storage Access Framework.
 *
 * <p>The user picks a folder once (ACTION_OPEN_DOCUMENT_TREE in the UI); the URI and a
 * persistable permission are stored, then this source scans it recursively with
 * {@link DocumentFile} and extracts metadata via {@link MediaMetadataRetriever}.
 * No broad storage permission is ever requested; nothing leaves the device.</p>
 */
public class LocalMusicSource implements MusicSource {

    private static final String TAG = "LocalMusicSource";
    private static final int MAX_TRACKS = 2000;
    private static final int MAX_DEPTH = 6;
    private static final Set<String> AUDIO_EXTENSIONS = new HashSet<>(Arrays.asList(
            "mp3", "m4a", "aac", "flac", "wav", "ogg", "oga", "opus", "wma"));

    public interface ScanCallback {
        void onScanFinished(int scannedCount, @Nullable Exception error);
    }

    private final Context context;
    private final SettingsRepository settings;
    private final LibraryRepository library;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private volatile List<Track> cache = Collections.emptyList();
    private volatile boolean cacheLoaded = false;
    private volatile boolean scanning = false;
    private volatile String lastDiagnostic;

    public LocalMusicSource(Context context, SettingsRepository settings, LibraryRepository library) {
        this.context = context.getApplicationContext();
        this.settings = settings;
        this.library = library;
        // Warm the cache from Room so search works immediately after cold start.
        this.library.getLocalTracks(tracks -> {
            cache = tracks;
            cacheLoaded = true;
        });
    }

    // ---------------------------------------------------------------- MusicSource

    @Override
    public String id() {
        return Track.SOURCE_LOCAL;
    }

    @Override
    public String displayName() {
        return "Local files";
    }

    @Override
    public boolean isRemote() {
        return false;
    }

    @Override
    public List<SearchSection> search(String query, int limitPerSection) throws SourceException {
        ensureCacheLoaded();
        String q = query.toLowerCase(Locale.ROOT).trim();
        List<Track> matches = new ArrayList<>();
        for (Track t : cache) {
            if (contains(t.title, q) || contains(t.artist, q)
                    || contains(t.album, q)) {
                matches.add(t);
                if (matches.size() >= limitPerSection) break;
            }
        }
        return Collections.singletonList(new SearchSection("On this device", matches));
    }

    @Override
    public String resolveStreamUri(Track track) {
        // Local document URIs are directly playable by ExoPlayer's ContentDataSource.
        return track.streamUri;
    }

    @Override
    public boolean supportsStreamResolution() {
        return true;
    }

    @Override
    @Nullable
    public String lastDiagnosticMessage() {
        return lastDiagnostic;
    }

    @Override
    public void shutdown() {
        executor.shutdown();
    }

    // ---------------------------------------------------------------- scanning

    public boolean isConfigured() {
        return settings.localFolderUri() != null;
    }

    public boolean isScanning() {
        return scanning;
    }

    /** Rescans the configured folder. Results replace the Room cache. */
    public void rescan(ScanCallback callback) {
        String treeUri = settings.localFolderUri();
        if (treeUri == null) {
            lastDiagnostic = "No folder selected";
            callback.onScanFinished(0, new SourceException(SourceException.Kind.UNSUPPORTED,
                    "No local folder selected."));
            return;
        }
        scanning = true;
        executor.execute(() -> {
            try {
                List<Track> tracks = scanTree(Uri.parse(treeUri));
                cache = tracks;
                cacheLoaded = true;
                library.replaceLocalTracks(tracks);
                lastDiagnostic = null;
                runOnMain(() -> callback.onScanFinished(tracks.size(), null));
            } catch (Exception e) {
                Log.w(TAG, "scan failed: " + e.getClass().getSimpleName());
                lastDiagnostic = "Scan failed: " + e.getClass().getSimpleName();
                runOnMain(() -> callback.onScanFinished(0, e));
            } finally {
                scanning = false;
            }
        });
    }

    private void ensureCacheLoaded() throws SourceException {
        if (!cacheLoaded) {
            // Cache warming is in-flight; wait briefly rather than returning nothing.
            for (int i = 0; i < 50 && !cacheLoaded; i++) {
                try {
                    Thread.sleep(20);
                } catch (InterruptedException e) {
                    Thread.currentThread().interrupt();
                    break;
                }
            }
        }
    }

    private List<Track> scanTree(Uri treeUri) throws SourceException {
        DocumentFile root = DocumentFile.fromTreeUri(context, treeUri);
        if (root == null || !root.canRead()) {
            throw new SourceException(SourceException.Kind.UNSUPPORTED,
                    "The selected folder is no longer readable. Re-select it in Home.");
        }
        List<Track> out = new ArrayList<>();
        scanRecursive(root, out, 0);
        return out;
    }

    private void scanRecursive(DocumentFile dir, List<Track> out, int depth) {
        if (depth > MAX_DEPTH || out.size() >= MAX_TRACKS) return;
        DocumentFile[] children = dir.listFiles();
        if (children == null) return;
        for (DocumentFile f : children) {
            if (out.size() >= MAX_TRACKS) return;
            if (f.isDirectory()) {
                scanRecursive(f, out, depth + 1);
            } else if (isAudio(f)) {
                Track t = readMetadata(f);
                if (t != null) out.add(t);
            }
        }
    }

    private boolean isAudio(DocumentFile f) {
        String name = f.getName();
        if (name == null) return false;
        String mime = f.getType();
        if (mime != null && mime.startsWith("audio/")) return true;
        int dot = name.lastIndexOf('.');
        if (dot < 0) return false;
        return AUDIO_EXTENSIONS.contains(name.substring(dot + 1).toLowerCase(Locale.ROOT));
    }

    @Nullable
    private Track readMetadata(DocumentFile file) {
        String docId = "local:" + file.getUri();
        String fileName = file.getName();
        Track track = new Track(docId, Track.SOURCE_LOCAL,
                stripExtension(fileName == null ? "Unknown" : fileName),
                "Unknown artist", null, 0L, null, null,
                file.getUri().toString(), null, System.currentTimeMillis());

        MediaMetadataRetriever mmr = new MediaMetadataRetriever();
        try {
            mmr.setDataSource(context, file.getUri());
            String title = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_TITLE);
            String artist = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ARTIST);
            String album = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_ALBUM);
            String duration = mmr.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION);

            // MediaMetadataRetriever exposes no LYRICS key; LRC sidecars are supported instead.
            String lyrics = readLrcSidecar(file, stripExtension(fileName == null ? "" : fileName));

            String artworkPath = extractArtwork(mmr, file.getUri());
            String artworkUrl = null;
            if (artworkPath == null && lyrics == null) {
                // no-op; fields stay null
            }
            track = track.withArtwork(artworkPath, artworkUrl).withLyrics(lyrics);
            track = new Track(track.id, track.sourceId,
                    title != null && !title.isEmpty() ? title : track.title,
                    artist != null && !artist.isEmpty() ? artist : "Unknown artist",
                    album, duration != null ? safeParseLong(duration) : 0L,
                    track.artworkPath, track.artworkUrl, track.streamUri, track.lyrics,
                    track.addedAtMs);
            return track;
        } catch (Exception e) {
            // Unreadable/corrupt file — skip it, keep scanning.
            return null;
        } finally {
            try {
                mmr.release();
            } catch (Exception ignored) {
            }
        }
    }

    /** Reads a sibling {@code <name>.lrc} file (synchronized lyrics) for the given audio file. */
    @Nullable
    private String readLrcSidecar(DocumentFile audioFile, String baseName) {
        if (baseName == null || baseName.isEmpty()) return null;
        DocumentFile parent = audioFile.getParentFile();
        if (parent == null) return null;
        DocumentFile lrc = parent.findFile(baseName + ".lrc");
        if (lrc == null) lrc = parent.findFile(baseName + ".LRC");
        if (lrc == null) return null;
        try (java.io.InputStream in = context.getContentResolver().openInputStream(lrc.getUri())) {
            if (in == null) return null;
            java.io.ByteArrayOutputStream bos = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[8192];
            int read;
            while ((read = in.read(buffer)) > 0) {
                bos.write(buffer, 0, read);
            }
            return bos.toString("UTF-8");
        } catch (Exception e) {
            return null;
        }
    }

    @Nullable
    private String extractArtwork(MediaMetadataRetriever mmr, Uri uri) {
        try {
            byte[] picture = mmr.getEmbeddedPicture();
            if (picture == null || picture.length == 0) return null;
            File dir = new File(context.getFilesDir(), "artwork");
            if (!dir.exists() && !dir.mkdirs()) return null;
            File out = new File(dir, sha1(uri.toString()) + ".img");
            if (!out.exists()) {
                try (OutputStream os = new FileOutputStream(out)) {
                    os.write(picture);
                }
            }
            return out.getAbsolutePath();
        } catch (IOException | RuntimeException e) {
            return null;
        }
    }

    private static String stripExtension(String name) {
        int dot = name.lastIndexOf('.');
        return dot > 0 ? name.substring(0, dot) : name;
    }

    private static long safeParseLong(String value) {
        try {
            return Long.parseLong(value);
        } catch (NumberFormatException e) {
            return 0L;
        }
    }

    private static boolean contains(@Nullable String value, String lowerQuery) {
        return value != null && value.toLowerCase(Locale.ROOT).contains(lowerQuery);
    }

    private static String sha1(String value) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] digest = md.digest(value.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) sb.append(String.format("%02x", b));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(value.hashCode());
        }
    }

    private static void runOnMain(Runnable r) {
        new android.os.Handler(android.os.Looper.getMainLooper()).post(r);
    }
}
