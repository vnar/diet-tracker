"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Play, RotateCcw } from "lucide-react";
import { ProgressPhotoWeightBadge } from "@/components/v2/photos/ProgressPhotoWeightBadge";
import {
  PROGRESS_PHOTO_SHARE_TIMELAPSE_INTERVAL_MS,
  sortPhotosForTimelapse,
} from "@/lib/photos/progressPhotoTimelapse";
import type { PublicTimelapseSharePayload } from "@/lib/share/timelapseShare";
import { MARKETING_SITE_URL } from "@/lib/marketing/siteCopy";
import { TIMELAPSE_SHARE_AUDIO_SRC } from "@/lib/share/timelapseShare";

const INTRO_MS = 2800;
const OUTRO_MS = 3500;

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

/** Full-screen public timelapse with intro/outro branding and optional music. */
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
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const current = photos[index];
  const currentWeight =
    current && payload.includeWeight ? weightByPhotoId.get(current.photoId) : undefined;

  const clearTick = useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  const stopAudio = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }, []);

  const startPlayback = useCallback(() => {
    clearTick();
    setIndex(0);
    setPhase("intro");
    const audio = audioRef.current;
    if (audio) {
      audio.loop = true;
      void audio.play().catch(() => {
        /* autoplay blocked — timelapse still runs */
      });
    }
    window.setTimeout(() => {
      setPhase("playing");
      tickRef.current = setInterval(() => {
        setIndex((prev) => {
          const next = prev + 1;
          if (next >= photos.length) {
            clearTick();
            setPhase("outro");
            window.setTimeout(() => {
              stopAudio();
              setPhase("done");
            }, OUTRO_MS);
            return prev;
          }
          return next;
        });
      }, PROGRESS_PHOTO_SHARE_TIMELAPSE_INTERVAL_MS);
    }, INTRO_MS);
  }, [clearTick, photos.length, stopAudio]);

  useEffect(() => () => {
    clearTick();
    stopAudio();
  }, [clearTick, stopAudio]);

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-black text-white">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={TIMELAPSE_SHARE_AUDIO_SRC} preload="auto" />

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
            <button
              type="button"
              onClick={startPlayback}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-500/50 bg-emerald-500/20 px-6 py-3 text-sm font-semibold text-emerald-50 shadow-lg transition hover:bg-emerald-500/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80"
            >
              <Play className="h-5 w-5" aria-hidden />
              Play timelapse
            </button>
            <p className="text-[11px] text-zinc-500">
              Music plays during the show. Tap play if your browser blocks sound.
            </p>
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

        {phase === "playing" || phase === "outro" || phase === "done" ? (
          <div className="relative flex h-full w-full max-w-4xl flex-col items-center justify-center px-4 py-8">
            {current ? (
              <>
                {typeof currentWeight === "number" ? (
                  <ProgressPhotoWeightBadge
                    weightKg={currentWeight}
                    unit={payload.unit}
                    variant="lightbox"
                  />
                ) : null}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  key={current.photoId}
                  src={current.url}
                  alt={`Progress ${current.date}`}
                  className="max-h-[min(72vh,720px)] w-full rounded-xl object-contain shadow-2xl transition-opacity duration-300"
                />
                <p className="mt-4 text-sm font-medium text-zinc-200">{formatDateLabel(current.date)}</p>
                <p className="text-[11px] text-zinc-500">
                  {index + 1} of {photos.length}
                </p>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-zinc-800/80 bg-zinc-950/90 px-4 py-3">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] text-zinc-500">
            Shared progress · expires {new Date(payload.expiresAt).toLocaleDateString()}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {phase === "done" ? (
              <button
                type="button"
                onClick={() => {
                  stopAudio();
                  clearTick();
                  startPlayback();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 px-3 py-1.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800"
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
