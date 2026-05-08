"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Scale, ShieldCheck, Trash2, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { getEntryForDate } from "@/lib/calculations";
import {
  deleteProgressPhoto,
  getProgressPhotos,
  isAwsBackendEnabled,
  patchSettings,
  postProgressPhoto,
  uploadPhotoFile,
} from "@/lib/frontend-api-client";
import { track } from "@/lib/analytics";
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
  const { status, getAccessToken } = useCognitoAuth();
  const entries = useHealthStore((s) => s.entries);
  const settings = useHealthStore((s) => s.settings);
  const updateSettings = useHealthStore((s) => s.updateSettings);
  const saveEntry = useSaveEntry();
  const today = useClientTodayKey();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState<
    Array<{
      photoId: string;
      userId: string;
      date: string;
      imageUrl?: string;
      storageKey?: string;
      weightAtPhoto?: number;
      createdAt: string;
    }>
  >([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [previewPhoto, setPreviewPhoto] = useState<{ url: string; date: string } | null>(null);
  const [compareSelection, setCompareSelection] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [savingConsent, setSavingConsent] = useState(false);

  const todayEntry = today ? getEntryForDate(entries, today) : undefined;
  const canUseCloud = isAwsBackendEnabled() && status === "authenticated";

  useEffect(() => {
    if (!canUseCloud) return;
    const accessToken = getAccessToken();
    if (!accessToken) return;
    setLoadingPhotos(true);
    void getProgressPhotos(accessToken)
      .then((res) => {
        if (!res.ok) {
          setError(res.error);
          return;
        }
        setPhotos(res.data.items);
      })
      .finally(() => setLoadingPhotos(false));
  }, [canUseCloud, getAccessToken]);

  const comparePhotos = useMemo(
    () => photos.filter((p) => compareSelection.includes(p.photoId)),
    [photos, compareSelection],
  );

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
        setError(created.error);
        return;
      }
      setPhotos((prev) => [created.data.item, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      track("progress_photo_uploaded", { date: today });
      await saveEntry({
        ...existing,
        id: existing.id,
        photoUrl: upload.photoUrl,
      });
    })();
  }

  async function onDeletePhoto(photoId: string) {
    const accessToken = getAccessToken();
    if (!accessToken) return;
    const existing = photos.find((p) => p.photoId === photoId);
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
  }

  if (today === null) {
    return (
      <Card title="Progress photos" variant="surface">
        <p className="text-[15px] font-medium text-slate-400">Loading…</p>
      </Card>
    );
  }

  return (
    <Card title="Progress photos" variant="surface">
      <div className="mb-3">
        <p className="mb-2 text-xs text-slate-300">
          Your photos are private to your account and you can delete them anytime.
        </p>
        <div className="mb-3 rounded-xl border border-violet-500/30 bg-violet-500/10 p-3">
          <div className="flex items-center gap-2 text-xs text-violet-100">
            <ShieldCheck className="h-4 w-4" />
            AI body forecast is opt-in only and will be shown as an estimate.
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-violet-100">
            <input
              type="checkbox"
              checked={settings.optInForecast === true}
              onChange={(e) => void onToggleForecastOptIn(e.target.checked)}
              disabled={savingConsent}
            />
            I opt in to future AI body forecast estimates.
          </label>
        </div>
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
        {!todayEntry || !canUseCloud ? (
          <p className="mt-1.5 text-xs text-slate-400">
            Save today&apos;s log and sign in to use cloud photo uploads.
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="mb-3 rounded-lg border border-rose-500/40 bg-rose-900/20 px-3 py-2 text-xs text-rose-200">
          {error}
        </div>
      ) : null}
      {loadingPhotos ? (
        <p className="text-sm text-slate-400">Loading photo gallery...</p>
      ) : photos.length === 0 ? (
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
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-slate-300">Gallery by date</p>
            <p className="text-[11px] text-slate-400">Select 2 photos to compare</p>
          </div>
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
            {photos.map((e) => (
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
            <button
              type="button"
              onClick={() => setCompareSelection([])}
              className="text-[11px] text-violet-200/80 hover:text-violet-100"
            >
              Clear
            </button>
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
