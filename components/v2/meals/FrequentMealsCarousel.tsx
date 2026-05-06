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
    const token = props.getAccessToken();
    if (!token) return;
    const res = await postDayMealEntry(props.day, { meal_id: m.id }, token);
    if (res.ok) {
      track("meal_logged_from_frequent_carousel", { day: props.day, mealId: m.id });
      props.onLogged();
    }
  }

  return (
    <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
      {meals.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => void logOne(m)}
          className="flex min-w-[7.5rem] max-w-[9rem] shrink-0 flex-col rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-2 text-left transition hover:border-emerald-600/40"
        >
          <span className="line-clamp-2 text-[11px] font-medium leading-snug text-zinc-100">{m.name}</span>
          <span className="mt-1 text-[10px] text-zinc-500">{m.estKcal} kcal</span>
        </button>
      ))}
    </div>
  );
}
