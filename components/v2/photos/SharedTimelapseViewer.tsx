"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Play, RotateCcw, Volume2 } from "lucide-react";
import { ProgressPhotoWeightBadge } from "@/components/v2/photos/ProgressPhotoWeightBadge";
import {
  PROGRESS_PHOTO_SHARE_MAX_FRAME_MS,
  PROGRESS_PHOTO_SHARE_MIN_FRAME_MS,
  sortPhotosForTimelapse,
} from "@/lib/photos/progressPhotoTimelapse";
import type { PublicTimelapseSharePayload } from "@/lib/share/timelapseShare";
import { getTimelapseShareAudioSrc } from "@/lib/share/timelapseShare";
import {
  preloadTimelapseImages,
  type TimelapsePreloadProgress,
} from "@/lib/share/timelapseImagePreload";
import { MARKETING_SITE_URL } from "@/lib/marketing/siteCopy";

const INTRO_MS = 3200;
const OUTRO_MS = 4000;

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Phase = "idle" | "intro" | "playing" | "outro" | "done";

type Props = {
  payload: PublicTimelapseSharePayload;
};

/** Full-screen public timelapse with intro/outro branding; waits for images before advancing. */
export function SharedTimelapseViewer({ payload }: Props) {
  const photos = useMemo(
    () =>
      sortPhotosForTimelapse(
        payload.photos.map((p) => ({
          photoId: p.photoId,
          date: p.date,
          url: p.imageUrl,
        })),
      ),
    [payload.photos],
  );

  const weightByPhotoId = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of payload.photos) {
      if (typeof p.weightAtPhoto === "number") map.set(p.photoId, p.weightAtPhoto);
    }
    return map;
  }, [payload.photos]);

  const [phase, setPhase] = useState<Phase>("idle");
  const [index, setIndex] = useState(0);
  const [frameVisible, setFrameVisible] = useState(false);
  const [preload, setPreload] = useState<TimelapsePreloadProgress>({
    done: 0,
    total: photos.length,
    ready: false,
  });
  const [musicBlocked, setMusicBlocked] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const introTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outroTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameMaxTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameReadyAtRef = useRef<number | null>(null);
  const frameHandledRef = useRef(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const current = photos[index];
  const currentWeight =
    current && payload.includeWeight ? weightByPhotoId.get(current.photoId) : undefined;

  const clearIntroTimer = useCallback(() => {
    if (introTimerRef.current) {
      clearTimeout(introTimerRef.current);
      introTimerRef.current = null;
    }
  }, []);

  const clearOutroTimer = useCallback(() => {
    if (outroTimerRef.current) {
      clearTimeout(outroTimerRef.current);
      outroTimerRef.current = null;
    }
  }, []);

  const clearFrameTimers = useCallback(() => {
    if (frameHoldTimerRef.current) {
      clearTimeout(frameHoldTimerRef.current);
      frameHoldTimerRef.current = null;
    }
    if (frameMaxTimerRef.current) {
      clearTimeout(frameMaxTimerRef.current);
      frameMaxTimerRef.current = null;
    }
  }, []);

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const tryPlayMusic = useCallback(async () => {
    const audio = audioRef.current;
    if (!audio) return false;
    audio.loop = true;
    audio.volume = 0.5;
    try {
      await audio.play();
      setMusicBlocked(false);
      return true;
    } catch {
      setMusicBlocked(true);
      return false;
    }
  }, []);

  useEffect(() => {
    const urls = photos.map((p) => p.url);
    setPreload({ done: 0, total: urls.length, ready: urls.length === 0 });
    let cancelled = false;
    void preloadTimelapseImages(urls, (progress) => {
      if (!cancelled) setPreload(progress);
    });
    return () => {
      cancelled = true;
    };
  }, [photos]);

  useEffect(() => {
    const audio = audioRef.current;
    if (audio) audio.load();
  }, []);

  const finishTimelapse = useCallback(() => {
    clearFrameTimers();
    setFrameVisible(false);
    setPhase("outro");
    clearOutroTimer();
    outroTimerRef.current = setTimeout(() => {
      stopAudio();
      setPhase("done");
    }, OUTRO_MS);
  }, [clearFrameTimers, clearOutroTimer, stopAudio]);

  const advanceFrame = useCallback(() => {
    clearFrameTimers();
    setFrameVisible(false);
    setIndex((prev) => {
      const next = prev + 1;
      if (next >= photos.length) {
        finishTimelapse();
        return prev;
      }
      return next;
    });
  }, [clearFrameTimers, finishTimelapse, photos.length]);

  const scheduleAdvanceAfterLoad = useCallback(() => {
    clearFrameTimers();
    const readyAt = frameReadyAtRef.current ?? Date.now();
    const elapsed = Date.now() - readyAt;
    const wait = Math.max(0, PROGRESS_PHOTO_SHARE_MIN_FRAME_MS - elapsed);
    frameHoldTimerRef.current = setTimeout(() => {
      advanceFrame();
    }, wait);
  }, [advanceFrame, clearFrameTimers]);

  const onFrameImageLoad = useCallback(() => {
    if (frameHandledRef.current) return;
    frameHandledRef.current = true;
    frameReadyAtRef.current = Date.now();
    setFrameVisible(true);
    scheduleAdvanceAfterLoad();
  }, [scheduleAdvanceAfterLoad]);

  useEffect(() => {
    if (phase !== "playing" || !current) return;

    frameHandledRef.current = false;
    frameReadyAtRef.current = null;
    setFrameVisible(false);
    clearFrameTimers();

    frameMaxTimerRef.current = setTimeout(() => {
      if (!frameHandledRef.current) {
        setFrameVisible(true);
        advanceFrame();
      }
    }, PROGRESS_PHOTO_SHARE_MAX_FRAME_MS);

    const raf = requestAnimationFrame(() => {
      const img = imgRef.current;
      if (img?.complete && img.naturalWidth > 0) {
        onFrameImageLoad();
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      clearFrameTimers();
    };
  }, [phase, index, current, advanceFrame, clearFrameTimers, onFrameImageLoad]);

  const startPlayback = useCallback(() => {
    if (!preload.ready || photos.length === 0) return;

    clearIntroTimer();
    clearOutroTimer();
    clearFrameTimers();
    stopAudio();
    setIndex(0);
    setFrameVisible(false);
    setPhase("intro");
    void tryPlayMusic();

    introTimerRef.current = setTimeout(() => {
      setPhase("playing");
    }, INTRO_MS);
  }, [
    preload.ready,
    photos.length,
    clearIntroTimer,
    clearOutroTimer,
    clearFrameTimers,
    stopAudio,
    tryPlayMusic,
  ]);

  useEffect(
    () => () => {
      clearIntroTimer();
      clearOutroTimer();
      clearFrameTimers();
      stopAudio();
    },
    [clearIntroTimer, clearOutroTimer, clearFrameTimers, stopAudio],
  );

  const preparing = preload.total > 0 && !preload.ready;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black text-white">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={getTimelapseShareAudioSrc()} preload="auto" />

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        {phase === "idle" ? (
          <div className="flex max-w-md flex-col items-center gap-6 px-6 text-center">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300/90">Ojas Health</p>
              <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Progress journey</h1>
              <p className="text-sm text-zinc-400">
                {photos.length} photos · oldest to newest
              </p>
            </div>

            {preparing ? (
              <div className="flex flex-col items-center gap-2 text-sm text-zinc-400">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-400" aria-hidden />
                <p>
                  Preparing photos… {preload.done}/{preload.total}
                </p>
              </div>
            ) : (
              <button
                type="button"
                onClick={startPlayback}
                disabled={!preload.ready || photos.length === 0}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-500/50 bg-emerald-500/20 px-6 py-3 text-sm font-semibold text-emerald-50 shadow-lg transition hover:bg-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <Play className="h-5 w-5" aria-hidden />
                Play timelapse
              </button>
            )}

            {musicBlocked ? (
              <button
                type="button"
                onClick={() => void tryPlayMusic()}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-amber-200/90 underline-offset-2 hover:underline"
              >
                <Volume2 className="h-3.5 w-3.5" aria-hidden />
                Tap to enable music
              </button>
            ) : (
              <p className="text-[11px] text-zinc-500">Upbeat music plays during the show.</p>
            )}
          </div>
        ) : null}

        {(phase === "intro" || phase === "outro") && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-gradient-to-b from-emerald-950/90 via-black/95 to-black px-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-300/90">Ojas Health</p>
            <p className="mt-3 font-serif text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              {phase === "intro" ? "Your progress" : "ojas-health.com"}
            </p>
            {phase === "outro" ? (
              <p className="mt-3 max-w-sm text-sm leading-relaxed text-zinc-300">
                Morning weigh-ins, photo meal estimates, and calm trends — free to start.
              </p>
            ) : (
              <p className="mt-3 text-sm text-zinc-400">A snapshot of visible change over time</p>
            )}
          </div>
        )}

        {(phase === "playing" || phase === "outro" || phase === "done") && current ? (
          <div className="relative flex h-full w-full max-w-4xl flex-col items-center justify-center px-4 py-8">
            {typeof currentWeight === "number" ? (
              <ProgressPhotoWeightBadge
                weightKg={currentWeight}
                unit={payload.unit}
                variant="lightbox"
              />
            ) : null}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              key={current.photoId}
              src={current.url}
              alt={`Progress ${current.date}`}
              onLoad={phase === "playing" ? onFrameImageLoad : undefined}
              className={`max-h-[min(72vh,720px)] w-full rounded-xl object-contain shadow-2xl transition-opacity duration-500 ${
                frameVisible || phase !== "playing" ? "opacity-100" : "opacity-0"
              }`}
            />
            {phase === "playing" && !frameVisible ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-400/80" aria-hidden />
              </div>
            ) : null}
            <p className="mt-4 text-sm font-medium text-zinc-200">{formatDateLabel(current.date)}</p>
            <p className="text-[11px] text-zinc-500">
              {index + 1} of {photos.length}
            </p>
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-zinc-800/80 bg-zinc-950/90 px-4 py-3">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-500">
            Shared progress · expires {new Date(payload.expiresAt).toLocaleDateString()}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {musicBlocked && phase !== "idle" ? (
              <button
                type="button"
                onClick={() => void tryPlayMusic()}
                className="inline-flex items-center gap-1 rounded-lg border border-amber-600/40 px-3 py-1.5 text-xs font-medium text-amber-100 hover:bg-amber-950/40"
              >
                <Volume2 className="h-3.5 w-3.5" aria-hidden />
                Music
              </button>
            ) : null}
            {phase === "done" ? (
              <button
                type="button"
                onClick={() => {
                  stopAudio();
                  clearIntroTimer();
                  clearOutroTimer();
                  clearFrameTimers();
                  startPlayback();
                }}
                disabled={!preload.ready}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden />
                Replay
              </button>
            ) : null}
            <Link
              href={MARKETING_SITE_URL}
              className="rounded-lg border border-emerald-600/50 bg-emerald-950/60 px-3 py-1.5 text-xs font-semibold text-emerald-100 hover:bg-emerald-900/50"
            >
              Start your journey →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
