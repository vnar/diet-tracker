"use client";

import { useRef } from "react";
import { Camera, Upload } from "lucide-react";
import { Card } from "@/components/ui/Card";
import {
  getEntryForDate,
  sortEntriesByDateAsc,
} from "@/lib/calculations";
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
  const entries = useHealthStore((s) => s.entries);
  const saveEntry = useSaveEntry();
  const today = useClientTodayKey();
  const inputRef = useRef<HTMLInputElement>(null);

  const todayEntry = today ? getEntryForDate(entries, today) : undefined;

  const withPhotos = sortEntriesByDateAsc(entries)
    .filter((e) => e.photoUrl)
    .reverse();

  function onPick(f: File) {
    if (!today) return;
    const dateKey = today;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") return;
      const latest = useHealthStore.getState().entries;
      const existing = getEntryForDate(latest, dateKey);
      if (!existing) return;
      void saveEntry({
        ...existing,
        id: existing.id,
        photoUrl: result,
      });
    };
    reader.readAsDataURL(f);
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
      <div className="mb-4">
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
          <p className="mt-2 text-xs text-slate-500">
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
