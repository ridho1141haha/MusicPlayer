package com.ridho.music.domain.model;

import androidx.annotation.Nullable;

import org.json.JSONException;
import org.json.JSONObject;

/**
 * A playable track within Ridho Music. A track is always produced by a concrete
 * {@link com.ridho.music.domain.source.MusicSource} and is identified by
 * {@code sourceId + ":" + id} semantics inside {@link #id}.
 *
 * <p>Instances are immutable and can be serialized to JSON so they can travel through
 * MediaMetadata extras, Room (as JSON columns) and intent-free service boundaries.</p>
 */
public class Track {

    public static final String SOURCE_LOCAL = "local";
    public static final String SOURCE_YTM = "ytm";
    /** WEBLAB-22A — Jamendo (official v3.0 API, Creative Commons catalog). */
    public static final String SOURCE_JAMENDO = "jamendo";

    public final String id;
    public final String sourceId;
    public final String title;
    public final String artist;
    @Nullable public final String album;
    public final long durationMs;
    /** Local file path of cached/embedded artwork (nullable). */
    @Nullable public final String artworkPath;
    /** Remote artwork URL (nullable). */
    @Nullable public final String artworkUrl;
    /** Playable URI if already resolved (nullable for remote tracks pending resolution). */
    @Nullable public final String streamUri;
    /** Embedded lyrics text; may be plain text or LRC-formatted (nullable). */
    @Nullable public final String lyrics;
    /**
     * WEBLAB-22A — Human-readable license name for attribution (e.g. "CC BY-NC-ND 3.0"),
     * currently set only for Jamendo tracks. Nullable.
     */
    @Nullable public final String licenseName;
    /** WEBLAB-22A — HTTPS license deed URL (attribution metadata). Nullable. */
    @Nullable public final String licenseUrl;
    public final long addedAtMs;

    public Track(String id, String sourceId, String title, String artist, @Nullable String album,
                 long durationMs, @Nullable String artworkPath, @Nullable String artworkUrl,
                 @Nullable String streamUri, @Nullable String lyrics, long addedAtMs) {
        this(id, sourceId, title, artist, album, durationMs, artworkPath, artworkUrl,
                streamUri, lyrics, null, null, addedAtMs);
    }

    public Track(String id, String sourceId, String title, String artist, @Nullable String album,
                 long durationMs, @Nullable String artworkPath, @Nullable String artworkUrl,
                 @Nullable String streamUri, @Nullable String lyrics,
                 @Nullable String licenseName, @Nullable String licenseUrl, long addedAtMs) {
        this.id = id;
        this.sourceId = sourceId;
        this.title = title == null || title.isEmpty() ? "Unknown title" : title;
        this.artist = artist == null || artist.isEmpty() ? "Unknown artist" : artist;
        this.album = album;
        this.durationMs = durationMs;
        this.artworkPath = artworkPath;
        this.artworkUrl = artworkUrl;
        this.streamUri = streamUri;
        this.lyrics = lyrics;
        this.licenseName = licenseName;
        this.licenseUrl = licenseUrl;
        this.addedAtMs = addedAtMs;
    }

    public boolean isLocal() {
        return SOURCE_LOCAL.equals(sourceId);
    }

    public boolean hasResolvedStream() {
        return streamUri != null && !streamUri.isEmpty();
    }

    /** Returns a copy with a resolved stream URI (or null removal). */
    public Track withStreamUri(@Nullable String uri) {
        return new Track(id, sourceId, title, artist, album, durationMs, artworkPath,
                artworkUrl, uri, lyrics, licenseName, licenseUrl, addedAtMs);
    }

    public Track withLyrics(@Nullable String lyricsText) {
        return new Track(id, sourceId, title, artist, album, durationMs, artworkPath,
                artworkUrl, streamUri, lyricsText, licenseName, licenseUrl, addedAtMs);
    }

    public Track withArtwork(@Nullable String path, @Nullable String url) {
        return new Track(id, sourceId, title, artist, album, durationMs, path, url,
                streamUri, lyrics, licenseName, licenseUrl, addedAtMs);
    }

    public JSONObject toJson() throws JSONException {
        JSONObject o = new JSONObject();
        o.put("id", id);
        o.put("sourceId", sourceId);
        o.put("title", title);
        o.put("artist", artist);
        if (album != null) o.put("album", album);
        o.put("durationMs", durationMs);
        if (artworkPath != null) o.put("artworkPath", artworkPath);
        if (artworkUrl != null) o.put("artworkUrl", artworkUrl);
        if (streamUri != null) o.put("streamUri", streamUri);
        if (lyrics != null) o.put("lyrics", lyrics);
        if (licenseName != null) o.put("licenseName", licenseName);
        if (licenseUrl != null) o.put("licenseUrl", licenseUrl);
        o.put("addedAtMs", addedAtMs);
        return o;
    }

    public String toJsonString() {
        try {
            return toJson().toString();
        } catch (JSONException e) {
            return null;
        }
    }

    public static Track fromJson(JSONObject o) throws JSONException {
        return new Track(
                o.getString("id"),
                o.optString("sourceId", SOURCE_LOCAL),
                o.optString("title", "Unknown title"),
                o.optString("artist", "Unknown artist"),
                o.isNull("album") ? null : o.optString("album", null),
                o.optLong("durationMs", 0L),
                o.isNull("artworkPath") ? null : o.optString("artworkPath", null),
                o.isNull("artworkUrl") ? null : o.optString("artworkUrl", null),
                o.isNull("streamUri") ? null : o.optString("streamUri", null),
                o.isNull("lyrics") ? null : o.optString("lyrics", null),
                o.isNull("licenseName") ? null : o.optString("licenseName", null),
                o.isNull("licenseUrl") ? null : o.optString("licenseUrl", null),
                o.optLong("addedAtMs", 0L));
    }

    @Nullable
    public static Track fromJsonString(@Nullable String json) {
        if (json == null || json.isEmpty()) return null;
        try {
            return fromJson(new JSONObject(json));
        } catch (JSONException e) {
            return null;
        }
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Track)) return false;
        return id.equals(((Track) o).id);
    }

    @Override
    public int hashCode() {
        return id.hashCode();
    }

    @Override
    public String toString() {
        // Intentionally excludes stream URIs and artwork URLs (privacy: avoid leaking URLs to logs).
        return "Track{" + sourceId + ", title=" + title + ", artist=" + artist
                + (licenseName == null ? "" : ", license=" + licenseName) + "}";
    }
}
