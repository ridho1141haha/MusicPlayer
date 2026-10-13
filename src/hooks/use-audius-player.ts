'use client';

/**
 * use-audius-player — real HTMLAudioElement engine for the Audius tab (WEBLAB-23).
 *
 * Design notes:
 *  - ONE persistent <audio> element lives in a ref (created in an effect, never
 *    per-render). All listeners are removed and the element is fully released
 *    (pause → removeAttribute('src') → load()) on unmount — no leaked resources.
 *  - Event handlers read mutable refs for queue/index so they never go stale;
 *    React state mirrors the engine for rendering only.
 *  - Playback uses the documented Audius stream endpoint directly
 *    (/v1/tracks/{id}/stream?app_name=…) — the media element follows the
 *    302→CDN redirect chain natively, so range-seeking stays native too.
 *  - `ended` auto-advances within the queued context (the list the user started
 *    from: search results, trending, underground). Manual next() wraps around;
 *    natural end stops honestly when the context is exhausted.
 *  - Media Session API is wired when available (lock-screen / notification
 *    controls) and guarded — it is an enhancement, never a requirement.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { audiusStreamUrl, type AudiusTrack } from '@/lib/lab/audius';

export type AudiusPlaybackStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface AudiusPlayerState {
  current: AudiusTrack | null;
  queue: AudiusTrack[];
  queueIndex: number;
  status: AudiusPlaybackStatus;
  isPlaying: boolean;
  isBuffering: boolean;
  /** Seconds (float). */
  currentTime: number;
  /** Seconds (float, 0 until metadata is known). */
  duration: number;
  /** Seconds of buffered audio ahead (for the seek-bar loaded range). */
  bufferedSeconds: number;
  volume: number;
  muted: boolean;
  error: string | null;
}

export interface AudiusPlayerActions {
  /** Starts playback of `tracks[startIndex]`; the whole list becomes the context. */
  playContext(tracks: AudiusTrack[], startIndex: number): void;
  /** Plays one track with its list as context (convenience for row clicks). */
  playTrack(track: AudiusTrack, context: AudiusTrack[]): void;
  toggle(): void;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
  setVolume(volume: number): void;
  toggleMute(): void;
  /** Retries the last intended track after a playback error. */
  retry(): void;
}

const PREVIOUS_RESTART_THRESHOLD_S = 3;

function describeMediaError(code: number, trackLabel: string): string {
  switch (code) {
    case 1:
      return `Playback of "${trackLabel}" was interrupted.`;
    case 2:
      return `Network error while streaming "${trackLabel}". Check the connection and retry.`;
    case 3:
      return `The stream for "${trackLabel}" could not be decoded.`;
    case 4:
      return `The stream source for "${trackLabel}" is unavailable or unsupported.`;
    default:
      return `Playback failed for "${trackLabel}".`;
  }
}

export function useAudiusPlayer(): AudiusPlayerState & AudiusPlayerActions {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<AudiusPlayerState>({
    current: null,
    queue: [],
    queueIndex: -1,
    status: 'idle',
    isPlaying: false,
    isBuffering: false,
    currentTime: 0,
    duration: 0,
    bufferedSeconds: 0,
    volume: 0.9,
    muted: false,
    error: null,
  });

  // Mutable mirrors for event handlers (avoid stale closures).
  const queueRef = useRef<AudiusTrack[]>([]);
  const indexRef = useRef(-1);
  const lastIntentRef = useRef<{ tracks: AudiusTrack[]; index: number } | null>(null);
  const pendingSeekRef = useRef<number | null>(null);

  const patch = useCallback((partial: Partial<AudiusPlayerState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  /** Loads and plays the track at `index` of `tracks`; never throws. */
  const loadAndPlay = useCallback(
    (tracks: AudiusTrack[], index: number) => {
      const audio = audioRef.current;
      const track = tracks[index];
      if (!audio || !track) return;
      queueRef.current = tracks;
      indexRef.current = index;
      lastIntentRef.current = { tracks, index };
      pendingSeekRef.current = null;
      audio.src = audiusStreamUrl(track.id);
      audio.currentTime = 0;
      patch({
        current: track,
        queue: tracks,
        queueIndex: index,
        status: 'loading',
        isBuffering: true,
        isPlaying: true,
        currentTime: 0,
        duration: track.durationMs > 0 ? track.durationMs / 1000 : 0,
        bufferedSeconds: 0,
        error: null,
      });
      void audio.play().catch((error: unknown) => {
        // AbortError = playback was superseded (fast track switching) — benign.
        if (error instanceof DOMException && error.name === 'AbortError') return;
        patch({
          status: 'error',
          isPlaying: false,
          isBuffering: false,
          error: error instanceof Error ? `Could not start "${track.title}": ${error.message}` : `Could not start "${track.title}".`,
        });
      });
    },
    [patch],
  );

  const playContext = useCallback(
    (tracks: AudiusTrack[], startIndex: number) => {
      if (tracks.length === 0) return;
      loadAndPlay(tracks, Math.min(Math.max(startIndex, 0), tracks.length - 1));
    },
    [loadAndPlay],
  );

  const playTrack = useCallback(
    (track: AudiusTrack, context: AudiusTrack[]) => {
      const index = context.findIndex((t) => t.id === track.id);
      playContext(context, index >= 0 ? index : 0);
    },
    [playContext],
  );

  const stepBy = useCallback(
    (delta: number) => {
      const tracks = queueRef.current;
      if (tracks.length === 0) return;
      const current = indexRef.current;
      const nextIndex = current + delta;
      if (nextIndex >= 0 && nextIndex < tracks.length) {
        loadAndPlay(tracks, nextIndex);
      } else {
        // Wrap (manual skip) — matches the prototype player's wrap behavior.
        const wrapped = ((nextIndex % tracks.length) + tracks.length) % tracks.length;
        loadAndPlay(tracks, wrapped);
      }
    },
    [loadAndPlay],
  );

  const next = useCallback(() => stepBy(1), [stepBy]);
  const previous = useCallback(() => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > PREVIOUS_RESTART_THRESHOLD_S) {
      audio.currentTime = 0;
      pendingSeekRef.current = null;
      patch({ currentTime: 0 });
      return;
    }
    stepBy(-1);
  }, [patch, stepBy]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || !audio.src) return;
    if (audio.paused) {
      void audio.play().catch(() => {
        patch({ status: 'error', isPlaying: false, error: 'The browser refused to resume playback — try again.' });
      });
    } else {
      audio.pause();
    }
  }, [patch]);

  const seek = useCallback((seconds: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const target = Math.max(0, seconds);
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = Math.min(target, audio.duration);
      pendingSeekRef.current = null;
    } else {
      // Metadata not ready yet — apply as soon as it arrives.
      pendingSeekRef.current = target;
    }
  }, []);

  const setVolume = useCallback(
    (volume: number) => {
      const audio = audioRef.current;
      const clamped = Math.min(Math.max(volume, 0), 1);
      // Note: iOS Safari ignores volume (read-only) — desktop/Android honored.
      if (audio) {
        audio.volume = clamped;
        if (clamped > 0 && audio.muted) audio.muted = false;
      }
      patch({ volume: clamped, muted: clamped === 0 ? true : false });
    },
    [patch],
  );

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    patch({ muted: audio.muted });
  }, [patch]);

  const retry = useCallback(() => {
    const intent = lastIntentRef.current;
    if (intent) loadAndPlay(intent.tracks, intent.index);
  }, [loadAndPlay]);

  // ---- engine lifecycle -----------------------------------------------------
  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = 0.9;
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      const pending = pendingSeekRef.current;
      pendingSeekRef.current = null;
      if (pending !== null && Number.isFinite(audio.duration)) {
        audio.currentTime = Math.min(pending, audio.duration);
      }
      setState((prev) => ({
        ...prev,
        status: 'ready',
        duration: Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : prev.duration,
        isBuffering: !audio.paused && audio.readyState < 3,
        error: null,
      }));
    };
    const onTimeUpdate = () => {
      const bufferedEnd = audio.buffered.length > 0 ? audio.buffered.end(audio.buffered.length - 1) : 0;
      setState((prev) => ({ ...prev, currentTime: audio.currentTime, bufferedSeconds: bufferedEnd }));
    };
    const onProgress = () => {
      const bufferedEnd = audio.buffered.length > 0 ? audio.buffered.end(audio.buffered.length - 1) : 0;
      setState((prev) => ({ ...prev, bufferedSeconds: bufferedEnd }));
    };
    const onPlaying = () => {
      setState((prev) => ({ ...prev, isPlaying: true, isBuffering: false, status: 'ready', error: null }));
    };
    const onPause = () => {
      setState((prev) => ({ ...prev, isPlaying: false, isBuffering: false }));
    };
    const onWaiting = () => {
      setState((prev) => ({ ...prev, isBuffering: true }));
    };
    const onSeeked = () => {
      setState((prev) => ({ ...prev, currentTime: audio.currentTime, isBuffering: !audio.paused && audio.readyState < 3 }));
    };
    const onEnded = () => {
      // Natural end: advance within the context; stop honestly at the end.
      const tracks = queueRef.current;
      const nextIndex = indexRef.current + 1;
      if (nextIndex >= 0 && nextIndex < tracks.length) {
        loadAndPlay(tracks, nextIndex);
      } else {
        indexRef.current = -1;
        setState((prev) => ({ ...prev, isPlaying: false, isBuffering: false, currentTime: 0, queueIndex: -1, status: 'idle' }));
        audio.removeAttribute('src');
      }
    };
    const onError = () => {
      const label = queueRef.current[indexRef.current]?.title ?? 'the selected track';
      const code = audio.error?.code ?? 0;
      setState((prev) => ({
        ...prev,
        status: 'error',
        isPlaying: false,
        isBuffering: false,
        error: describeMediaError(code, label),
      }));
    };

    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('progress', onProgress);
    audio.addEventListener('playing', onPlaying);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('seeked', onSeeked);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('progress', onProgress);
      audio.removeEventListener('playing', onPlaying);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('seeked', onSeeked);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
      audio.pause();
      audio.removeAttribute('src');
      audio.load(); // releases the decoded buffers / network pipeline
      audioRef.current = null;
    };
  }, [loadAndPlay]);

  // Keep the element volume in sync when (re)created.
  useEffect(() => {
    const audio = audioRef.current;
    if (audio) {
      audio.volume = state.volume;
      audio.muted = state.muted;
    }
  }, []);

  // ---- Media Session (lock screen / OS media controls) ----------------------
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const mediaSession = navigator.mediaSession;
    if (state.current) {
      mediaSession.metadata = new MediaMetadata({
        title: state.current.title,
        artist: state.current.artist,
        artwork: state.current.artworkUrl ? [{ src: state.current.artworkUrl, sizes: '480x480', type: 'image/jpeg' }] : [],
      });
      mediaSession.setActionHandler('play', () => {
        const audio = audioRef.current;
        if (audio) void audio.play().catch(() => {});
      });
      mediaSession.setActionHandler('pause', () => audioRef.current?.pause());
      mediaSession.setActionHandler('previoustrack', () => previous());
      mediaSession.setActionHandler('nexttrack', () => next());
      mediaSession.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number') seek(details.seekTime);
      });
    }
    return () => {
      try {
        mediaSession.metadata = null;
      } catch {
        /* no-op */
      }
    };
  }, [state.current, next, previous, seek]);

  return useMemo(
    () => ({ ...state, playContext, playTrack, toggle, next, previous, seek, setVolume, toggleMute, retry }),
    [state, playContext, playTrack, toggle, next, previous, seek, setVolume, toggleMute, retry],
  );
}

/** mm:ss clock for the player (reuses the lab's honest "—" for unknown). */
export function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')}:${s}`;
  return `${m}:${s}`;
}
