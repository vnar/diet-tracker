"use client";

import { useState } from "react";
import { Utensils, X } from "lucide-react";
import { track } from "@/lib/analytics";
import type { DayMealEntryRow } from "@/lib/frontend-api-client";
import { deleteDayMealEntry } from "@/lib/frontend-api-client";

type Props = {
  day: string;
  entries: DayMealEntryRow[];
  getAccessToken: () => string | null;
  onChanged: () => void;
  /** Section title; default keeps the main dashboard wording unchanged. */
  heading?: string;
  /** When true, show totals shell + hint even if there are no meal rows (e.g. past-day browse modal). */
  showWhenEmpty?: boolean;
};

export function MealsTodayPanel(props: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DayMealEntryRow | null>(null);

  const showEmptyShell = props.entries.length === 0 && props.showWhenEmpty;
  if (props.entries.length === 0 && !showEmptyShell) return null;

  const totalKcal = props.entries.reduce((s, e) => s + (Number(e.kcal) || 0), 0);
  const totalProtein = props.entries.reduce((s, e) => s + (Number(e.proteinG) || 0), 0);

  async function remove(id: string) {
    const token = props.getAccessToken();
    if (!token) return;
    setBusyId(id);
    const res = await deleteDayMealEntry(props.day, id, token);
    setBusyId(null);
    if (res.ok) {
      track("day_meal_entry_removed", { day: props.day, entryId: id });
      props.onChanged();
    }
  }

  return (
    <div className="mb-3 rounded-xl border border-zinc-800/90 bg-gradient-to-b from-zinc-900/90 to-zinc-950/80 p-3 shadow-inner shadow-black/20">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-zinc-800/80 pb-2">
        <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
          {props.heading ?? "Meals today"}
        </p>
        <p className="text-right text-[11px] text-zinc-400">
          <span className="font-mono text-zinc-100">{Math.round(totalKcal)}</span> kcal
          <span className="mx-1.5 text-zinc-600">·</span>
          <span className="font-mono text-zinc-100">{Math.round(totalProtein)}</span> g protein
        </p>
      </div>
      {props.entries.length > 0 ? (
        <ul className="space-y-2">
          {props.entries.map((e) => (
            <li
              key={e.id}
              className="flex items-center gap-2 rounded-lg border border-zinc-700/50 bg-zinc-900/40 px-2.5 py-2 transition-colors hover:border-emerald-800/40 hover:bg-zinc-900/70"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-800/90 text-zinc-400 ring-1 ring-zinc-700/50">
                <Utensils className="h-4 w-4" aria-hidden />
              </div>
              <button
                type="button"
                className="min-w-0 flex-1 text-left"
                onClick={() => setDetail(e)}
              >
                <p className="truncate text-xs font-medium text-zinc-100">{e.nameSnapshot}</p>
                <p className="text-[10px] capitalize text-zinc-500">
                  {e.mealType} · {e.kcal ?? "—"} kcal · {e.proteinG ?? "—"}g protein
                </p>
              </button>
              <button
                type="button"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-rose-950/60 hover:text-rose-200 disabled:opacity-40"
                aria-label={`Remove ${e.nameSnapshot}`}
                disabled={busyId === e.id}
                onClick={() => void remove(e.id)}
              >
                <X className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] leading-snug text-zinc-500">
          No meals for this day yet. Add from frequent picks above, the library / photo / AI buttons beside Calories, or
          log manually when no meals are present.
        </p>
      )}

      {detail ? (
        <div
          className="fixed inset-0 z-[180] flex items-end justify-center bg-black/60 p-4 sm:items-center"
          role="presentation"
          onMouseDown={(ev) => {
            if (ev.target === ev.currentTarget) setDetail(null);
          }}
        >
          <div
            className="w-full max-w-sm rounded-xl border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
            role="dialog"
            aria-modal="true"
          >
            <h3 className="text-sm font-semibold text-zinc-100">{detail.nameSnapshot}</h3>
            <p className="mt-1 text-xs capitalize text-zinc-500">{detail.mealType}</p>
            <dl className="mt-3 space-y-1 text-xs text-zinc-300">
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Calories</dt>
                <dd>{detail.kcal ?? "—"} kcal</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-zinc-500">Protein</dt>
                <dd>{detail.proteinG ?? "—"} g</dd>
              </div>
              {detail.notes ? (
                <div className="pt-2 text-zinc-400">
                  <dt className="text-zinc-500">Notes</dt>
                  <dd className="mt-0.5">{detail.notes}</dd>
                </div>
              ) : null}
            </dl>
            <button
              type="button"
              className="mt-4 w-full rounded-lg border border-zinc-700 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              onClick={() => setDetail(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
