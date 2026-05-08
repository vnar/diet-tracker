"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CircleHelp, Scale, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { getEntryForDate } from "@/lib/calculations";
import {
  deleteProgressPhoto,
  getProgressPhotos,
  isAwsBackendEnabled,
  patchSettings,
  postProgressPhotoAssessment,
  postProgressPhoto,
  uploadPhotoFile,
} from "@/lib/frontend-api-client";
import { track } from "@/lib/analytics";
import { isBodyCompareAiEnabled } from "@/lib/featureFlags";
import { isPhotoAiAssessable, uiPhotoToAssessmentPayload } from "@/lib/progressPhotoAssessmentPayload";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { useHealthStore } from "@/lib/store";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";
import { useSaveEntry } from "@/hooks/useHealthActions";

function formatDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function PhotoTracker() {
  type UiPhoto = {
    photoId: string;
    userId: string;
    date: string;
    imageUrl?: string;
    storageKey?: string;
    weightAtPhoto?: number;
    createdAt: string;
    source: "progress" | "legacy";
    legacyEntryId?: string;
  };
  const { status, user, getAccessToken } = useCognitoAuth();
  const entries = useHealthStore((s) => s.entries);
  const settings = useHealthStore((s) => s.settings);
  const updateSettings = useHealthStore((s) => s.updateSettings);
  const saveEntry = useSaveEntry();
  const today = useClientTodayKey();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<UiPhoto[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; date: string } | null>(null);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [compareAssessment, setCompareAssessment] = useState<{
    summary: string;
    confidence: number;
    disclaimer: string;
    highlights: Array<{ area: string; assessment: string; direction: "leaner" | "unchanged" | "uncertain" }>;
    timeframe: { from: string; to: string };
  } | null>(null);
  const [assessing, setAssessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);
  const [hintOpen, setHintOpen] = useState(false);
  const hintRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hintOpen) return;
    function onDoc(e: MouseEvent) {
      if (hintRef.current && !hintRef.current.contains(e.target as Node)) setHintOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setHintOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [hintOpen]);

  const todayEntry = today ? getEntryForDate(entries, today) : undefined;
  const canUseCloud = isAwsBackendEnabled() && status === "authenticated";
  const aiCompareEnabled = isBodyCompareAiEnabled(user?.id);
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");
  const rangeDefaultsApplied = useRef(false);

  useEffect(() => {
    if (!canUseCloud) return;
    const accessToken = getAccessToken();
    if (!accessToken) return;
    setLoadingPhotos(true);
    void getProgressPhotos(accessToken)
      .then((res) => {
        if (!res.ok) {
          const hasLegacy = useHealthStore
            .getState()
            .entries.some((e) => typeof e.photoUrl === "string" && e.photoUrl.length > 0);
          if (hasLegacy) {
            setSyncNotice("Extra cloud album unavailable — your log photos still show below.");
            setError(null);
          } else {
            setSyncNotice(null);
            setError(res.error);
          }
          return;
        }
        setPhotos(res.data.items.map((item) => ({ ...item, source: "progress" as const })));
        setSyncNotice(null);
        setError(null);
      })
      .finally(() => setLoadingPhotos(false));
  }, [canUseCloud, getAccessToken]);

  const legacyPhotos = useMemo<UiPhoto[]>(
    () =>
      entries
        .filter((e) => typeof e.photoUrl === "string" && e.photoUrl.length > 0)
        .map((e) => ({
          photoId: `legacy-${e.id}`,
          userId: "legacy",
          date: e.date,
          imageUrl: e.photoUrl ?? undefined,
          createdAt: new Date(e.date + "T00:00:00Z").toISOString(),
          source: "legacy" as const,
          legacyEntryId: e.id,
        }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    [entries],
  );
  const displayPhotos = useMemo<UiPhoto[]>(() => {
    const merged: UiPhoto[] = [...photos];
    const seen = new Set(merged.map((p) => `${p.date}|${p.imageUrl ?? ""}`));
    for (const legacy of legacyPhotos) {
      const key = `${legacy.date}|${legacy.imageUrl ?? ""}`;
      if (!seen.has(key)) {
        merged.push(legacy);
        seen.add(key);
      }
    }
    return merged.sort((a, b) => b.date.localeCompare(a.date));
  }, [photos, legacyPhotos]);

  useEffect(() => {
    if (!today || rangeDefaultsApplied.current) return;
    rangeDefaultsApplied.current = true;
    setFilterDateTo(today);
    const y = new Date(today + "T12:00:00").getFullYear();
    setFilterDateFrom(`${y}-01-01`);
  }, [today]);

  const photosInRange = useMemo(() => {
    const from = filterDateFrom.trim();
    const to = filterDateTo.trim();
    if (!from && !to) return displayPhotos;
    return displayPhotos.filter((p) => {
      if (from && p.date < from) return false;
      if (to && p.date > to) return false;
      return true;
    });
  }, [displayPhotos, filterDateFrom, filterDateTo]);

  const aiReadyInRange = useMemo(
    () => photosInRange.filter((p) => isPhotoAiAssessable(p)),
    [photosInRange],
  );

  const comparePhotos = useMemo(() => {
    const selected = displayPhotos.filter((p) => compareSelection.includes(p.photoId));
    return [...selected].sort((a, b) => a.date.localeCompare(b.date));
  }, [displayPhotos, compareSelection]);

  useEffect(() => {
    // Keep compare selection valid when sources refresh/merge.
    const valid = new Set(displayPhotos.map((p) => p.photoId));
    setCompareSelection((prev) => prev.filter((id) => valid.has(id)));
  }, [displayPhotos]);

  useEffect(() => {
    if (comparePhotos.length === 2) {
      track("photo_compare_opened", {
        leftDate: comparePhotos[0]?.date,
        rightDate: comparePhotos[1]?.date,
      });
    }
  }, [comparePhotos]);

  function toStorageKey(photoUrl: string | undefined): string | undefined {
    if (!photoUrl || !photoUrl.startsWith("s3://")) return undefined;
    const slash = photoUrl.indexOf("/", "s3://".length);
    if (slash === -1) return undefined;
    return photoUrl.slice(slash + 1);
  }

  function onPick(f: File) {
    if (!today) return;
    if (!canUseCloud) return;
    const accessToken = getAccessToken();
    if (!accessToken) return;
    const latest = useHealthStore.getState().entries;
    const existing = getEntryForDate(latest, today);
    if (!existing) return;
    setError(null);
    void (async () => {
      const upload = await uploadPhotoFile(f, accessToken, { day: today });
      if (!upload.ok || !upload.photoUrl) {
        setError(upload.error ?? "Could not upload photo.");
        return;
      }
      await saveEntry({
        ...existing,
        id: existing.id,
        photoUrl: upload.photoUrl,
      });
      const created = await postProgressPhoto(
        {
          date: today,
          imageUrl: upload.photoUrl,
          storageKey: toStorageKey(upload.photoUrl),
          weightAtPhoto: existing.morningWeight,
        },
        accessToken,
      );
      if (!created.ok) {
        setError("Uploaded, but cloud sync failed. Your photo is still saved in your daily log.");
        return;
      }
      setPhotos((prev) =>
        [{ ...created.data.item, source: "progress" as const }, ...prev].sort((a, b) =>
          b.date.localeCompare(a.date),
        ),
      );
      track("progress_photo_uploaded", { date: today });
    })();
  }

  async function onDeletePhoto(photoId: string) {
    const existing = displayPhotos.find((p) => p.photoId === photoId);
    if (!existing) return;
    if (existing.source === "legacy" && existing.legacyEntryId) {
      const latest = useHealthStore.getState().entries;
      const entry = latest.find((e) => e.id === existing.legacyEntryId);
      if (!entry) return;
      await saveEntry({ ...entry, photoUrl: null });
      setCompareSelection((prev) => prev.filter((id) => id !== photoId));
      track("progress_photo_deleted", { photoId, date: existing.date, source: "legacy" });
      return;
    }
    const accessToken = getAccessToken();
    if (!accessToken) return;
    const res = await deleteProgressPhoto(photoId, accessToken);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setPhotos((prev) => prev.filter((p) => p.photoId !== photoId));
    setCompareSelection((prev) => prev.filter((id) => id !== photoId));
    track("progress_photo_deleted", { photoId, date: existing?.date });
  }

  async function onToggleForecastOptIn(next: boolean) {
    const accessToken = getAccessToken();
    if (!accessToken) return;
    setSavingConsent(true);
    const payload = {
      ...settings,
      optInForecast: next,
      forecastDisclaimerAccepted: next,
      forecastGeneratedAt: next ? settings.forecastGeneratedAt : undefined,
    };
    const res = await patchSettings(payload, accessToken);
    setSavingConsent(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    updateSettings({
      optInForecast: next,
      forecastDisclaimerAccepted: next,
      forecastGeneratedAt: res.data.settings.forecastGeneratedAt,
    });
    if (next) {
      track("ai_forecast_opted_in", { source: "photo_tracker" });
    }
  }

  function toggleCompare(photoId: string) {
    setCompareSelection((prev) => {
      if (prev.includes(photoId)) return prev.filter((id) => id !== photoId);
      if (prev.length >= 2) return [prev[1], photoId];
      return [...prev, photoId];
    });
    setCompareAssessment(null);
  }

  async function runAssessment(photosToAssess: UiPhoto[], query: string) {
    const accessToken = getAccessToken();
    if (!accessToken) return;
    const payloads = photosToAssess
      .map((p) => uiPhotoToAssessmentPayload({ date: p.date, imageUrl: p.imageUrl }))
      .filter((x): x is NonNullable<typeof x> => x != null);
    if (payloads.length < 2) {
      setError(
        "Need two photos we can send for analysis (JPEG/PNG/WebP/GIF as cloud files or saved in your log).",
      );
      return;
    }
    setAssessing(true);
    setError(null);
    const res = await postProgressPhotoAssessment(
      {
        photos: payloads,
        query,
      },
      accessToken,
    );
    setAssessing(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setCompareAssessment(res.data);
  }

  async function runRangeEndpointsAssessment() {
    if (aiReadyInRange.length < 2) {
      setError("Need at least two analyzable photos in this date range (see note under the button).");
      return;
    }
    const sorted = [...aiReadyInRange].sort((a, b) => a.date.localeCompare(b.date));
    const pair = [sorted[0], sorted[sorted.length - 1]] as [UiPhoto, UiPhoto];
    setCompareSelection(pair.map((p) => p.photoId));
    await runAssessment(
      pair,
      `Compare my progress photos from ${pair[0].date} to ${pair[1].date}. Estimate visible body-composition trends, which areas look leaner or fuller, and call out uncertainty from pose, lighting, clothing, or mixing face vs torso shots.`,
    );
  }

  if (today === null) {
    return (
      <Card variant="surface">
        <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
          <h3 className="text-sm font-semibold tracking-tight text-zinc-100">Progress photos</h3>
        </div>
        <p className="text-[15px] font-medium text-slate-400">Loading…</p>
      </Card>
    );
  }

  return (
    <Card variant="surface">
      <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-zinc-800 pb-2.5">
        <h3 className="text-sm font-semibold tracking-tight text-zinc-100">Progress photos</h3>
        <div className="relative shrink-0" ref={hintRef}>
          <button
            type="button"
            onClick={() => setHintOpen((o) => !o)}
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-600/80 bg-zinc-900/80 text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-800 hover:text-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
            aria-expanded={hintOpen}
            aria-haspopup="dialog"
            aria-label="About privacy, AI compare, and optional features"
            title={syncNotice ? "Open hints (cloud album note inside)" : "Open hints"}
          >
            <CircleHelp className="h-4 w-4" aria-hidden />
            {syncNotice ? (
              <span
                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-zinc-900"
                aria-hidden
              />
            ) : null}
          </button>
          {hintOpen ? (
            <div
              className="absolute right-0 top-full z-30 mt-2 w-[min(calc(100vw-2rem),20rem)] rounded-xl border border-zinc-600/90 bg-zinc-950 p-3 text-left shadow-xl shadow-black/40"
              role="dialog"
              aria-label="Progress photos hints"
            >
              <p className="text-xs leading-relaxed text-zinc-300">
                Private to you; delete anytime. AI compare uses Anthropic (Claude) on our servers — estimate only, not
                medical advice.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-zinc-400">
                Optional: future AI body forecast (opt-in). Save today&apos;s log and sign in to use cloud photo
                uploads.
              </p>
              {syncNotice ? (
                <p className="mt-2 text-xs leading-relaxed text-amber-200/95">{syncNotice}</p>
              ) : null}
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-violet-500/25 bg-violet-950/20 px-2.5 py-2 text-xs text-violet-100/90">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" aria-hidden />
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={settings.optInForecast === true}
                    onChange={(e) => void onToggleForecastOptIn(e.target.checked)}
                    disabled={savingConsent}
                  />
                  <span>I opt in to future estimate-only body forecast features.</span>
                </label>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="mb-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={!todayEntry || !canUseCloud}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPick(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={!todayEntry || !canUseCloud}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-500/80 bg-slate-900/80 px-4 py-2.5 text-sm font-medium text-slate-100 shadow-inner shadow-black/20 transition-all duration-200 hover:border-slate-400 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Upload className="h-4 w-4 text-sky-400" aria-hidden />
          Upload photo for today
        </button>
      </div>

      {error ? (
        <div className="mb-3 rounded-lg border border-rose-500/40 bg-rose-900/20 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      ) : null}
      {loadingPhotos ? (
        <p className="text-sm text-slate-400">Loading photo gallery...</p>
      ) : displayPhotos.length === 0 ? (
        <button
          type="button"
          disabled={!todayEntry || !canUseCloud}
          onClick={() => todayEntry && canUseCloud && inputRef.current?.click()}
          className="flex min-h-[168px] w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-600 bg-slate-950/50 px-4 py-8 text-center transition-colors hover:border-slate-500 hover:bg-slate-900/60 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Camera className="mb-3 h-11 w-11 text-slate-500" aria-hidden />
          <p className="text-base font-semibold tracking-wide text-slate-200">
            No progress photos yet
          </p>
          <p className="mt-2 max-w-sm text-[13px] font-medium leading-relaxed text-slate-500">
            Tap to choose an image — it attaches to today&apos;s log.
          </p>
        </button>
      ) : (
        <>
          <div className="mb-3 rounded-xl border border-violet-500/20 bg-violet-950/20 p-3">
            <p className="mb-2 text-[11px] font-semibold text-violet-100">Date range · AI compare</p>
            <div className="mb-2 flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">From</span>
                <input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => {
                    setFilterDateFrom(e.target.value);
                    setCompareAssessment(null);
                  }}
                  className="rounded-lg border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
                />
              </label>
              <label className="flex flex-col gap-0.5">
                <span className="text-[10px] uppercase tracking-wide text-zinc-500">To</span>
                <input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => {
                    setFilterDateTo(e.target.value);
                    setCompareAssessment(null);
                  }}
                  className="rounded-lg border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-100"
                />
              </label>
            </div>
            <p className="mb-2 text-[11px] text-zinc-400">
              {photosInRange.length} in range · {aiReadyInRange.length} analyzable (cloud{" "}
              <span className="text-zinc-500">or</span> JPEG/PNG/WebP saved in your log)
            </p>
            {canUseCloud ? (
              <button
                type="button"
                disabled={assessing || aiReadyInRange.length < 2}
                onClick={() => void runRangeEndpointsAssessment()}
                className="w-full rounded-lg border border-violet-400/50 bg-violet-500/25 py-2.5 text-sm font-semibold text-violet-50 shadow-sm transition hover:bg-violet-500/35 disabled:cursor-not-allowed disabled:opacity-45"
              >
                {assessing ? "Generating…" : "Generate AI assessment"}
              </button>
            ) : (
              <p className="text-[11px] text-zinc-500">Sign in with AWS backend to run AI assessment.</p>
            )}
            <p className="mt-1.5 text-[10px] text-zinc-500">
              Sends images to <span className="text-zinc-400">Anthropic</span> (Claude). Compares oldest vs newest photo
              in the range.
            </p>
            {!aiCompareEnabled ? (
              <p className="mt-1 text-[10px] text-amber-200/90">
                If you get “disabled”, set <code className="text-amber-100/80">FF_BODY_COMPARE_AI</code> on the API
                Lambda and redeploy.
              </p>
            ) : null}
            {compareAssessment ? (
              <div className="mt-3 space-y-1.5 rounded-lg border border-zinc-600/80 bg-zinc-900/80 p-2.5 text-xs text-zinc-200">
                <p className="rounded border border-amber-500/30 bg-amber-950/40 px-2 py-1 text-[10px] text-amber-100/90">
                  ESTIMATE — not medical advice.
                </p>
                <p>
                  <span className="font-semibold">Summary:</span> {compareAssessment.summary}
                </p>
                <p className="text-zinc-400">
                  Confidence {compareAssessment.confidence}% · {compareAssessment.timeframe.from} →{" "}
                  {compareAssessment.timeframe.to}
                </p>
                {compareAssessment.highlights.length > 0 ? (
                  <ul className="space-y-1 text-zinc-300">
                    {compareAssessment.highlights.slice(0, 6).map((h, i) => (
                      <li key={`top-${h.area}-${i}`}>
                        - {h.area}: {h.assessment}
                      </li>
                    ))}
                  </ul>
                ) : null}
                <p className="text-[11px] text-zinc-400">{compareAssessment.disclaimer}</p>
              </div>
            ) : null}
          </div>
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
                <span className="p-3 text-xs font-medium text-white">
                  {formatDateLabel(e.date)}
                </span>
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
        </>
      )}
      {comparePhotos.length === 2 ? (
        <div className="mt-4 rounded-xl border border-violet-500/25 bg-violet-500/5 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-violet-100">Compare mode (estimate-only visual check)</p>
            <div className="flex items-center gap-2">
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
                    ? "Needs S3-style photo URLs or JPEG/PNG/WebP/GIF data in your log (not HEIC or blob: links)."
                    : undefined
                }
                className="rounded-md border border-violet-400/40 bg-violet-500/20 px-2 py-1 text-[11px] text-violet-100 hover:bg-violet-500/30 disabled:opacity-50"
              >
                {assessing ? "Analyzing…" : "AI assess these two"}
              </button>
              <button
                type="button"
                onClick={() => setCompareSelection([])}
                className="text-[11px] text-violet-200/80 hover:text-violet-100"
              >
                Clear
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {comparePhotos.map((p) => (
              <div key={p.photoId} className="rounded-lg border border-slate-700 bg-slate-900/70 p-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.imageUrl} alt={`Progress ${p.date}`} className="h-56 w-full rounded object-cover" />
                <p className="mt-1 text-xs text-slate-300">{formatDateLabel(p.date)}</p>
              </div>
            ))}
          </div>
          {comparePhotos.length === 2 && !assessing && !comparePhotos.every((p) => isPhotoAiAssessable(p)) ? (
            <p className="mt-2 text-[10px] leading-snug text-amber-200/90">
              AI compare needs each photo as an S3 link (including signed gallery URLs), or JPEG/PNG/WebP/GIF saved in
              your log — not HEIC, blob links, or non-S3 web URLs. Re-save as JPEG or upload again via the app.
            </p>
          ) : null}
          <p className="mt-2 text-[10px] text-zinc-500">
            Full write-up appears in <span className="text-zinc-400">Date range · AI compare</span> above after you
            generate.
          </p>
        </div>
      ) : null}
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
