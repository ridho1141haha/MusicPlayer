package com.ridho.music.lyrics;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

import java.util.List;

/** JVM tests for the LRC lyrics parser. */
public class LrcParserTest {

    @Test
    public void parsesSyncedLrc() {
        String lrc = "[ti:Song]\n[00:01.00]First line\n[00:05.50]Second line\n[01:02.123]Third\n";
        LrcParser.Lyrics lyrics = LrcParser.parse(lrc);
        assertTrue(lyrics.synced);
        assertEquals(3, lyrics.lines.size());
        assertEquals(1000L, lyrics.lines.get(0).timeMs);
        assertEquals("First line", lyrics.lines.get(0).text);
        assertEquals(5500L, lyrics.lines.get(1).timeMs);
        assertEquals(62123L, lyrics.lines.get(2).timeMs);
    }

    @Test
    public void parsesMultipleTagsPerLine() {
        String lrc = "[00:01.00][00:10.00]Chorus\n";
        LrcParser.Lyrics lyrics = LrcParser.parse(lrc);
        assertTrue(lyrics.synced);
        assertEquals(2, lyrics.lines.size());
        assertEquals("Chorus", lyrics.lines.get(0).text);
        assertEquals("Chorus", lyrics.lines.get(1).text);
    }

    @Test
    public void treatsPlainTextAsUnsynced() {
        String plain = "Just some words\nNo timestamps here\n";
        LrcParser.Lyrics lyrics = LrcParser.parse(plain);
        assertFalse(lyrics.synced);
        assertEquals(2, lyrics.lines.size());
        assertEquals("Just some words", lyrics.lines.get(0).text);
    }

    @Test
    public void metadataOnlyYieldsEmptyUnsynced() {
        LrcParser.Lyrics lyrics = LrcParser.parse("[ti:Song]\n[ar:Artist]\n");
        assertFalse(lyrics.synced);
        assertTrue(lyrics.lines.isEmpty());
    }

    @Test
    public void nullAndEmptyAreSafe() {
        assertTrue(LrcParser.parse(null).lines.isEmpty());
        assertTrue(LrcParser.parse("").lines.isEmpty());
        assertFalse(LrcParser.parse(null).synced);
    }

    @Test
    public void activeLineIndexTracksPosition() {
        String lrc = "[00:01.00]A\n[00:10.00]B\n[00:20.00]C\n";
        List<LrcParser.Line> lines = LrcParser.parse(lrc).lines;
        assertEquals(-1, LrcParser.activeLineIndex(lines, 500));
        assertEquals(0, LrcParser.activeLineIndex(lines, 1000));
        assertEquals(0, LrcParser.activeLineIndex(lines, 9999));
        assertEquals(1, LrcParser.activeLineIndex(lines, 10000));
        assertEquals(2, LrcParser.activeLineIndex(lines, 999999));
    }

    @Test
    public void sortsUnorderedTimestamps() {
        String lrc = "[00:20.00]Late\n[00:01.00]Early\n";
        LrcParser.Lyrics lyrics = LrcParser.parse(lrc);
        assertEquals("Early", lyrics.lines.get(0).text);
        assertEquals("Late", lyrics.lines.get(1).text);
    }
}
