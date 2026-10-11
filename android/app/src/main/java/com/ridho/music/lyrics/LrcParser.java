package com.ridho.music.lyrics;

import androidx.annotation.NonNull;
import androidx.annotation.Nullable;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Parses LRC-formatted or plain-text lyrics. Pure Java — unit-testable on the JVM.
 *
 * <p>Supported LRC forms: {@code [mm:ss.xx] text}, {@code [mm:ss.xxx] text},
 * multiple tags per line ({@code [00:01.00][00:05.00] text}) and metadata tags
 * ({@code [ti:Title]}) which are skipped. When no timestamps exist the content is
 * returned as unsynchronized lines.</p>
 */
public final class LrcParser {

    private static final Pattern TIME_TAG =
            Pattern.compile("\\[(\\d{1,2}):(\\d{1,2})(?:[.:](\\d{1,3}))?\\]");

    private LrcParser() {
    }

    public static class Line implements Comparable<Line> {
        public final long timeMs;
        @NonNull public final String text;

        public Line(long timeMs, @NonNull String text) {
            this.timeMs = timeMs;
            this.text = text;
        }

        @Override
        public int compareTo(Line o) {
            return Long.compare(timeMs, o.timeMs);
        }
    }

    public static class Lyrics {
        @NonNull public final List<Line> lines;
        public final boolean synced;

        public Lyrics(@NonNull List<Line> lines, boolean synced) {
            this.lines = lines;
            this.synced = synced;
        }
    }

    @NonNull
    public static Lyrics parse(@Nullable String raw) {
        List<Line> syncedLines = new ArrayList<>();
        List<Line> plainLines = new ArrayList<>();
        boolean anyTimestamp = false;

        if (raw != null && !raw.isEmpty()) {
            String[] rawLines = raw.split("\r?\n|\r");
            for (String rawLine : rawLines) {
                String line = rawLine.trim();
                if (line.isEmpty()) continue;

                Matcher matcher = TIME_TAG.matcher(line);
                List<Long> times = new ArrayList<>();
                String remainder = line;
                while (matcher.find()) {
                    anyTimestamp = true;
                    long minutes = Long.parseLong(matcher.group(1));
                    long seconds = Long.parseLong(matcher.group(2));
                    long fraction = matcher.group(3) == null
                            ? 0L
                            : normalizeFraction(matcher.group(3));
                    times.add(minutes * 60_000L + seconds * 1_000L + fraction);
                    remainder = remainder.replace(matcher.group(0), "");
                }
                String text = remainder.trim();
                if (!times.isEmpty()) {
                    if (text.isEmpty()) continue; // timestamp-only line: no content
                    for (Long t : times) syncedLines.add(new Line(t, text));
                } else if (!line.startsWith("[") || !line.endsWith("]")) {
                    // Not a metadata tag like [ti:Song] and not timestamped — plain text.
                    plainLines.add(new Line(0L, text));
                }
            }
        }

        if (anyTimestamp && !syncedLines.isEmpty()) {
            Collections.sort(syncedLines);
            return new Lyrics(syncedLines, true);
        }
        return new Lyrics(plainLines, false);
    }

    /** Finds the active line index for a position, or -1 before the first line. */
    public static int activeLineIndex(@NonNull List<Line> lines, long positionMs) {
        int active = -1;
        for (int i = 0; i < lines.size(); i++) {
            if (lines.get(i).timeMs <= positionMs) active = i;
            else break;
        }
        return active;
    }

    private static long normalizeFraction(String fraction) {
        // ".5" -> 500ms, ".05" -> 50ms, ".005" -> 5ms
        while (fraction.length() < 3) fraction += "0";
        return Long.parseLong(fraction);
    }
}
