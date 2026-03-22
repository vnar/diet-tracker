"use client";

import { useRef } from "react";
import { Camera } from "lucide-react";
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
        <p className="text-sm text-slate-500">Loading…</p>
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
          className="rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-800 transition-all duration-200 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          Upload photo for today
        </button>
        {!todayEntry ? (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Save your daily log first — then you can attach a progress photo.
          </p>
        ) : null}
      </div>

      {withPhotos.length === 0 ? (
        <div className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/80">
          <Camera className="mb-2 h-10 w-10 text-slate-400" />
          <p className="text-sm text-slate-500">
            Add a progress photo — it will attach to today&apos;s log.
          </p>
        </div>
      ) : (
        <div className="columns-2 gap-3 md:columns-3">
          {withPhotos.map((e) => (
            <div
              key={e.id}
              className="group relative mb-3 break-inside-avoid overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={e.photoUrl}
                alt={`Progress ${e.date}`}
                className="w-full object-cover"
              />
              <div className="pointer-events-none absolute inset-0 flex items-end bg-gradient-to-t from-black/60 to-transparent opacity-0 transition-opacity duration-200 group-hover:opacity-100">
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
