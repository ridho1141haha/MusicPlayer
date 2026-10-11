package com.ridho.music.source.yt;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import com.ridho.music.domain.model.SearchSection;
import com.ridho.music.domain.model.Track;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * WEBLAB-11 — Android-side golden contract parity (both directions).
 *
 * <p>The Web Lab's run-qa suite already evaluates {@code fixtures/ytm/expectations.json}
 * with the TS harness parser. This suite evaluates the <b>same contract file</b> (synced
 * verbatim by {@code scripts/sync-fixtures.mjs}) with the REAL
 * {@link YtMusicSearchParser} — so a parser edit that changes any parse shape turns
 * the Android unit-test suite red on the QA dashboard too.</p>
 *
 * <p>Honest scope: only fixtures synced into {@code app/src/test/resources/ytm} (the real
 * 2026-10-11 captures) can be evaluated here; web-only synthetic fixtures listed in the
 * contract are reported as skipped, never as passing.</p>
 */
public class GoldenExpectationsTest {

    private static final Pattern SYNCED_LIVE_FIXTURE = Pattern.compile("^search_live_.*\\.json$");

    /** One drift found while evaluating the contract — accumulated for a single honest report. */
    private static final class Drift {
        final String fixture;
        final String detail;

        Drift(String fixture, String detail) {
            this.fixture = fixture;
            this.detail = detail;
        }
    }

    // ------------------------------------------------------------------ parity

    /**
     * Every contract entry whose fixture is synced into test resources must parse
     * exactly as the golden expectation states (sectionCount, trackCount, section
     * titles, must/must-not-include ids). All drift is collected and reported in
     * ONE assertion so a failure shows the complete picture at once.
     */
    @Test
    public void parsesExactlyPerGoldenContract() throws Exception {
        JSONObject contract = new JSONObject(readResource("/ytm/expectations.json"));
        List<Drift> drifts = new ArrayList<>();
        int evaluated = 0;
        int skipped = 0;

        for (String fixtureName : sortedContractFixtures(contract)) {
            JSONObject expectation = contract.getJSONObject(fixtureName);
            String resourcePath = "/ytm/" + fixtureName;
            String raw = readResourceOrNull(resourcePath);
            if (raw == null) {
                // Web-only synthetic fixture — cannot run on the JVM side; not a pass.
                skipped++;
                continue;
            }
            evaluated++;

            List<SearchSection> sections = YtMusicSearchParser.parse(new JSONObject(raw));
            if (expectation.getInt("sectionCount") == 0) {
                if (sections != null && !sections.isEmpty()) {
                    drifts.add(new Drift(fixtureName,
                            "expected 0 sections, got " + sections.size()));
                }
                if (expectation.getInt("trackCount") != 0) {
                    drifts.add(new Drift(fixtureName, "contract inconsistency: sectionCount 0 but trackCount "
                            + expectation.getInt("trackCount")));
                }
                continue;
            }
            if (sections == null) {
                drifts.add(new Drift(fixtureName, "parser returned null; golden expects "
                        + expectation.getInt("sectionCount") + " sections"));
                continue;
            }

            // sectionCount
            if (sections.size() != expectation.getInt("sectionCount")) {
                drifts.add(new Drift(fixtureName, "sectionCount " + sections.size()
                        + " != golden " + expectation.getInt("sectionCount")));
            }

            // trackCount (flattened across sections)
            int totalTracks = 0;
            Set<String> parsedIds = new LinkedHashSet<>();
            for (SearchSection s : sections) {
                totalTracks += s.tracks.size();
                for (Track t : s.tracks) parsedIds.add(t.id);
            }
            if (totalTracks != expectation.getInt("trackCount")) {
                drifts.add(new Drift(fixtureName, "trackCount " + totalTracks
                        + " != golden " + expectation.getInt("trackCount")));
            }

            // sectionTitles (ordered) when the contract locks them
            if (expectation.has("sectionTitles") && !expectation.isNull("sectionTitles")) {
                JSONArray goldenTitles = expectation.getJSONArray("sectionTitles");
                if (goldenTitles.length() == sections.size()) {
                    for (int i = 0; i < goldenTitles.length(); i++) {
                        String golden = goldenTitles.getString(i);
                        String actual = sections.get(i).title;
                        if (!golden.equals(actual)) {
                            drifts.add(new Drift(fixtureName, "sectionTitles[" + i + "] \"" + actual
                                    + "\" != golden \"" + golden + "\""));
                        }
                    }
                } else {
                    drifts.add(new Drift(fixtureName, "sectionTitles length " + goldenTitles.length()
                            + " != parsed sectionCount " + sections.size()));
                }
            }

            // mustIncludeIds
            if (expectation.has("mustIncludeIds") && !expectation.isNull("mustIncludeIds")) {
                JSONArray ids = expectation.getJSONArray("mustIncludeIds");
                for (int i = 0; i < ids.length(); i++) {
                    String id = ids.getString(i);
                    if (!parsedIds.contains(id)) {
                        drifts.add(new Drift(fixtureName, "mustIncludeIds missing \"" + id + "\""));
                    }
                }
            }

            // mustNotIncludeIds
            if (expectation.has("mustNotIncludeIds") && !expectation.isNull("mustNotIncludeIds")) {
                JSONArray ids = expectation.getJSONArray("mustNotIncludeIds");
                for (int i = 0; i < ids.length(); i++) {
                    String id = ids.getString(i);
                    if (parsedIds.contains(id)) {
                        drifts.add(new Drift(fixtureName, "mustNotIncludeIds leaked \"" + id + "\""));
                    }
                }
            }
        }

        assertTrue("golden contract evaluated 0 fixtures — sync-fixtures.mjs must copy "
                + "expectations.json + search_live_* into test resources", evaluated >= 3);
        assertTrue("skipped (web-only, not synced) contract entries: " + skipped, skipped <= 4);

        if (!drifts.isEmpty()) {
            StringBuilder report = new StringBuilder(
                    "PARSER DRIFT vs golden contract (fixtures/ytm/expectations.json):\n");
            for (Drift d : drifts) {
                report.append("  - ").append(d.fixture).append(": ").append(d.detail).append('\n');
            }
            report.append("If this change is INTENTIONAL, update expectations.json (and the")
                    .append(" YtMusicSearchParserTest goldens) in the same commit.");
            assertEquals(report.toString(), 0, drifts.size());
        }
    }

    /**
     * Coverage guard: every synced search_live_* resource MUST have a golden entry.
     * A newly captured fixture without a contract entry would silently escape the
     * drift alarm — this makes that impossible.
     */
    @Test
    public void goldenContractCoversEverySyncedLiveFixture() throws Exception {
        JSONObject contract = new JSONObject(readResource("/ytm/expectations.json"));
        List<String> covered = sortedContractFixtures(contract);

        Set<String> synced = new LinkedHashSet<>();
        Enumeration<String> names = GoldenExpectationsTest.class.getClassLoader() != null
                ? listResources("/ytm")
                : Collections.<String>emptyEnumeration();
        while (names.hasMoreElements()) {
            String name = names.nextElement();
            if (SYNCED_LIVE_FIXTURE.matcher(name).matches()) synced.add(name);
        }
        assertTrue("no synced live fixtures visible to the test classpath", synced.size() >= 3);

        List<String> uncovered = new ArrayList<>();
        for (String name : synced) {
            if (!covered.contains(name)) uncovered.add(name);
        }
        assertTrue("synced live fixture(s) WITHOUT a golden contract entry: " + uncovered,
                uncovered.isEmpty());
    }

    /** The contract itself must be well-formed: every entry needs sectionCount + trackCount ints. */
    @Test
    public void goldenContractSchemaIsWellFormed() throws Exception {
        JSONObject contract = new JSONObject(readResource("/ytm/expectations.json"));
        List<String> problems = new ArrayList<>();
        int entries = 0;
        for (java.util.Iterator<String> it = contract.keys(); it.hasNext(); ) {
            String key = it.next();
            if (key.startsWith("_")) continue; // _comment and friends
            entries++;
            JSONObject expectation;
            try {
                expectation = contract.getJSONObject(key);
            } catch (Exception e) {
                problems.add(key + ": value is not an object");
                continue;
            }
            if (!expectation.has("sectionCount") || !expectation.has("trackCount")) {
                problems.add(key + ": missing sectionCount/trackCount");
            } else if (expectation.getInt("sectionCount") < 0 || expectation.getInt("trackCount") < 0) {
                problems.add(key + ": negative counts");
            }
            if (!expectation.has("note") || expectation.optString("note").isBlank()) {
                problems.add(key + ": missing provenance note (every golden must say where it came from)");
            }
        }
        assertTrue("contract has no fixture entries", entries >= 7);
        assertEquals("contract schema problems: " + problems, 0, problems.size());
    }

    // ------------------------------------------------------------------ helpers

    /** Contract fixture keys in deterministic order (excludes _comment-style meta keys). */
    private static List<String> sortedContractFixtures(JSONObject contract) {
        List<String> names = new ArrayList<>();
        // keys() (not keySet()) — Android's org.json variant does not expose keySet().
        for (java.util.Iterator<String> it = contract.keys(); it.hasNext(); ) {
            String key = it.next();
            if (!key.startsWith("_")) names.add(key);
        }
        Collections.sort(names);
        return names;
    }

    /**
     * Lists resource names under the given classpath folder. Works in the Gradle
     * unit-test classpath (directory resources). Returns empty when the folder
     * cannot be resolved — the coverage test asserts a minimum count so this
     * degrades into a loud failure, never a silent pass.
     */
    private static Enumeration<String> listResources(String folder) {
        java.net.URL url = GoldenExpectationsTest.class.getResource(folder);
        if (url == null || !"file".equals(url.getProtocol())) {
            return Collections.emptyEnumeration();
        }
        java.io.File dir = new java.io.File(url.getPath());
        String[] files = dir.list();
        if (files == null) return Collections.emptyEnumeration();
        return Collections.enumeration(java.util.Arrays.asList(files));
    }

    private static String readResourceOrNull(String path) {
        try (InputStream in = GoldenExpectationsTest.class.getResourceAsStream(path)) {
            if (in == null) return null;
            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) > 0) bos.write(buf, 0, n);
            return new String(bos.toByteArray(), StandardCharsets.UTF_8);
        } catch (Exception e) {
            return null;
        }
    }

    private static String readResource(String path) throws Exception {
        String raw = readResourceOrNull(path);
        assertNotNull("test resource missing: " + path, raw);
        return raw;
    }
}
