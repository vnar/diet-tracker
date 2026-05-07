"use client";

import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { getMealsList, postDayMealEntry, type MealLibraryRow } from "@/lib/frontend-api-client";

type Props = {
  day: string;
  getAccessToken: () => string | null;
  onLogged: () => void;
};

function withinLast60Days(iso?: string): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return false;
  const cutoff = Date.now() - 60 * 24 * 60 * 60 * 1000;
  return t >= cutoff;
}

export function FrequentMealsCarousel(props: Props) {
  const [meals, setMeals] = useState<MealLibraryRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);

  useEffect(() => {
    const token = props.getAccessToken();
    if (!token) return;
    let cancelled = false;
    void (async () => {
      const res = await getMealsList(token, { sort: "frequent", limit: 40 });
      if (cancelled || !res.ok) return;
      const filtered = res.data.items
        .filter((m) => withinLast60Days(m.lastLoggedAt))
        .slice(0, 4);
      setMeals(filtered);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.day, props.getAccessToken]);

  if (meals.length === 0) return null;

  async function logOne(m: MealLibraryRow) {
    if (addingId) return;
    setError(null);
    setFlash(null);
    const token = props.getAccessToken();
    if (!token) {
      setError("Sign in to log a meal.");
      return;
    }
    setAddingId(m.id);
    const res = await postDayMealEntry(props.day, { meal_id: m.id }, token);
    setAddingId(null);
    if (res.ok) {
      track("meal_logged_from_frequent_carousel", { day: props.day, mealId: m.id });
      setFlash(m.name);
      window.setTimeout(() => setFlash(null), 2200);
      props.onLogged();
    } else {
      setError(res.error);
    }
  }

  return (
    <div className="mb-3">
      <p className="mb-1.5 text-[10px] leading-snug text-zinc-500">
        Frequent meals — <span className="text-zinc-400">tap a card</span> to add it to today (same as
        Library).
      </p>
      {error ? (
        <p className="mb-1.5 rounded-md border border-rose-900/50 bg-rose-950/35 px-2 py-1 text-[10px] text-rose-200">
          {error}
        </p>
      ) : null}
      {flash ? (
        <p className="mb-1.5 rounded-md border border-emerald-900/40 bg-emerald-950/25 px-2 py-1 text-[10px] text-emerald-200">
          Added: {flash}
        </p>
      ) : null}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {meals.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={addingId !== null}
            aria-busy={addingId === m.id}
            aria-label={`Add ${m.name} to today`}
            onClick={() => void logOne(m)}
            className="flex min-w-[7.5rem] max-w-[9rem] shrink-0 flex-col rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-2 text-left transition hover:border-emerald-600/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="line-clamp-2 text-[11px] font-medium leading-snug text-zinc-100">{m.name}</span>
            <span className="mt-1 text-[10px] text-zinc-500">{m.estKcal} kcal</span>
            {addingId === m.id ? (
              <span className="mt-0.5 text-[9px] text-emerald-400/90">Adding…</span>
            ) : (
              <span className="mt-0.5 text-[9px] text-zinc-600">Tap to add</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
