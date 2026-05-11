"use client";

import { Card } from "@/components/ui/Card";
import { PHOTO_COMPARE_INSTRUCTIONS } from "@/lib/photoCompareHelp";
import { isPhotoAiAssessable } from "@/lib/progressPhotoAssessmentPayload";
import { ProgressPhotoInsightCard } from "@/components/v2/photos/ProgressPhotoInsightCard";
import { useProgressPhotoTracker } from "@/components/v2/photos/ProgressPhotoTrackerContext";

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function PanelShell({
  embedded,
  children,
}: {
  embedded: boolean;
  children: React.ReactNode;
}) {
  if (embedded) {
    return <div className="flex min-h-0 flex-1 flex-col">{children}</div>;
  }
  return <Card variant="surface" className="flex min-h-0 flex-1 flex-col">{children}</Card>;
}

/** Two-photo AI compare + result card. Requires `ProgressPhotoTrackerProvider`. */
export function PhotoTrackerAiComparePanel({ embedded = false }: { embedded?: boolean }) {
  const {
    today,
    canUseCloud,
    aiCompareEnabled,
    loadingPhotos,
    displayPhotos,
    comparePhotos,
    error,
    syncNotice,
    compareAssessment,
    assessing,
    setCompareSelection,
    runAssessment,
  } = useProgressPhotoTracker();

  if (today === null) {
    return (
      <PanelShell embedded={embedded}>
        {!embedded ? (
          <div className="mb-2.5 border-b border-zinc-800 pb-2.5">
            <h3 className="text-sm font-semibold tracking-tight text-zinc-100">Photo compare (AI)</h3>
          </div>
        ) : null}
        <p className="text-[15px] font-medium text-slate-400">Loading…</p>
      </PanelShell>
    );
  }

  return (
    <PanelShell embedded={embedded}>
      {embedded ? (
        <p className="mb-2 text-[10px] leading-snug text-zinc-500">{PHOTO_COMPARE_INSTRUCTIONS}</p>
      ) : (
        <div className="mb-3 border-b border-zinc-800 pb-2.5">
          <h3 className="text-sm font-semibold tracking-tight text-zinc-100">Photo compare (AI)</h3>
          <p className="mt-1 text-[10px] leading-snug text-zinc-500">{PHOTO_COMPARE_INSTRUCTIONS}</p>
          {syncNotice ? (
            <p className="mt-2 text-[10px] leading-snug text-amber-200/90">{syncNotice}</p>
          ) : null}
        </div>
      )}
      {embedded && syncNotice ? (
        <p className="mb-2 text-[10px] leading-snug text-amber-200/90">{syncNotice}</p>
      ) : null}

      {error ? (
        <div className="mb-3 rounded-lg border border-rose-500/40 bg-rose-900/20 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      ) : null}
      {loadingPhotos ? (
        <p className="text-sm text-slate-400">Loading photo gallery...</p>
      ) : displayPhotos.length === 0 ? (
        <div className="flex min-h-[140px] w-full flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/40 px-4 py-8 text-center">
          <p className="text-sm font-semibold text-zinc-200">No photos to compare yet</p>
          <p className="mt-2 max-w-sm text-[12px] leading-relaxed text-zinc-500">
            Add a picture on any day from <span className="text-zinc-400">Past days</span> (photo on that day&apos;s
            log). They show up here automatically.
          </p>
        </div>
      ) : (
        <>
          {!canUseCloud ? (
            <p className="mb-2 text-[11px] text-zinc-500">Sign in with AWS backend to run AI comparison.</p>
          ) : null}
          {!aiCompareEnabled ? (
            <p className="mb-2 text-[10px] text-amber-200/90">
              If you get “disabled”, set <code className="text-amber-100/80">FF_BODY_COMPARE_AI</code> on the API Lambda
              and redeploy.
            </p>
          ) : null}
          {compareAssessment ? (
            <div className="mb-3 rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-3 sm:p-3.5">
              <ProgressPhotoInsightCard data={compareAssessment} />
            </div>
          ) : null}
          {comparePhotos.length === 2 ? (
            <div className="mt-1 rounded-2xl border border-violet-500/25 bg-zinc-950/40 p-3">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-300/90">Your pair</p>
              <p className="mb-2 text-xs font-semibold text-zinc-100">Two photos selected — run AI comparison</p>
              <p className="mb-3 text-[10px] leading-snug text-zinc-500">
                Previews below are the two images sent for this comparison.
              </p>
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={
                    assessing || comparePhotos.length !== 2 || !comparePhotos.every((p) => isPhotoAiAssessable(p))
                  }
                  onClick={() =>
                    void runAssessment(
                      comparePhotos,
                      "Compare these two selected photos. They may show different body areas (e.g. face vs belly). Estimate visible trends and uncertainty only.",
                    )
                  }
                  title={
                    comparePhotos.length === 2 && !comparePhotos.every((p) => isPhotoAiAssessable(p))
                      ? "Needs JPEG/PNG/WebP/GIF or cloud URLs — not HEIC or broken links."
                      : undefined
                  }
                  className="rounded-lg border border-emerald-500/45 bg-emerald-500/20 px-3 py-2 text-xs font-semibold text-emerald-50 hover:bg-emerald-500/30 disabled:opacity-50"
                >
                  {assessing ? "Running…" : "Run AI comparison on this pair"}
                </button>
                <button
                  type="button"
                  onClick={() => setCompareSelection([])}
                  className="rounded-lg border border-zinc-600 px-2.5 py-2 text-[11px] font-medium text-zinc-300 hover:bg-zinc-800/80"
                >
                  Clear selection
                </button>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {comparePhotos.map((p) => (
                  <div key={p.photoId} className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.imageUrl}
                      alt={`Selected progress ${p.date}`}
                      className="h-44 w-full rounded object-cover sm:h-48"
                    />
                    <p className="mt-1 text-xs text-slate-300">{formatDateLabel(p.date)}</p>
                  </div>
                ))}
              </div>
              {comparePhotos.length === 2 && !assessing && !comparePhotos.every((p) => isPhotoAiAssessable(p)) ? (
                <p className="mt-2 text-[10px] leading-snug text-amber-200/90">
                  Each photo must be JPEG/PNG/WebP/GIF or a supported cloud URL in your log — not HEIC or blob links.
                  Re-save from Past days if needed.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-zinc-700/80 bg-zinc-950/20 px-3 py-2.5">
              <p className="text-center text-[10px] text-zinc-500">No pair selected yet.</p>
            </div>
          )}
        </>
      )}
    </PanelShell>
  );
}
