package com.ridho.music.source.yt;

import androidx.annotation.Nullable;

import com.ridho.music.domain.model.SearchSection;
import com.ridho.music.domain.model.Track;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Pure-Java parser for InnerTube search responses. Kept free of Android imports
 * so it is unit-testable on the JVM with real captured response fixtures.
 *
 * <p><b>Supported response shapes</b> (verified against live captures; see
 * {@code src/test/resources/ytm/} for sanitized fixtures):
 * <ul>
 *   <li><b>Legacy shelf layout</b> — {@code sectionListRenderer.contents[].musicShelfRenderer}
 *       with per-shelf titles ("Songs", "Videos", …).</li>
 *   <li><b>Flat 2025+ layout</b> (observed live on 2026-10-11) — a
 *       {@code musicCardShelfRenderer} top-result card followed by one
 *       {@code itemSectionRenderer} per result. Subtitles carry the item type as
 *       a bullet prefix ("Song • Artist", "Single • Artist • Year", "Video • A • N views").
 *       Items in this layout have no {@code fixedColumns} (no per-item duration) and
 *       results of different kinds are interleaved, so items are grouped into
 *       sections by their declared kind.</li>
 * </ul></p>
 *
 * <p><b>Continuations:</b> live unauthenticated search responses end after the flat
 * result page and contain no {@code continuationItemRenderer} (verified 2026-10-11),
 * so no continuation decoding is implemented. Unknown blocks/renderers are skipped
 * defensively — any structural surprise yields fewer or empty sections, never a crash.</p>
 *
 * <p>Out of scope on purpose (not playable in a music app, and never surfaced by the
 * legacy shelves either): playlists, podcasts, podcast episodes, profiles and
 * stations. They are recognized and deliberately skipped.</p>
 */
public final class YtMusicSearchParser {

    public static final String ID_PREFIX_SONG = "ytm:";
    public static final String ID_PREFIX_ALBUM = "ytm-album:";
    public static final String ID_PREFIX_ARTIST = "ytm-artist:";

    /** Section titles produced for the flat layout (legacy shelves keep their own titles). */
    static final String SECTION_TOP_RESULT = "Top result";
    static final String SECTION_SONGS = "Songs";
    static final String SECTION_VIDEOS = "Videos";
    static final String SECTION_ALBUMS = "Albums";
    static final String SECTION_ARTISTS = "Artists";
    static final String SECTION_RESULTS = "Results";

    private static final Set<String> KIND_SONG = set("song");
    private static final Set<String> KIND_VIDEO = set("video");
    private static final Set<String> KIND_ALBUM = set("album", "single", "ep");
    private static final Set<String> KIND_ARTIST = set("artist");
    /** Kinds present in the live catalog but intentionally out of scope. */
    private static final Set<String> SKIPPED_KINDS = set(
            "playlist", "community playlist", "featured on",
            "podcast", "episode", "profile", "station");

    private YtMusicSearchParser() {
    }

    /** Parses a full search response into titled sections. Never throws. */
    @Nullable
    public static List<SearchSection> parse(@Nullable JSONObject root) {
        if (root == null) return null;
        // Insertion-ordered so section order follows the response order.
        Map<String, List<Track>> sections = new LinkedHashMap<>();
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

                // Legacy shelf layout (per-shelf title + items).
                JSONObject shelf = block.optJSONObject("musicShelfRenderer");
                if (shelf != null) {
                    addLegacyShelf(shelf, sections);
                    continue;
                }

                // Flat layout: top-result card.
                JSONObject card = block.optJSONObject("musicCardShelfRenderer");
                if (card != null) {
                    Track t = parseCardItem(card);
                    if (t != null) addToBucket(sections, SECTION_TOP_RESULT, t);
                    continue;
                }

                // Flat layout: one itemSectionRenderer per result (one item each, observed live).
                JSONObject itemSection = block.optJSONObject("itemSectionRenderer");
                if (itemSection != null) {
                    JSONArray items = itemSection.optJSONArray("contents");
                    if (items == null) continue;
                    for (int j = 0; j < items.length(); j++) {
                        JSONObject renderer = items.getJSONObject(j)
                                .optJSONObject("musicResponsiveListItemRenderer");
                        Track t = parseItem(renderer);
                        if (t != null) {
                            addToBucket(sections, sectionTitleForKind(kindOfItem(renderer)), t);
                        }
                    }
                }
                // Anything else (chips, ads, unknown future renderers): skipped.
            }
        } catch (JSONException e) {
            // Structure changed — return what we have; caller treats empty as "no results".
        }
        List<SearchSection> out = new ArrayList<>(sections.size());
        for (Map.Entry<String, List<Track>> e : sections.entrySet()) {
            if (!e.getValue().isEmpty()) out.add(new SearchSection(e.getKey(), e.getValue()));
        }
        return out;
    }

    // ---------------------------------------------------------------- legacy layout

    private static void addLegacyShelf(JSONObject shelf, Map<String, List<Track>> sections)
            throws JSONException {
        String shelfTitle = textFromRunsObject(shelf.optJSONObject("title"));
        if (shelfTitle == null) shelfTitle = "Results";
        JSONArray items = shelf.optJSONArray("contents");
        if (items == null) return;
        for (int j = 0; j < items.length(); j++) {
            JSONObject renderer = items.getJSONObject(j)
                    .optJSONObject("musicResponsiveListItemRenderer");
            Track t = parseItem(renderer);
            if (t != null) addToBucket(sections, shelfTitle, t);
        }
    }

    // ---------------------------------------------------------------- item parsing

    /** Parses one musicResponsiveListItemRenderer into a Track, or null if not usable. */
    @Nullable
    static Track parseItem(@Nullable JSONObject item) {
        if (item == null) return null;
        JSONArray flex = item.optJSONArray("flexColumns");
        if (flex == null || flex.length() == 0) return null;

        String title = colText(flex, 0);
        if (title == null || title.isEmpty()) return null;

        Subtitle sub = splitSubtitle(colText(flex, 1));
        if (sub.kind != null && SKIPPED_KINDS.contains(sub.kind)) return null;

        String artist = KIND_ARTIST.contains(sub.kind) ? null : sub.tail; // title IS the artist name
        String album = looksLikeMetric(colText(flex, 2)) ? null : colText(flex, 2);
        long durationMs = parseDurationMs(fixedColumnText(item)); // 0 in the flat layout

        return buildTrack(item.optJSONObject("navigationEndpoint"), title, artist, album,
                durationMs, largestThumbnail(item.optJSONObject("thumbnail")));
    }

    /** Parses the top-result card (musicCardShelfRenderer) into a Track, or null. */
    @Nullable
    static Track parseCardItem(@Nullable JSONObject card) {
        if (card == null) return null;
        JSONObject title = card.optJSONObject("title");
        String titleText = textFromRunsObject(title);
        if (titleText == null || titleText.isEmpty()) return null;

        // The watch/browse endpoint sits on the first title run (verified live).
        JSONObject endpoint = null;
        JSONArray runs = title == null ? null : title.optJSONArray("runs");
        if (runs != null && runs.length() > 0) {
            endpoint = runs.optJSONObject(0) == null
                    ? null
                    : runs.optJSONObject(0).optJSONObject("navigationEndpoint");
        }

        Subtitle sub = splitSubtitle(textFromRunsObject(card.optJSONObject("subtitle")));
        if (sub.kind != null && SKIPPED_KINDS.contains(sub.kind)) return null;

        String artist = KIND_ARTIST.contains(sub.kind) ? null : sub.tail;
        return buildTrack(endpoint, titleText, artist, null, sub.durationMs,
                largestThumbnail(card.optJSONObject("thumbnail")));
    }

    /** Maps a navigation endpoint to the shared Track shape; null when not usable. */
    @Nullable
    private static Track buildTrack(@Nullable JSONObject endpoint, String title,
                                    @Nullable String artist, @Nullable String album,
                                    long durationMs, @Nullable String thumbnailUrl) {
        if (endpoint == null) return null;
        String videoId = null;
        String browseId = null;
        JSONObject watch = endpoint.optJSONObject("watchEndpoint");
        if (watch != null) videoId = watch.optString("videoId", null);
        JSONObject browse = endpoint.optJSONObject("browseEndpoint");
        if (browse != null) browseId = browse.optString("browseId", null);

        String id;
        if (videoId != null && !videoId.isEmpty()) {
            id = ID_PREFIX_SONG + videoId;
        } else if (browseId != null && browseId.startsWith("MPRE")) {
            id = ID_PREFIX_ALBUM + browseId;
        } else if (browseId != null && browseId.startsWith("UC")) {
            id = ID_PREFIX_ARTIST + browseId;
        } else {
            return null; // e.g. MPEDG… non-music pages, MPSP… podcasts
        }

        return new Track(id, Track.SOURCE_YTM, title,
                artist == null || artist.isEmpty() ? "Unknown artist" : artist,
                album, durationMs, null, thumbnailUrl, null, null, 0L);
    }

    // ---------------------------------------------------------------- subtitle / kind logic

    private static final class Subtitle {
        @Nullable final String kind;   // lowercased first bullet token, e.g. "song"
        @Nullable final String tail;   // the segment after the kind (usually the artist)
        final long durationMs;         // card subtitles end with "m:ss" / "h:mm:ss"

        Subtitle(@Nullable String kind, @Nullable String tail, long durationMs) {
            this.kind = kind;
            this.tail = tail;
            this.durationMs = durationMs;
        }
    }

    /**
     * Splits a bullet-separated subtitle ("Song • Artist", "Single • A • 2026",
     * "Video • A • 1.2M views • 3:07"). When the first token is not a known kind
     * word the whole text is treated as a plain artist string (legacy shape).
     */
    private static Subtitle splitSubtitle(@Nullable String text) {
        if (text == null) return new Subtitle(null, null, 0L);
        String trimmed = text.trim();
        int bullet = trimmed.indexOf('•');
        if (bullet <= 0) return new Subtitle(null, trimmed.isEmpty() ? null : trimmed, 0L);

        String kind = trimmed.substring(0, bullet).trim().toLowerCase(java.util.Locale.ROOT);
        if (KIND_SONG.contains(kind) || KIND_VIDEO.contains(kind) || KIND_ALBUM.contains(kind)
                || KIND_ARTIST.contains(kind) || SKIPPED_KINDS.contains(kind)) {
            String[] parts = trimmed.split("•");
            String tail = parts.length > 1 ? parts[1].trim() : null;
            long durationMs = 0L;
            if (parts.length > 2) {
                String last = parts[parts.length - 1].trim();
                if (DURATION_PATTERN.matcher(last).matches()) {
                    durationMs = parseDurationMs(last);
                }
            }
            return new Subtitle(kind, tail == null || tail.isEmpty() ? null : tail, durationMs);
        }
        // Not a typed subtitle — treat the whole text as the artist (legacy behavior).
        return new Subtitle(null, trimmed, 0L);
    }

    private static final java.util.regex.Pattern DURATION_PATTERN =
            java.util.regex.Pattern.compile("\\d{1,2}(?::\\d{2}){1,2}");
    private static final java.util.regex.Pattern METRIC_PATTERN =
            java.util.regex.Pattern.compile(".*\\b(plays|views|subscribers|likes)\\b.*",
                    java.util.regex.Pattern.CASE_INSENSITIVE);

    /** True for engagement counters ("238M plays", "485 views") that must not become album names. */
    private static boolean looksLikeMetric(@Nullable String text) {
        return text != null && METRIC_PATTERN.matcher(text).matches();
    }

    /** Lowercased kind word of a flat-layout item, from its typed subtitle; null when absent. */
    @Nullable
    private static String kindOfItem(@Nullable JSONObject item) {
        if (item == null) return null;
        JSONArray flex = item.optJSONArray("flexColumns");
        if (flex == null || flex.length() < 2) return null;
        return splitSubtitle(colText(flex, 1)).kind;
    }

    private static String sectionTitleForKind(@Nullable String kind) {
        if (kind == null) return SECTION_RESULTS;
        if (KIND_SONG.contains(kind)) return SECTION_SONGS;
        if (KIND_VIDEO.contains(kind)) return SECTION_VIDEOS;
        if (KIND_ALBUM.contains(kind)) return SECTION_ALBUMS;
        if (KIND_ARTIST.contains(kind)) return SECTION_ARTISTS;
        return SECTION_RESULTS;
    }

    // ---------------------------------------------------------------- helpers

    private static void addToBucket(Map<String, List<Track>> sections, String title, Track t) {
        List<Track> list = sections.get(title);
        if (list == null) {
            list = new ArrayList<>();
            sections.put(title, list);
        }
        list.add(t);
    }

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

    private static Set<String> set(String... values) {
        return new HashSet<>(Arrays.asList(values));
    }
}
