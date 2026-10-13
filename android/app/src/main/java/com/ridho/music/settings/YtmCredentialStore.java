package com.ridho.music.settings;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import androidx.annotation.Nullable;

import com.ridho.music.source.yt.SapisidHash;

import java.security.KeyStore;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * FOCUS-YTM-2 — Stores the user's own YouTube Music web session (the cookie
 * string captured from the sign-in WebView) encrypted at rest.
 *
 * <p>Security properties:</p>
 * <ul>
 *   <li>AES-256/GCM with the key held in the hardware-backed AndroidKeyStore —
 *       the plaintext session never touches disk.</li>
 *   <li>Stored in a dedicated prefs file, excluded from cloud backups (see
 *       res/xml/backup_rules.xml + data_extraction_rules.xml).</li>
 *   <li>Never logged, never echoed into diagnostics — the UI shows only a
 *       signed-in boolean. No password is ever seen by this app: the user types
 *       it into Google's own WebView pages.</li>
 *   <li>Sign-out wipes both the prefs entry and the WebView cookies.</li>
 * </ul>
 */
public class YtmCredentialStore {

    private static final String PREFS = "ridho_ytm_auth";
    private static final String KEY_CIPHERTEXT = "session_b64";
    private static final String ANDROID_KEYSTORE = "AndroidKeyStore";
    private static final String KEY_ALIAS = "ridho_ytm_session_key";

    private final SharedPreferences prefs;

    public YtmCredentialStore(Context context) {
        this.prefs = context.getApplicationContext()
                .getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** True when a session cookie is stored. (Cheap check — no decryption.) */
    public boolean signedIn() {
        return prefs.contains(KEY_CIPHERTEXT);
    }

    /**
     * Persists the raw cookie header captured from the sign-in WebView,
     * encrypted. Replaces any previous session.
     */
    public void save(@Nullable String cookieHeader) {
        SharedPreferences.Editor e = prefs.edit();
        if (cookieHeader == null || cookieHeader.trim().isEmpty()) {
            e.remove(KEY_CIPHERTEXT);
        } else {
            try {
                e.putString(KEY_CIPHERTEXT, encrypt(cookieHeader.trim()));
            } catch (Exception keystoreUnavailable) {
                // Fail closed: never store plaintext as a fallback.
                e.remove(KEY_CIPHERTEXT);
            }
        }
        e.apply();
    }

    /** Returns the decrypted cookie header, or null when signed out. */
    @Nullable
    public String cookieHeader() {
        String b64 = prefs.getString(KEY_CIPHERTEXT, null);
        if (b64 == null) return null;
        try {
            return decrypt(b64);
        } catch (Exception lostKeyOrCorrupt) {
            // Key invalidated (e.g. device wipe of keystore) — treat as signed out.
            clear();
            return null;
        }
    }

    /** Removes the stored session. (WebView cookies are cleared by the caller.) */
    public void clear() {
        prefs.edit().remove(KEY_CIPHERTEXT).apply();
    }

    // ---------------------------------------------------------------- crypto

    private SecretKey key() throws Exception {
        KeyStore ks = KeyStore.getInstance(ANDROID_KEYSTORE);
        ks.load(null);
        KeyStore.Entry entry = ks.getEntry(KEY_ALIAS, null);
        if (entry instanceof KeyStore.SecretKeyEntry) {
            return ((KeyStore.SecretKeyEntry) entry).getSecretKey();
        }
        KeyGenerator kg = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE);
        kg.init(new KeyGenParameterSpec.Builder(KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build());
        return kg.generateKey();
    }

    private String encrypt(String plaintext) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key());
        byte[] iv = cipher.getIV();
        byte[] ciphertext = cipher.doFinal(plaintext.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        byte[] out = new byte[iv.length + ciphertext.length];
        System.arraycopy(iv, 0, out, 0, iv.length);
        System.arraycopy(ciphertext, 0, out, iv.length, ciphertext.length);
        return Base64.encodeToString(out, Base64.NO_WRAP);
    }

    private String decrypt(String b64) throws Exception {
        byte[] blob = Base64.decode(b64, Base64.NO_WRAP);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(),
                new GCMParameterSpec(128, blob, 0, 12));
        byte[] plaintext = cipher.doFinal(blob, 12, blob.length - 12);
        return new String(plaintext, java.nio.charset.StandardCharsets.UTF_8);
    }

    // ---------------------------------------------------------------- pure helpers

    /** Convenience for callers that only need the SAPISID value. */
    @Nullable
    public String sapisid() {
        return SapisidHash.extractSapisid(cookieHeader());
    }
}
