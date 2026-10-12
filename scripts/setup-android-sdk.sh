#!/usr/bin/env bash
# Ridho Music — one-shot Android toolchain bootstrap for this sandbox.
# Installs Gradle 8.9 + Android cmdline-tools + platform 35 + build-tools 35.0.0
set -x
LOG="${1:-/tmp/sdk-setup.log}"
exec > "$LOG" 2>&1

SDK=${HOME}/android-sdk
GRADLE_VER=8.9

echo "== $(date) starting toolchain bootstrap =="

# ---- Full JDK 21 (Temurin) ----
# AGP requires jlink for JdkImageTransform; the sandbox system java-21 is a
# JRE-only variant WITHOUT jlink, so a full JDK is mandatory (WEBLAB-16).
if [ ! -x ${HOME}/jdk-21/bin/javac ]; then
  curl -sSL -o ${HOME}/jdk21.tar.gz "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse"
  tar -xzf ${HOME}/jdk21.tar.gz -C ${HOME}/
  rm -f ${HOME}/jdk21.tar.gz
  ln -sfn ${HOME}/jdk-21.* ${HOME}/jdk-21
fi
export JAVA_HOME=${HOME}/jdk-21
echo "== jdk done: $(${HOME}/jdk-21/bin/javac -version 2>&1) jlink=$([ -x ${HOME}/jdk-21/bin/jlink ] && echo yes || echo NO) =="

# ---- Gradle ----
if [ ! -x "${HOME}/gradle-${GRADLE_VER}/bin/gradle" ]; then
  curl -sSL -o /tmp/gradle.zip "https://services.gradle.org/distributions/gradle-${GRADLE_VER}-bin.zip"
  python3 -m zipfile -e /tmp/gradle.zip ${HOME}/ && chmod +x "${HOME}/gradle-${GRADLE_VER}/bin/gradle"
  rm -f /tmp/gradle.zip
fi
echo "== gradle done: $(${HOME}/gradle-${GRADLE_VER}/bin/gradle --version 2>&1 | head -5) =="

# ---- Android cmdline-tools ----
mkdir -p "$SDK/cmdline-tools"
if [ ! -x "$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  curl -sSL -o /tmp/clt.zip "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip"
  python3 -m zipfile -e /tmp/clt.zip "$SDK/cmdline-tools/"
  mv "$SDK/cmdline-tools/cmdline-tools" "$SDK/cmdline-tools/latest"
  rm -f /tmp/clt.zip
fi
export ANDROID_HOME="$SDK"
export JAVA_HOME=${HOME}/jdk-21

# ---- Licenses + packages ----
yes | "$SDK/cmdline-tools/latest/bin/sdkmanager" --licenses >/dev/null 2>&1
"$SDK/cmdline-tools/latest/bin/sdkmanager" "platform-tools" "platforms;android-35" "build-tools;35.0.0"

echo "== $(date) SDK bootstrap finished =="
ls "$SDK"
echo "== DONE-OK =="
