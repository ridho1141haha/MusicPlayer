package com.ridho.music.source.yt;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Pure rules for the canonical SAPISIDHASH web-auth header and cookie parsing. */
public class SapisidHashTest {

    @Test
    public void buildsKnownSha1HeaderShape() {
        // Known-answer: SHA-1("1700000000 TESTSAPISID https://music.youtube.com")
        // = ca8c70f4bdddce91f59a5f10a7983f25c34ebdf0
        String token = "1700000000_ca8c70f4bdddce91f59a5f10a7983f25c34ebdf0";
        String expected = "SAPISIDHASH " + token
                + " SAPISID1PHASH " + token
                + " SAPISID3PHASH " + token;
        String header = SapisidHash.authorizationHeader(
                "TESTSAPISID", 1700000000000L, "https://music.youtube.com");
        assertEquals(expected, header);
        // Different origin -> different digest.
        assertFalse(header.equals(SapisidHash.authorizationHeader(
                "TESTSAPISID", 1700000000000L, "https://www.youtube.com")));
    }

    @Test
    public void nullInputsYieldNullHeader() {
        assertNull(SapisidHash.authorizationHeader(null, 1L, "https://music.youtube.com"));
        assertNull(SapisidHash.authorizationHeader("", 1L, "https://music.youtube.com"));
        assertNull(SapisidHash.authorizationHeader("sapisid", 1L, null));
        assertNull(SapisidHash.authorizationHeader("sapisid", 1L, ""));
    }

    @Test
    public void extractsSapisidFromCookieHeader() {
        String cookie = "YSC=abc; __Secure-1PSID=g.IQMx; SAPISID=theSapisid123; SID=s";
        assertEquals("theSapisid123", SapisidHash.extractSapisid(cookie));
        assertEquals("v", SapisidHash.extractSapisid(" SAPISID=v ;"));
        assertEquals("sec3p", SapisidHash.extractSapisid("__Secure-3PAPISID=sec3p; SID=s"));
        assertNull(SapisidHash.extractSapisid("SID=s; HSID=h"));
        assertNull(SapisidHash.extractSapisid(null));
        assertNull(SapisidHash.extractSapisid(""));
        assertNull(SapisidHash.extractSapisid("SAPISID="));
    }

    @Test
    public void looksAuthenticatedRequiresBothCookies() {
        assertTrue(SapisidHash.looksAuthenticated(
                "SAPISID=a; __Secure-1PSID=g.abc; SID=x"));
        assertTrue(SapisidHash.looksAuthenticated(
                "__Secure-3PAPISID=a; __Secure-3PSID=g.abc"));
        assertFalse(SapisidHash.looksAuthenticated("SAPISID=a; SID=x"));
        assertFalse(SapisidHash.looksAuthenticated("__Secure-1PSID=g.abc"));
        assertFalse(SapisidHash.looksAuthenticated(null));
    }
}
