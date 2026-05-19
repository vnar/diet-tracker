"use client";

import { useCallback, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Pause, Play, Sparkles, Trash2 } from "lucide-react";
import { useProgressPhotoTimelapse } from "@/components/v2/photos/useProgressPhotoTimelapse";
import { Card } from "@/components/ui/Card";
import { useProgressPhotoTracker } from "@/components/v2/photos/ProgressPhotoTrackerContext";
import { PHOTO_COMPARE_INSTRUCTIONS } from "@/lib/photoCompareHelp";
import { isPhotoAiAssessable } from "@/lib/progressPhotoAssessmentPayload";
import { openAiPhotoCompareSection } from "@/lib/openAiPhotoCompareSection";

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const ASSESS_QUERY =
  "Compare these two selected photos. They may show different body areas (e.g. face vs belly). Estimate visible trends and uncertainty only.";

/** Horizontal progress photo strip + lightbox. Requires `ProgressPhotoTrackerProvider`. */
export function PhotoTrackerGallery() {
  const {
    loadingPhotos,
    displayPhotos,
    compareSelection,
    comparePhotos,
    previewPhoto,
    setPreviewPhoto,
    onDeletePhoto,
    toggleCompare,
    canUseCloud,
    aiCompareEnabled,
    assessing,
    runAssessment,
    setCompareSelection,
    compareAssessment,
  } = useProgressPhotoTracker();

  const nSelected = compareSelection.length;
  const twoPicked = comparePhotos.length === 2;
  const bothAnalyzable = twoPicked && comparePhotos.every((p) => isPhotoAiAssessable(p));

  const navigablePhotos = useMemo(
    () => displayPhotos.filter((p): p is (typeof displayPhotos)[number] & { imageUrl: string } => Boolean(p.imageUrl)),
    [displayPhotos],
  );

  const previewIndex = previewPhoto
    ? navigablePhotos.findIndex((p) => p.photoId === previewPhoto.photoId)
    : -1;

  const timelapseNavigablePhotos = useMemo(
    () =>
      navigablePhotos.map((p) => ({
        photoId: p.photoId,
        date: p.date,
        url: p.imageUrl,
      })),
    [navigablePhotos],
  );

  const {
    canTimelapse,
    timelapsePlaying,
    stopTimelapse,
    startTimelapseFromGallery,
    toggleTimelapse,
  } = useProgressPhotoTimelapse({
    navigablePhotos: timelapseNavigablePhotos,
    previewPhoto,
    setPreviewPhoto,
  });

  const goPreview = useCallback(
    (delta: number) => {
      if (previewIndex < 0 || navigablePhotos.length === 0) return;
      stopTimelapse();
      const nextIndex = (previewIndex + delta + navigablePhotos.length) % navigablePhotos.length;
      const next = navigablePhotos[nextIndex];
      if (!next?.imageUrl) return;
      setPreviewPhoto({ url: next.imageUrl, date: next.date, photoId: next.photoId });
    },
    [navigablePhotos, previewIndex, setPreviewPhoto, stopTimelapse],
  );

  const closePreview = useCallback(() => {
    stopTimelapse();
    setPreviewPhoto(null);
  }, [setPreviewPhoto, stopTimelapse]);

  useEffect(() => {
    if (!previewPhoto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPreview(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        goPreview(1);
      } else if (e.key === " " && canTimelapse) {
        e.preventDefault();
        toggleTimelapse();
      } else if (e.key === "Escape") {
        closePreview();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewPhoto, goPreview, closePreview, canTimelapse, toggleTimelapse]);

  if (loadingPhotos) {
    return (
      <Card variant="surface" className="flex min-h-0 flex-1 flex-col">
        <p className="text-sm text-slate-400">Loading photo gallery...</p>
      </Card>
    );
  }

  if (displayPhotos.length === 0) {
    return (
      <Card variant="surface" className="flex min-h-0 flex-1 flex-col">
        <p className="text-sm leading-relaxed text-zinc-400">
          No progress photos yet. After you save today with your morning weight, add one from{" "}
          <a
            href="#today-progress-photo"
            className="font-medium text-sky-400 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-300"
          >
            Today&apos;s log → Progress photo
          </a>
          , or pick a date under{" "}
          <a
            href="#dashboard-history"
            className="font-medium text-sky-400 underline decoration-sky-500/40 underline-offset-2 hover:text-sky-300"
          >
            Review + history
          </a>{" "}
          and tap <span className="font-medium text-zinc-300">Upload</span> in the day panel.
        </p>
      </Card>
    );
  }

  return (
    <Card
      variant="surface"
      className="flex max-h-[min(460px,58vh)] min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden"
    >
      <div className="mb-2 shrink-0 space-y-1.5">
        <p className="text-[11px] leading-snug text-zinc-400">{PHOTO_COMPARE_INSTRUCTIONS}</p>
        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[10px] font-medium uppercase tracking-wide text-zinc-500">Gallery</p>
            {canTimelapse ? (
              <button
                type="button"
                onClick={startTimelapseFromGallery}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-600 bg-zinc-900/80 px-2 py-0.5 text-[10px] font-medium text-zinc-200 transition hover:bg-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80"
                aria-label="Play progress photo timelapse"
                title="Play timelapse (oldest → newest)"
              >
                <Play className="h-3 w-3 shrink-0" aria-hidden />
                Timelapse
              </button>
            ) : null}
          </div>
          <p className="text-[10px] text-zinc-500">
            {nSelected === 0
              ? "0 of 2 selected"
              : nSelected === 1
                ? "1 of 2 — pick one more"
                : "2 of 2 — ready for AI"}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden pb-2">
        <div className="flex snap-x snap-mandatory gap-2.5">
          {displayPhotos.map((e) => {
            const selected = compareSelection.includes(e.photoId);
            return (
              <div
                key={e.photoId}
                className={`group relative h-[132px] w-[108px] shrink-0 snap-start overflow-hidden rounded-xl border bg-slate-950/30 sm:h-[148px] sm:w-[118px] ${
                  selected ? "border-violet-400 ring-1 ring-violet-400/40" : "border-slate-600"
                }`}
              >
                <button
                  type="button"
                  onClick={() => void onDeletePhoto(e.photoId)}
                  className="absolute right-1.5 top-1.5 z-10 inline-flex h-7 w-7 items-center justify-center rounded-lg border border-white/20 bg-black/60 text-white opacity-0 shadow-sm transition-all duration-200 hover:bg-red-600/90 group-hover:opacity-100 focus-visible:opacity-100"
                  aria-label={`Delete photo from ${formatDateLabel(e.date)}`}
                  title="Delete photo"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={e.imageUrl}
                  alt={`Progress ${e.date}`}
                  onClick={() => {
                    stopTimelapse();
                    if (e.imageUrl) {
                      setPreviewPhoto({ url: e.imageUrl, date: e.date, photoId: e.photoId });
                    }
                  }}
                  className="h-full w-full cursor-zoom-in object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                  <span className="p-2 text-[10px] font-medium text-white">{formatDateLabel(e.date)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => toggleCompare(e.photoId)}
                  className={`absolute bottom-1.5 left-1.5 right-1.5 z-10 rounded-md border px-1.5 py-1 text-center text-[10px] font-medium leading-tight text-white ${
                    selected
                      ? "border-violet-300 bg-violet-600/90"
                      : "border-white/25 bg-black/65 hover:bg-black/80"
                  }`}
                >
                  {selected ? "Selected ✓" : "Select"}
                </button>
                {typeof e.weightAtPhoto === "number" ? (
                  <span className="pointer-events-none absolute right-1.5 top-8 z-10 rounded border border-white/20 bg-black/65 px-1 py-0.5 text-[9px] text-white">
                    {e.weightAtPhoto}
                  </span>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {twoPicked ? (
        <div className="mt-2 shrink-0 space-y-2 rounded-xl border border-violet-500/35 bg-violet-950/25 p-2.5">
          <p className="text-[11px] font-medium leading-snug text-zinc-200">
            Two photos selected — run an AI visual comparison (estimate only).
          </p>
          <div className="flex flex-wrap gap-2">
            {canUseCloud ? (
              <button
                type="button"
                disabled={assessing || !bothAnalyzable}
                onClick={() =>
                  void (async () => {
                    const ok = await runAssessment(comparePhotos, ASSESS_QUERY);
                    if (ok) openAiPhotoCompareSection();
                  })()
                }
                title={
                  !bothAnalyzable
                    ? "Needs JPEG/PNG/WebP/GIF or cloud URLs — not HEIC or broken links."
                    : undefined
                }
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-50 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-45 sm:flex-none"
              >
                <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {assessing ? "Running…" : "Run AI comparison"}
              </button>
            ) : (
              <p className="text-[11px] text-zinc-500">Sign in to run AI comparison.</p>
            )}
            <button
              type="button"
              onClick={() => setCompareSelection([])}
              className="rounded-lg border border-zinc-600 px-2.5 py-2 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800/80"
            >
              Clear picks
            </button>
            <button
              type="button"
              onClick={() => openAiPhotoCompareSection()}
              className="rounded-lg border border-zinc-600 px-2.5 py-2 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800/80"
            >
              {compareAssessment ? "View full result & tools" : "Open AI tools"}
            </button>
          </div>
          {!aiCompareEnabled ? (
            <p className="text-[10px] text-amber-200/90">
              If the API returns disabled, enable <code className="text-amber-100/80">FF_BODY_COMPARE_AI</code> on the
              Lambda.
            </p>
          ) : null}
          {twoPicked && !assessing && !bothAnalyzable ? (
            <p className="text-[10px] leading-snug text-amber-200/90">
              These files cannot be sent for analysis. Use JPEG/PNG/WebP from your log or cloud album, then try again.
            </p>
          ) : null}
        </div>
      ) : null}

      {previewPhoto ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={closePreview}
          role="dialog"
          aria-modal="true"
          aria-label="Progress photo preview"
        >
          <div
            className="relative max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative flex min-h-[200px] items-center justify-center bg-black/40">
              {navigablePhotos.length > 1 ? (
                <button
                  type="button"
                  onClick={() => goPreview(-1)}
                  className="absolute left-2 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white shadow-sm transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80"
                  aria-label="Previous photo"
                >
                  <ChevronLeft className="h-5 w-5" aria-hidden />
                </button>
              ) : null}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewPhoto.url}
                alt={`Progress ${previewPhoto.date}`}
                className="max-h-[80vh] w-full object-contain"
              />
              {navigablePhotos.length > 1 ? (
                <button
                  type="button"
                  onClick={() => goPreview(1)}
                  className="absolute right-2 top-1/2 z-10 inline-flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-black/60 text-white shadow-sm transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80"
                  aria-label="Next photo"
                >
                  <ChevronRight className="h-5 w-5" aria-hidden />
                </button>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-3 border-t border-zinc-800 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-xs text-zinc-300">{formatDateLabel(previewPhoto.date)}</p>
                {navigablePhotos.length > 1 && previewIndex >= 0 ? (
                  <p className="text-[10px] text-zinc-500">
                    {previewIndex + 1} of {navigablePhotos.length}
                    {timelapsePlaying ? " · Timelapse" : ""}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canTimelapse ? (
                  <button
                    type="button"
                    onClick={toggleTimelapse}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-600/50 bg-emerald-950/50 px-2.5 py-1 text-xs font-medium text-emerald-100 transition hover:bg-emerald-900/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/80"
                    aria-label={timelapsePlaying ? "Pause timelapse" : "Play timelapse"}
                    title={timelapsePlaying ? "Pause timelapse" : "Play timelapse (oldest → newest)"}
                  >
                    {timelapsePlaying ? (
                      <Pause className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    ) : (
                      <Play className="h-3.5 w-3.5 shrink-0" aria-hidden />
                    )}
                    {timelapsePlaying ? "Pause" : "Play"}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={closePreview}
                  className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 transition hover:bg-zinc-800"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
