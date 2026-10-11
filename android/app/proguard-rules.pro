# Ridho Music ProGuard rules (release builds)

# Room
-keep class * extends androidx.room.RoomDatabase
-keep @androidx.room.Entity class *
-dontwarn androidx.room.paging.**

# OkHttp
-dontwarn okhttp3.**
-dontwarn okio.**

# Model classes are marshalled into MediaMetadata extras and Room JSON columns manually
-keep class com.ridho.music.domain.model.** { *; }

# ExoPlayer / Media3
-dontwarn org.checkerframework.**
-dontwarn com.google.errorprone.**
