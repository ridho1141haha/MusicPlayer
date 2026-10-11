# Third-party notices

Ridho Music's original code is MIT-licensed (see LICENSE). It depends on the following
libraries; this file preserves their attribution and license notices as required.

## AndroidX / Jetpack — Apache License 2.0
- androidx.appcompat:appcompat 1.7.0
- androidx.media3:media3-exoplayer 1.5.1
- androidx.media3:media3-session 1.5.1
- androidx.media3:media3-datasource 1.5.1
- androidx.room:room-runtime 2.6.1 (+ room-compiler annotation processor)
- androidx.recyclerview:recyclerview 1.3.2
- androidx.constraintlayout:constraintlayout 2.2.0
- androidx.documentfile:documentfile 1.0.1
- androidx.test.ext:junit 1.2.1, androidx.test.espresso:espresso-core 3.6.1 (test)

Apache License 2.0 text: https://www.apache.org/licenses/LICENSE-2.0

## Material Components for Android — Apache License 2.0
- com.google.android.material:material 1.12.0

## Guava (transitive via Media3) — Apache License 2.0
- com.google.guava:guava

## Glide — BSD-2-Clause (with parts MIT / Apache 2.0)
- com.github.bumptech.glide:glide 4.16.0
  Copyright 2014 Google, Inc. https://github.com/bumptech/glide/blob/master/LICENSE

## OkHttp — Apache License 2.0
- com.squareup.okhttp3:okhttp 4.12.0
  Copyright (C) 2019 Square, Inc.

## JUnit 4 — Eclipse Public License 1.0 (test only)
- junit:junit 4.13.2

## org.json (JVM test artifact) — JSON License (test only)
- org.json:json 20240303 — used only in JVM unit tests; on Android the platform's
  built-in org.json implementation is used instead.

## Trademarks
- "YouTube", "YouTube Music", "Android", "Samsung" and "Spotify" are trademarks of
  their respective owners. Ridho Music is not affiliated with, endorsed by, or
  sponsored by any of them.

## Data sources
- The experimental YouTube Music provider calls unauthenticated JSON endpoints of
  music.youtube.com. No data is scraped from third-party sites; no proprietary code
  from any vendor is included in this repository.
