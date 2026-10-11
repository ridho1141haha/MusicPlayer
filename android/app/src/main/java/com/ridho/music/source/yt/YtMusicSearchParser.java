package com.ridho.music.source.yt;

import androidx.annotation.Nullable;

import com.ridho.music.domain.model.SearchSection;
import com.ridho.music.domain.model.Track;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.List;

/**
 * Pure-Java parser for InnerTube search responses. Kept free of Android imports
 * so it is unit-testable on the JVM with real captured response fixtures.
 *
 * <p>Defensive by design: any structural surprise (API change) yields fewer or
 * empty sections rather than a crash.</p>
 */
public final class YtMusicSearchParser {

    public static final String ID_PREFIX_SONG = "ytm:";
    public static final String ID_PREFIX_ALBUM = "ytm-album:";
    public static final String ID_PREFIX_ARTIST = "ytm-artist:";

    private YtMusicSearchParser() {
    }

    /** Parses a full search response into titled sections. Never throws. */
    @Nullable
    public static List<SearchSection> parse(@Nullable JSONObject root) {
        if (root == null) return null;
        List<SearchSection> sections = new ArrayList<>();
        try {
            JSONArray blocks = root
                    .getJSONObject("contents")
                    .getJSONObject("tabbedSearchResultsRenderer")
                    .getJSONArray("tabs")
                    .getJSONObject(0)
                    .getJSONObject("tabRenderer")
                    .getJSONObject("content")
                    .getJSONObject("sectionListRenderer")
                    .getJSONArray("contents");

            for (int i = 0; i < blocks.length(); i++) {
                JSONObject block = blocks.getJSONObject(i);
                JSONObject shelf = block.optJSONObject("musicShelfRenderer");
                if (shelf == null) continue; // skip card shelves / continuation entries
                String shelfTitle = textFromRunsObject(shelf.optJSONObject("title"));
                if (shelfTitle == null) shelfTitle = "Results";
                JSONArray items = shelf.optJSONArray("contents");
                if (items == null) continue;
                List<Track> tracks = new ArrayList<>();
                for (int j = 0; j < items.length(); j++) {
                    JSONObject renderer = items.getJSONObject(j)
                            .optJSONObject("musicResponsiveListItemRenderer");
                    Track t = parseItem(renderer);
                    if (t != null) tracks.add(t);
                }
                if (!tracks.isEmpty()) sections.add(new SearchSection(shelfTitle, tracks));
            }
        } catch (JSONException e) {
            // Structure changed — return what we have; caller treats empty as "no results".
        }
        return sections;
    }

    /** Parses one musicResponsiveListItemRenderer into a Track, or null if not usable. */
    @Nullable
    static Track parseItem(@Nullable JSONObject item) {
        if (item == null) return null;
        JSONArray flex = item.optJSONArray("flexColumns");
        if (flex == null || flex.length() == 0) return null;

        String title = colText(flex, 0);
        if (title == null || title.isEmpty()) return null;
        String artist = colText(flex, 1);
        String album = colText(flex, 2);

        JSONObject endpoint = item.optJSONObject("navigationEndpoint");
        String videoId = null;
        String browseId = null;
        if (endpoint != null) {
            JSONObject watch = endpoint.optJSONObject("watchEndpoint");
            if (watch != null) videoId = watch.optString("videoId", null);
            JSONObject browse = endpoint.optJSONObject("browseEndpoint");
            if (browse != null) browseId = browse.optString("browseId", null);
        }

        String thumbnailUrl = largestThumbnail(item.optJSONObject("thumbnail"));
        long durationMs = parseDurationMs(fixedColumnText(item));

        String id;
        if (videoId != null && !videoId.isEmpty()) {
            id = ID_PREFIX_SONG + videoId;
        } else if (browseId != null && browseId.startsWith("MPRE")) {
            id = ID_PREFIX_ALBUM + browseId;
        } else if (browseId != null && browseId.startsWith("UC")) {
            id = ID_PREFIX_ARTIST + browseId;
        } else {
            return null;
        }

        return new Track(id, Track.SOURCE_YTM, title,
                artist == null ? "Unknown artist" : artist,
                album, durationMs, null, thumbnailUrl, null, null, 0L);
    }

    // ---------------------------------------------------------------- helpers

    @Nullable
    private static String colText(JSONArray flex, int index) {
        if (index >= flex.length()) return null;
        JSONObject column = flex.optJSONObject(index);
        if (column == null) return null;
        JSONObject renderer = column.optJSONObject("musicResponsiveListItemFlexColumnRenderer");
        if (renderer == null) return null;
        return textFromRunsObject(renderer.optJSONObject("text"));
    }

    @Nullable
    private static String fixedColumnText(JSONObject item) {
        JSONArray fixed = item.optJSONArray("fixedColumns");
        if (fixed == null || fixed.length() == 0) return null;
        JSONObject column = fixed.optJSONObject(0);
        if (column == null) return null;
        JSONObject renderer = column.optJSONObject("musicResponsiveListItemFlexColumnRenderer");
        if (renderer == null) return null;
        return textFromRunsObject(renderer.optJSONObject("text"));
    }

    @Nullable
    private static String textFromRunsObject(@Nullable JSONObject textObject) {
        if (textObject == null) return null;
        String simple = textObject.optString("simpleText", null);
        if (simple != null && !simple.isEmpty()) return simple;
        JSONArray runs = textObject.optJSONArray("runs");
        if (runs == null || runs.length() == 0) return null;
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < runs.length(); i++) {
            String text = runs.optJSONObject(i) == null
                    ? null
                    : runs.optJSONObject(i).optString("text", "");
            if (text != null) sb.append(text);
        }
        String out = sb.toString().trim();
        return out.isEmpty() ? null : out;
    }

    @Nullable
    private static String largestThumbnail(@Nullable JSONObject thumbnailWrapper) {
        if (thumbnailWrapper == null) return null;
        JSONObject renderer = thumbnailWrapper.optJSONObject("musicThumbnailRenderer");
        if (renderer == null) return null;
        JSONObject thumbnail = renderer.optJSONObject("thumbnail");
        if (thumbnail == null) return null;
        JSONArray thumbnails = thumbnail.optJSONArray("thumbnails");
        if (thumbnails == null || thumbnails.length() == 0) return null;
        // InnerTube lists thumbnails ascending in size; prefer the last HTTPS one.
        for (int i = thumbnails.length() - 1; i >= 0; i--) {
            JSONObject candidate = thumbnails.optJSONObject(i);
            if (candidate == null) continue;
            String url = candidate.optString("url", null);
            if (url != null && url.startsWith("https://")) return url;
        }
        return null;
    }

    /** Parses "4:16" / "1:02:05" style durations into ms; returns 0 when unparseable. */
    public static long parseDurationMs(@Nullable String text) {
        if (text == null) return 0L;
        String t = text.trim();
        if (t.isEmpty() || t.contains("-")) return 0L;
        String[] parts = t.split(":");
        try {
            long seconds = 0L;
            for (String part : parts) {
                seconds = seconds * 60L + Long.parseLong(part.trim());
            }
            return seconds * 1000L;
        } catch (NumberFormatException e) {
            return 0L;
        }
    }
}
