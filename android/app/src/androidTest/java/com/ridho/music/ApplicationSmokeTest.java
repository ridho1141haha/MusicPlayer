package com.ridho.music;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Basic smoke test — requires a device or emulator.
 *
 * NOTE: instrumented tests could NOT be executed in the build sandbox (no
 * emulator/device available). They are provided for local verification; see
 * README "Testing" for the exact commands.
 */
@RunWith(AndroidJUnit4.class)
public class ApplicationSmokeTest {

    @Test
    public void packageNameIsCorrect() {
        android.content.Context appContext =
                InstrumentationRegistry.getInstrumentation().getTargetContext();
        assertEquals("com.ridho.music.debug", appContext.getPackageName());
    }

    @Test
    public void databaseOpens() {
        android.content.Context appContext =
                InstrumentationRegistry.getInstrumentation().getTargetContext();
        com.ridho.music.data.db.AppDatabase db =
                com.ridho.music.data.db.AppDatabase.get(appContext);
        assertNotNull(db);
        assertTrue(db.savedTrackDao().count() >= 0);
    }
}
