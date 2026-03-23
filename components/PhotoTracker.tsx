"use client";

import { useRef } from "react";
import { Camera, Trash2, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import type { DailyEntry } from "@/lib/types";
import {
  getEntryForDate,
  sortEntriesByDateAsc,
} from "@/lib/calculations";
import {
  isAwsBackendEnabled,
  uploadPhotoFile,
} from "@/lib/frontend-api-client";
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
  const saveEntry = useSaveEntry();
  const today = useClientTodayKey();
  const inputRef = useRef<HTMLInputElement>(null);

  const todayEntry = today ? getEntryForDate(entries, today) : undefined;

  const withPhotos = sortEntriesByDateAsc(entries)
    .filter(
      (e): e is DailyEntry & { photoUrl: string } =>
        typeof e.photoUrl === "string" && e.photoUrl.length > 0
    )
    .reverse();

  function onPick(f: File) {
    if (!today) return;
    const dateKey = today;
    const latest = useHealthStore.getState().entries;
    const existing = getEntryForDate(latest, dateKey);
    if (!existing) return;

    if (isAwsBackendEnabled()) {
      if (status !== "authenticated") return;
      const accessToken = getAccessToken();
      if (!accessToken) return;
      void (async () => {
        const upload = await uploadPhotoFile(f, accessToken);
        if (!upload.ok || !upload.photoUrl) return;
        await saveEntry({
          ...existing,
          id: existing.id,
          photoUrl: upload.photoUrl,
        });
      })();
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return;
      void saveEntry({
        ...existing,
        id: existing.id,
        photoUrl: result,
      });
    };
    reader.readAsDataURL(f);
  }

  async function onDeletePhoto(entryId: string) {
    const latest = useHealthStore.getState().entries;
    const existing = latest.find((entry) => entry.id === entryId);
    if (!existing) return;
    await saveEntry({
      ...existing,
      photoUrl: null,
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
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          disabled={!todayEntry}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onPick(file);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={!todayEntry}
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-500/80 bg-slate-900/80 px-4 py-2.5 text-sm font-medium text-slate-100 shadow-inner shadow-black/20 transition-all duration-200 hover:border-slate-400 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Upload className="h-4 w-4 text-sky-400" aria-hidden />
          Upload photo for today
        </button>
        {!todayEntry ? (
          <p className="mt-1.5 text-xs text-slate-400">
            Save your daily log first — then you can attach a progress photo.
          </p>
        ) : null}
      </div>

      {withPhotos.length === 0 ? (
        <button
          type="button"
          disabled={!todayEntry}
          onClick={() => todayEntry && inputRef.current?.click()}
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
        <div className="columns-2 gap-3 md:columns-3">
          {withPhotos.map((e) => (
            <div
              key={e.id}
              className="group relative mb-3 break-inside-avoid overflow-hidden rounded-xl border border-slate-600 bg-slate-950/30"
            >
              <button
                type="button"
                onClick={() => void onDeletePhoto(e.id)}
                className="absolute right-2 top-2 z-10 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/20 bg-black/60 text-white opacity-0 shadow-sm transition-all duration-200 hover:bg-red-600/90 group-hover:opacity-100 focus-visible:opacity-100"
                aria-label={`Delete photo from ${formatDateLabel(e.date)}`}
                title="Delete photo"
              >
                <Trash2 className="h-4 w-4" aria-hidden />
              </button>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={e.photoUrl}
                alt={`Progress ${e.date}`}
                className="w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/70 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
                <span className="p-3 text-xs font-medium text-white">
                  {formatDateLabel(e.date)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
