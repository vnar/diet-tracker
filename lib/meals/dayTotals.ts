export type DayMealEntryLike = {
  kcal: number | null | undefined | string;
  proteinG: number | null | undefined | string;
  deletedAt?: string | null;
};

export type DayTotalsInput = {
  mealLibraryEnabled: boolean;
  mealEntries: readonly DayMealEntryLike[];
  manualCalories: number | undefined;
  manualProtein: number | undefined;
};

export type DayTotalsResult = {
  /** Calories to show in the main field (string-ready in UI). */
  caloriesDisplay: string;
  proteinDisplay: string;
  /** When true, calories/protein fields should be read-only “from meals”. */
  fromMeals: boolean;
  activeMealCount: number;
};

function toFiniteNumber(v: unknown): number | null {
  if (v == null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function sumNumbers(values: (number | null | undefined | string)[]): number {
  let s = 0;
  for (const v of values) {
    const n = toFiniteNumber(v);
    if (n != null) s += n;
  }
  return s;
}

/**
 * Non-breaking aggregation: when the meal library flag is off, or there are no
 * active meal entries, totals follow manual `DailyEntry` values. When the flag
 * is on and at least one entry exists, totals are the sum of entries (deleted excluded).
 */
export function getDayTotals(input: DayTotalsInput): DayTotalsResult {
  const active = input.mealEntries.filter((e) => !e.deletedAt);
  const useMeals = input.mealLibraryEnabled && active.length > 0;
  if (!useMeals) {
    return {
      caloriesDisplay:
        input.manualCalories !== undefined ? String(Math.round(input.manualCalories)) : "",
      proteinDisplay:
        input.manualProtein !== undefined ? String(Math.round(input.manualProtein)) : "",
      fromMeals: false,
      activeMealCount: active.length,
    };
  }
  const kcal = sumNumbers(active.map((e) => e.kcal));
  const protein = sumNumbers(active.map((e) => e.proteinG));
  return {
    caloriesDisplay: String(Math.round(kcal)),
    proteinDisplay: String(Math.round(protein)),
    fromMeals: true,
    activeMealCount: active.length,
  };
}
