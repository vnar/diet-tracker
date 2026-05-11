"use client";

import { Card } from "@/components/ui/Card";
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

/** Date range, generate assessment, insight card, two-photo compare. Requires `ProgressPhotoTrackerProvider`. */
export function PhotoTrackerAiComparePanel({ embedded = false }: { embedded?: boolean }) {
  const {
    today,
    canUseCloud,
    aiCompareEnabled,
    loadingPhotos,
    displayPhotos,
    photosInRange,
    aiReadyInRange,
    comparePhotos,
    error,
    syncNotice,
    filterDateFrom,
    filterDateTo,
    setFilterDateFrom,
    setFilterDateTo,
    compareAssessment,
    assessing,
    setCompareSelection,
    runAssessment,
    runRangeEndpointsAssessment,
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
        <p className="mb-2 text-[10px] leading-snug text-zinc-500">
          Estimate only, not medical advice. Anthropic (Claude) on our servers.
        </p>
      ) : (
        <div className="mb-3 border-b border-zinc-800 pb-2.5">
          <h3 className="text-sm font-semibold tracking-tight text-zinc-100">Photo compare (AI)</h3>
          <p className="mt-1 text-[10px] leading-snug text-zinc-500">
            Estimate only, not medical advice. Anthropic (Claude) on our servers.
          </p>
          {syncNotice ? (
            <p className="mt-2 text-[10px] leading-snug text-amber-200/90">{syncNotice}</p>
          ) : null}
        </div>
      )}
      {embedded && syncNotice ? (
        <p className="mb-2 text-[10px] leading-snug text-amber-200/90">{syncNotice}</p>
      ) : null}

      {embedded && displayPhotos.length > 0 ? (
        <p className="mb-2 text-[10px] leading-relaxed text-zinc-500">
          <span className="font-medium text-zinc-400">Photos column:</span> tap{" "}
          <span className="text-zinc-300">Select</span> on two thumbnails, then{" "}
          <span className="text-zinc-300">Run AI comparison</span> under the strip. Here you can also pick a{" "}
          <span className="text-zinc-300">date range</span> and auto-run on first vs last analyzable photo, and read the
          full result card.
        </p>
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
        <div className="mb-3 rounded-2xl border border-white/[0.06] bg-zinc-950/40 p-3 sm:p-3.5">
          <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
                Date range · AI compare
              </p>
              <p className="mt-1 text-[11px] text-zinc-400">
                {photosInRange.length} in range · {aiReadyInRange.length} analyzable (cloud or JPEG/PNG/WebP saved in
                your log)
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-2 sm:justify-end">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">From</span>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="rounded-lg border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">To</span>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="rounded-lg border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
                />
              </label>
            </div>
          </div>
          {canUseCloud ? (
            <button
              type="button"
              disabled={assessing || aiReadyInRange.length < 2}
              onClick={() => void runRangeEndpointsAssessment()}
              className="w-full rounded-xl border border-emerald-500/35 bg-emerald-500/15 py-2.5 text-sm font-semibold text-emerald-50 shadow-sm transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {assessing ? "Generating…" : "Generate AI assessment"}
            </button>
          ) : (
            <p className="text-[11px] text-zinc-500">Sign in with AWS backend to run AI assessment.</p>
          )}
          {!aiCompareEnabled ? (
            <p className="mt-2 text-[10px] text-amber-200/90">
              If you get “disabled”, set <code className="text-amber-100/80">FF_BODY_COMPARE_AI</code> on the API Lambda
              and redeploy.
            </p>
          ) : null}
          {compareAssessment ? <ProgressPhotoInsightCard data={compareAssessment} /> : null}
        </div>
      )}
      {comparePhotos.length === 2 ? (
        <div className="mt-4 rounded-2xl border border-violet-500/25 bg-zinc-950/40 p-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-violet-300/90">Your pair</p>
          <p className="mb-2 text-xs font-semibold text-zinc-100">Two photos selected — run AI comparison</p>
          <p className="mb-3 text-[10px] leading-snug text-zinc-500">
            Same action as <span className="text-zinc-400">Run AI comparison</span> in the Photos column. The previews
            below are the two images that will be sent (estimate only, not medical advice).
          </p>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={assessing || comparePhotos.length !== 2 || !comparePhotos.every((p) => isPhotoAiAssessable(p))}
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
          <p className="mt-2 text-[10px] text-zinc-500">
            The written analysis card appears in the <span className="text-zinc-400">Date range</span> block above after a
            successful run.
          </p>
        </div>
      ) : displayPhotos.length > 0 ? (
        <div className="mt-3 rounded-xl border border-dashed border-zinc-700/80 bg-zinc-950/20 px-3 py-2.5">
          <p className="text-[10px] leading-snug text-zinc-500">
            <span className="font-medium text-zinc-400">No pair yet.</span> Select two photos in the Photos column, or
            change the date range and use <span className="text-zinc-400">Generate AI assessment</span> for automatic
            endpoints.
          </p>
        </div>
      ) : null}
    </PanelShell>
  );
}
