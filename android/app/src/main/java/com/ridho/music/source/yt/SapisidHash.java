package com.ridho.music.source.yt;

import androidx.annotation.Nullable;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * Builds the {@code Authorization: SAPISIDHASH} header that the official
 * YouTube Music web player sends alongside its session cookies on authenticated
 * InnerTube calls.
 *
 * <p>Google web-auth header specification:
 * {@code SAPISIDHASH <unixSec>_<sha1("<unixSec> <SAPISID> <origin>")>}
 * (plus {@code SAPISID1PHASH} and {@code SAPISID3PHASH} for 1P/3P cookies).</p>
 */
public final class SapisidHash {

    public static final String DEFAULT_ORIGIN = "https://music.youtube.com";

    private SapisidHash() {
    }

    /**
     * Builds the Authorization header value using the canonical origin
     * ({@code https://music.youtube.com}), or null when no SAPISID cookie is available.
     *
     * @param sapisid   SAPISID or __Secure-3PAPISID cookie value
     * @param timestamp Unix timestamp in seconds (or milliseconds, auto-normalized to seconds)
     * @param origin    Origin URL (defaults to {@code https://music.youtube.com} if a path is passed)
     */
    @Nullable
    public static String authorizationHeader(String sapisid, long timestamp, String origin) {
        if (sapisid == null || sapisid.isEmpty() || origin == null || origin.isEmpty()) {
            return null;
        }
        // Normalize milliseconds to seconds if caller passed System.currentTimeMillis()
        long unixSec = timestamp > 100_000_000_000L ? timestamp / 1000L : timestamp;
        String effectiveOrigin = origin.startsWith("http") ? origin : DEFAULT_ORIGIN;

        // Canonical Google SAPISIDHASH payload: "<unixSec> <sapisid> <origin>"
        String payload = unixSec + " " + sapisid + " " + effectiveOrigin;
        String digest = sha1Hex(payload);
        if (digest == null) return null;
        String token = unixSec + "_" + digest;
        return "SAPISIDHASH " + token
                + " SAPISID1PHASH " + token
                + " SAPISID3PHASH " + token;
    }

    /**
     * Extracts the SAPISID (or __Secure-3PAPISID / __Secure-1PAPISID fallback)
     * cookie value from a raw {@code Cookie} header string, or null when absent.
     */
    @Nullable
    public static String extractSapisid(@Nullable String cookieHeader) {
        if (cookieHeader == null || cookieHeader.isEmpty()) return null;
        String primary = extractCookieValue(cookieHeader, "SAPISID");
        if (primary != null) return primary;
        String secure3p = extractCookieValue(cookieHeader, "__Secure-3PAPISID");
        if (secure3p != null) return secure3p;
        return extractCookieValue(cookieHeader, "__Secure-1PAPISID");
    }

    /** True when the header carries the minimum cookies an authenticated session needs. */
    public static boolean looksAuthenticated(@Nullable String cookieHeader) {
        return extractSapisid(cookieHeader) != null
                && cookieHeader != null
                && (containsCookie(cookieHeader, "__Secure-1PSID")
                    || containsCookie(cookieHeader, "__Secure-3PSID"));
    }

    @Nullable
    private static String extractCookieValue(String header, String name) {
        String prefix = name + "=";
        for (String part : header.split(";")) {
            String kv = part.trim();
            if (kv.startsWith(prefix)) {
                String value = kv.substring(prefix.length()).trim();
                if (!value.isEmpty()) return value;
            }
        }
        return null;
    }

    private static boolean containsCookie(String header, String name) {
        return extractCookieValue(header, name) != null;
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
