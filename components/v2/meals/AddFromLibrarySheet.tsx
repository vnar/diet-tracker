"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Library } from "lucide-react";
import { track } from "@/lib/analytics";
import { getMealsList, postDayMealEntry, type MealLibraryRow } from "@/lib/frontend-api-client";

type Props = {
  day: string;
  getAccessToken: () => string | null;
  onAdded: () => void;
};

export function AddFromLibrarySheet(props: Props) {
  const [open, setOpen] = useState(false);
  const [meals, setMeals] = useState<MealLibraryRow[]>([]);
  const [q, setQ] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [lastAddedName, setLastAddedName] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setLastAddedName(null);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const token = props.getAccessToken();
    if (!token) return;
    let cancelled = false;
    void (async () => {
      const res = await getMealsList(token, { sort: "frequent", limit: 40, q: q.trim() || undefined });
      if (!cancelled && res.ok) setMeals(res.data.items);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, q, props.getAccessToken]);

  async function pick(m: MealLibraryRow) {
    if (addingId) return;
    setError(null);
    setLastAddedName(null);
    const token = props.getAccessToken();
    if (!token) {
      setError("Sign in to add meals from your library.");
      return;
    }
    setAddingId(m.id);
    const res = await postDayMealEntry(props.day, { meal_id: m.id }, token);
    setAddingId(null);
    if (res.ok) {
      track("meal_logged_from_library", { day: props.day, mealId: m.id, source: "sheet" });
      setLastAddedName(m.name);
      props.onAdded();
    } else {
      setError(res.error);
    }
  }

  return (
    <>
      <button
        type="button"
        className="flex h-9 shrink-0 items-center gap-1 rounded-lg border border-zinc-600 bg-zinc-800 px-2 text-[10px] font-medium text-zinc-300 hover:border-emerald-600/60 hover:text-emerald-400"
        aria-label="Add from library"
        title="Add from library"
        onClick={() => {
          setError(null);
          setLastAddedName(null);
          setOpen(true);
          track("meal_library_searched", { day: props.day, source: "open_sheet" });
        }}
      >
        <Library className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Library</span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[190] flex items-end justify-center bg-black/70 p-4 sm:items-center"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setOpen(false);
              }}
            >
              <div className="max-h-[70vh] w-full max-w-md overflow-hidden rounded-2xl border border-zinc-700 bg-zinc-900 shadow-xl">
                <div className="border-b border-zinc-800 p-3">
                  <h2 className="text-sm font-semibold text-zinc-100">Add from library</h2>
                  <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                    Tap a meal to add it to today. You can add several in a row, then close when
                    you&apos;re done.
                  </p>
                  {error ? (
                    <p className="mt-2 rounded-lg border border-rose-900/60 bg-rose-950/40 px-2 py-1.5 text-[11px] text-rose-200">
                      {error}
                    </p>
                  ) : null}
                  {lastAddedName ? (
                    <p className="mt-2 rounded-lg border border-emerald-900/50 bg-emerald-950/30 px-2 py-1.5 text-[11px] text-emerald-200">
                      Added: {lastAddedName}
                    </p>
                  ) : null}
                  <input
                    className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 text-xs text-zinc-100"
                    placeholder="Search…"
                    value={q}
                    onChange={(e) => {
                      setQ(e.target.value);
                      track("meal_library_searched", { day: props.day, q: e.target.value });
                    }}
                  />
                </div>
                <ul className="max-h-[50vh] overflow-y-auto p-2">
                  {meals.length === 0 ? (
                    <li className="px-2 py-6 text-center text-xs text-zinc-500">No saved meals yet.</li>
                  ) : (
                    meals.map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          disabled={addingId !== null}
                          aria-busy={addingId === m.id}
                          className="flex w-full flex-col rounded-lg px-2 py-2 text-left hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                          onClick={() => void pick(m)}
                        >
                          <span className="text-xs font-medium text-zinc-100">{m.name}</span>
                          <span className="text-[10px] capitalize text-zinc-500">
                            {m.mealType} · {m.estKcal} kcal
                            {m.estProteinG != null ? ` · ${m.estProteinG}g protein` : ""}
                          </span>
                          {addingId === m.id ? (
                            <span className="mt-0.5 text-[10px] text-emerald-400/90">Adding…</span>
                          ) : (
                            <span className="mt-0.5 text-[10px] text-zinc-600">Tap to add</span>
                          )}
                        </button>
                      </li>
                    ))
                  )}
                </ul>
                <div className="border-t border-zinc-800 p-2">
                  <button
                    type="button"
                    className="w-full rounded-lg py-2 text-sm text-zinc-400 hover:bg-zinc-800"
                    onClick={() => setOpen(false)}
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
