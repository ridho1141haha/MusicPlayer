package com.ridho.music;

import android.content.Context;

import com.ridho.music.data.repository.LibraryRepository;
import com.ridho.music.domain.source.MusicSource;
import com.ridho.music.playback.PlaybackRepository;
import com.ridho.music.settings.SettingsRepository;
import com.ridho.music.source.LocalMusicSource;
import com.ridho.music.source.audius.AudiusClient;
import com.ridho.music.source.audius.AudiusSource;
import com.ridho.music.source.jamendo.JamendoClient;
import com.ridho.music.source.jamendo.JamendoSource;
import com.ridho.music.source.yt.YouTubeMusicSource;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * Hand-rolled dependency container. Given the app's modest size, a full DI
 * framework would add more complexity than value; every dependency is created
 * lazily, once, against the application context.
 */
public final class ServiceLocator {

    private final Context appContext;

    private volatile SettingsRepository settings;
    private volatile LibraryRepository library;
    private volatile LocalMusicSource localSource;
    private volatile YouTubeMusicSource ytSource;
    private volatile JamendoSource jamendoSource;
    private volatile AudiusSource audiusSource;
    private volatile PlaybackRepository playback;

    public ServiceLocator(Context appContext) {
        this.appContext = appContext.getApplicationContext();
    }

    public Context appContext() {
        return appContext;
    }

    public SettingsRepository settings() {
        if (settings == null) {
            synchronized (this) {
                if (settings == null) settings = new SettingsRepository(appContext);
            }
        }
        return settings;
    }

    public LibraryRepository library() {
        if (library == null) {
            synchronized (this) {
                if (library == null) library = new LibraryRepository(appContext);
            }
        }
        return library;
    }

    public LocalMusicSource localSource() {
        if (localSource == null) {
            synchronized (this) {
                if (localSource == null) localSource = new LocalMusicSource(appContext, settings(), library());
            }
        }
        return localSource;
    }

    public YouTubeMusicSource ytSource() {
        if (ytSource == null) {
            synchronized (this) {
                if (ytSource == null) ytSource = new YouTubeMusicSource(new com.ridho.music.source.yt.InnertubeClient());
            }
        }
        return ytSource;
    }

    /**
     * WEBLAB-22A — Official Jamendo source. The client id resolves at REQUEST time
     * (runtime setting → BuildConfig default), so changing it in Settings takes
     * effect immediately without recreating this singleton.
     */
    public JamendoSource jamendoSource() {
        if (jamendoSource == null) {
            synchronized (this) {
                if (jamendoSource == null) {
                    JamendoSource.ClientIdProvider provider = () -> {
                        String runtime = settings().jamendoClientId();
                        if (runtime != null && !runtime.trim().isEmpty()) return runtime.trim();
                        return BuildConfig.JAMENDO_CLIENT_ID == null ? null : BuildConfig.JAMENDO_CLIENT_ID.trim();
                    };
                    jamendoSource = new JamendoSource(new JamendoClient(provider));
                }
            }
        }
        return jamendoSource;
    }

    /**
     * AUDIUS-ANDROID-1 — Official Audius source. The public API v1 needs no
     * credentials (documented app_name attribution only), so there is no
     * provider lambda here — just a lazily created client+source pair.
     */
    public AudiusSource audiusSource() {
        if (audiusSource == null) {
            synchronized (this) {
                if (audiusSource == null) {
                    audiusSource = new AudiusSource(new AudiusClient());
                }
            }
        }
        return audiusSource;
    }

    /** All registered sources, including ones disabled for browsing (queue resolution still needs them). */
    public List<MusicSource> allSources() {
        return new ArrayList<>(Arrays.asList(localSource(), ytSource(), jamendoSource(), audiusSource()));
    }

    /** Sources the user may browse/search, honoring their settings. */
    public List<MusicSource> browsableSources() {
        List<MusicSource> out = new ArrayList<>();
        out.add(localSource());
        if (settings().youtubeMusicEnabled()) out.add(ytSource());
        if (settings().jamendoEnabled()) out.add(jamendoSource());
        if (settings().audiusEnabled()) out.add(audiusSource());
        return out;
    }

    public PlaybackRepository playback() {
        if (playback == null) {
            synchronized (this) {
                if (playback == null) playback = new PlaybackRepository(appContext);
            }
        }
        return playback;
    }
}
