package com.ridho.music.source.yt;

import androidx.annotation.Nullable;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * FOCUS-YTM-2 — Builds the {@code Authorization: SAPISIDHASH} header that the
 * official YouTube Music web player sends alongside its session cookies on
 * authenticated InnerTube calls. This is the documented web-auth scheme used by
 * every signed-in browser request — the user's own login session authorizes the
 * call; nothing is bypassed, forged or extracted.
 *
 * <p>Header form: {@code SAPISIDHASH <unixMs>_<sha1("<unixMs>_<path>_<SAPISID>")>}</p>
 */
public final class SapisidHash {

    private SapisidHash() {
    }

    /**
     * Builds the Authorization header value, or null when no SAPISID cookie is
     * available (e.g. signed out or a malformed session — callers then fall back
     * to an unauthenticated request or a typed error).
     */
    @Nullable
    public static String authorizationHeader(String sapisid, long unixMs, String requestPath) {
        if (sapisid == null || sapisid.isEmpty() || requestPath == null || requestPath.isEmpty()) {
            return null;
        }
        String payload = unixMs + "_" + requestPath + "_" + sapisid;
        String digest = sha1Hex(payload);
        if (digest == null) return null;
        return "SAPISIDHASH " + unixMs + "_" + digest;
    }

    /**
     * Extracts the SAPISID cookie value from a raw {@code Cookie} header string,
     * or null when absent. Pure so the parsing rules are unit-testable.
     */
    @Nullable
    public static String extractSapisid(@Nullable String cookieHeader) {
        if (cookieHeader == null || cookieHeader.isEmpty()) return null;
        for (String part : cookieHeader.split(";")) {
            String kv = part.trim();
            if (kv.startsWith("SAPISID=")) {
                String value = kv.substring("SAPISID=".length()).trim();
                return value.isEmpty() ? null : value;
            }
        }
        return null;
    }

    /** True when the header carries the minimum cookies an authenticated session needs. */
    public static boolean looksAuthenticated(@Nullable String cookieHeader) {
        return extractSapisid(cookieHeader) != null
                && cookieHeader != null
                && containsCookie(cookieHeader, "__Secure-1PSID");
    }

    private static boolean containsCookie(String header, String name) {
        for (String part : header.split(";")) {
            String kv = part.trim();
            if (kv.startsWith(name + "=") && kv.length() > name.length() + 1) return true;
        }
        return false;
    }

    @Nullable
    private static String sha1Hex(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            byte[] out = md.digest(input.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder(out.length * 2);
            for (byte b : out) {
                sb.append(Character.forDigit((b >> 4) & 0xF, 16));
                sb.append(Character.forDigit(b & 0xF, 16));
            }
            return sb.toString();
        } catch (Exception e) {
            return null;
        }
    }
}
