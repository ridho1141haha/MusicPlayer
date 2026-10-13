package com.ridho.music.ui;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.Nullable;
import androidx.appcompat.app.AppCompatActivity;

import com.ridho.music.App;
import com.ridho.music.R;
import com.ridho.music.source.yt.SapisidHash;

/**
 * FOCUS-YTM-2 — Official sign-in surface: loads music.youtube.com in a plain
 * WebView and lets the user log into their own Google account there.
 *
 * <p>Privacy & security design:</p>
 * <ul>
 *   <li>The user types their password into Google's own pages — this app never
 *       sees or stores credentials, only the resulting session cookies.</li>
 *   <li>Cookies are read via the platform CookieManager once the session is
 *       complete, validated (SAPISID + __Secure-1PSID present), and written to
 *       {@link com.ridho.music.settings.YtmCredentialStore} (AES/GCM,
 *       AndroidKeyStore). They are never logged.</li>
 *   <li>Polling stops as soon as a session is captured or the activity stops.</li>
 * </ul>
 */
public class YtmSignInActivity extends AppCompatActivity {

    private static final String START_URL = "https://music.youtube.com/";
    private static final long POLL_INTERVAL_MS = 1_000L;

    private WebView webView;
    private final Handler pollHandler = new Handler(Looper.getMainLooper());
    private boolean sessionSaved = false;

    private final Runnable cookiePoller = new Runnable() {
        @Override
        public void run() {
            if (sessionSaved || webView == null) return;
            if (captureSessionIfPresent()) return;
            pollHandler.postDelayed(this, POLL_INTERVAL_MS);
        }
    };

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_ytm_sign_in);

        webView = findViewById(R.id.ytm_webview);
        webView.getSettings().setJavaScriptEnabled(true);
        webView.getSettings().setDomStorageEnabled(true);
        // Google's OAuth flow hops across google.com subdomains inside the WebView.
        android.webkit.CookieManager cm = android.webkit.CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(webView, true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                // Keep everything inside the WebView (OAuth popups navigate here).
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                captureSessionIfPresent();
            }
        });

        if (savedInstanceState == null) {
            showConsentDialogThenLoad();
        } else {
            webView.restoreState(savedInstanceState);
        }
    }

    private void showConsentDialogThenLoad() {
        new com.google.android.material.dialog.MaterialAlertDialogBuilder(this)
                .setTitle(R.string.ytm_signin_consent_title)
                .setMessage(R.string.ytm_signin_consent_body)
                .setPositiveButton(R.string.ytm_signin_continue, (d, w) ->
                        webView.loadUrl(START_URL))
                .setNegativeButton(R.string.playlist_cancel, (d, w) -> finish())
                .setCancelable(false)
                .show();
    }

    /** Returns true when a valid session was captured and stored. */
    private boolean captureSessionIfPresent() {
        if (sessionSaved) return true;
        android.webkit.CookieManager cm = android.webkit.CookieManager.getInstance();
        String cookie = cm.getCookie(START_URL);
        if (cookie == null || !SapisidHash.looksAuthenticated(cookie)) return false;

        App.locator().ytmCredentials().save(cookie);
        sessionSaved = true;
        pollHandler.removeCallbacks(cookiePoller);
        android.widget.Toast.makeText(this, R.string.ytm_signin_success,
                android.widget.Toast.LENGTH_SHORT).show();
        setResult(Activity.RESULT_OK);
        finish();
        return true;
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (!sessionSaved) pollHandler.postDelayed(cookiePoller, POLL_INTERVAL_MS);
    }

    @Override
    protected void onPause() {
        pollHandler.removeCallbacks(cookiePoller);
        super.onPause();
    }

    @Override
    protected void onSaveInstanceState(@Nullable Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    @Override
    protected void onDestroy() {
        pollHandler.removeCallbacks(cookiePoller);
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
