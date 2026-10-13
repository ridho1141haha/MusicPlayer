package com.ridho.music.source.yt;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** FOCUS-YTM-2 — Pure rules for the SAPISIDHASH web-auth header and cookie parsing. */
public class SapisidHashTest {

    @Test
    public void buildsKnownSha1HeaderShape() {
        // Known-answer: SHA-1("1700000000000_/youtubei/v1/player_TESTSAPISID")
        // = 8bc6c39d36a41b3c5628b4317b198942e86147f0 (independently computed).
        String header = SapisidHash.authorizationHeader(
                "TESTSAPISID", 1700000000000L, "/youtubei/v1/player");
        assertEquals("SAPISIDHASH 1700000000000_8bc6c39d36a41b3c5628b4317b198942e86147f0",
                header);
        // Different path → different digest.
        assertFalse(header.equals(SapisidHash.authorizationHeader(
                "TESTSAPISID", 1700000000000L, "/youtubei/v1/next")));
    }

    @Test
    public void nullInputsYieldNullHeader() {
        assertNull(SapisidHash.authorizationHeader(null, 1L, "/x"));
        assertNull(SapisidHash.authorizationHeader("", 1L, "/x"));
        assertNull(SapisidHash.authorizationHeader("sapisid", 1L, null));
        assertNull(SapisidHash.authorizationHeader("sapisid", 1L, ""));
    }

    @Test
    public void extractsSapisidFromCookieHeader() {
        String cookie = "YSC=abc; __Secure-1PSID=g.IQMx; SAPISID=theSapisid123; SID=s";
        assertEquals("theSapisid123", SapisidHash.extractSapisid(cookie));
        // Trailing-semicolon and whitespace variants still parse.
        assertEquals("v", SapisidHash.extractSapisid(" SAPISID=v ;"));
        assertNull(SapisidHash.extractSapisid("SID=s; HSID=h"));
        assertNull(SapisidHash.extractSapisid(null));
        assertNull(SapisidHash.extractSapisid(""));
        assertNull(SapisidHash.extractSapisid("SAPISID=")); // empty value is not a session
    }

    @Test
    public void looksAuthenticatedRequiresBothCookies() {
        assertTrue(SapisidHash.looksAuthenticated(
                "SAPISID=a; __Secure-1PSID=g.abc; SID=x"));
        assertFalse(SapisidHash.looksAuthenticated("SAPISID=a; SID=x")); // no 1PSID
        assertFalse(SapisidHash.looksAuthenticated("__Secure-1PSID=g.abc")); // no SAPISID
        assertFalse(SapisidHash.looksAuthenticated(null));
    }
}
