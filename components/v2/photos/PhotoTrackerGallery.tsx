"use client";

import { Scale, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useProgressPhotoTracker } from "@/components/v2/photos/ProgressPhotoTrackerContext";

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Horizontal progress photo strip + lightbox. Requires `ProgressPhotoTrackerProvider`. */
export function PhotoTrackerGallery() {
  const {
    loadingPhotos,
    displayPhotos,
    photosInRange,
    compareSelection,
    previewPhoto,
    setPreviewPhoto,
    onDeletePhoto,
    toggleCompare,
  } = useProgressPhotoTracker();

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
        <p className="text-sm text-zinc-400">No progress photos yet. Add a photo from Past days on your log.</p>
      </Card>
    );
  }

  return (
    <Card variant="surface" className="flex min-h-0 flex-1 flex-col">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-300">Gallery (filtered)</p>
        <p className="text-[11px] text-slate-400">Tap Compare on two photos for side-by-side</p>
      </div>
      <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
        {photosInRange.length === 0 ? (
          <p className="py-6 text-sm text-slate-500">No photos in this date range — widen the from/to dates.</p>
        ) : null}
        {photosInRange.map((e) => (
          <div
            key={e.photoId}
            className={`group relative h-44 w-40 shrink-0 snap-start overflow-hidden rounded-xl border bg-slate-950/30 sm:h-48 sm:w-44 ${
              compareSelection.includes(e.photoId) ? "border-violet-400" : "border-slate-600"
            }`}
          >
            <button
              type="button"
              onClick={() => void onDeletePhoto(e.photoId)}
              className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-black/60 text-white opacity-0 shadow-sm transition-all duration-200 hover:bg-red-600/90 group-hover:opacity-100 focus-visible:opacity-100"
              aria-label={`Delete photo from ${formatDateLabel(e.date)}`}
              title="Delete photo"
            >
              <Trash2 className="h-4 w-4" aria-hidden />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={e.imageUrl}
              alt={`Progress ${e.date}`}
              onClick={() => e.imageUrl && setPreviewPhoto({ url: e.imageUrl, date: e.date })}
              className="h-full w-full cursor-zoom-in object-cover transition-transform duration-300 group-hover:scale-110"
            />
            <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
              <span className="p-3 text-xs font-medium text-white">{formatDateLabel(e.date)}</span>
            </div>
            <button
              type="button"
              onClick={() => toggleCompare(e.photoId)}
              className="absolute bottom-2 left-2 z-10 rounded-md border border-white/20 bg-black/60 px-2 py-1 text-[10px] text-white"
            >
              {compareSelection.includes(e.photoId) ? "Selected" : "Compare"}
            </button>
            {typeof e.weightAtPhoto === "number" ? (
              <span className="absolute bottom-2 right-2 z-10 inline-flex items-center gap-1 rounded-md border border-white/20 bg-black/60 px-2 py-1 text-[10px] text-white">
                <Scale className="h-3 w-3" />
                {e.weightAtPhoto}
              </span>
            ) : null}
          </div>
        ))}
      </div>
      {previewPhoto ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewPhoto.url}
              alt={`Progress ${previewPhoto.date}`}
              className="max-h-[80vh] w-full object-contain"
            />
            <div className="flex items-center justify-between border-t border-zinc-800 px-4 py-2.5">
              <p className="text-xs text-zinc-300">{formatDateLabel(previewPhoto.date)}</p>
              <button
                type="button"
                onClick={() => setPreviewPhoto(null)}
                className="rounded-md border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs text-zinc-300 transition hover:bg-zinc-800"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
