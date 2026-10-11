package com.ridho.music;

import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;

import com.ridho.music.ServiceLocator;

/** Application entry point: notification channel + service locator wiring. */
public class App extends Application {

    /** Must match the channel used by {@code DefaultMediaNotificationProvider}. */
    public static final String NOTIF_CHANNEL_ID = "playback_channel";

    private static volatile ServiceLocator locator;

    public static ServiceLocator locator() {
        return locator;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        locator = new ServiceLocator(this);
        createNotificationChannels();
    }

    private void createNotificationChannels() {
        // NotificationChannel requires API 26; on 24/25 Media3 falls back to the
        // legacy notification builder without a channel.
        if (android.os.Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;
        NotificationChannel channel = new NotificationChannel(
                NOTIF_CHANNEL_ID,
                getString(R.string.notif_channel_name),
                NotificationManager.IMPORTANCE_LOW);
        channel.setDescription(getString(R.string.notif_channel_name));
        channel.setShowBadge(false);
        channel.setSound(null, null);
        nm.createNotificationChannel(channel);
    }
}
