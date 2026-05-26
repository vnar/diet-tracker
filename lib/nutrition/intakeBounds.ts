export const MAX_REASONABLE_DAILY_CALORIES = 6000;
export const MAX_REASONABLE_DAILY_PROTEIN_G = 500;

function toFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Normalize user-entered daily kcal to prevent accidental extra digits from breaking cards.
 * Returns `null` when missing/invalid.
 */
export function sanitizeDailyCalories(value: unknown): number | null {
  const n = toFiniteNumber(value);
  if (n == null) return null;
  if (n < 0) return null;
  return Math.min(Math.round(n), MAX_REASONABLE_DAILY_CALORIES);
}

/** Normalize protein grams from manual inputs; returns `null` when invalid. */
export function sanitizeDailyProtein(value: unknown): number | null {
  const n = toFiniteNumber(value);
  if (n == null) return null;
  if (n < 0) return null;
  return Math.min(Math.round(n), MAX_REASONABLE_DAILY_PROTEIN_G);
}

export type ResolvedConsumedCalories = {
  consumed: number;
  usedMeals: boolean;
  ignoredInvalidManual: boolean;
};

/**
 * Resolve consumed kcal for energy balance.
 * - Prefer meal-library totals when present.
 * - If no meals exist and manual kcal is wildly high, treat as accidental and ignore (0).
 */
export function resolveConsumedCalories(
  mealKcalTotal: number,
  manualCaloriesRaw: unknown,
): ResolvedConsumedCalories {
  const meals = Number.isFinite(mealKcalTotal) ? Math.max(0, Math.round(mealKcalTotal)) : 0;
  if (meals > 0) {
    return { consumed: meals, usedMeals: true, ignoredInvalidManual: false };
  }
  const raw = toFiniteNumber(manualCaloriesRaw);
  const sanitized = sanitizeDailyCalories(manualCaloriesRaw);
  if (raw != null && raw > MAX_REASONABLE_DAILY_CALORIES) {
    return { consumed: 0, usedMeals: false, ignoredInvalidManual: true };
  }
  return { consumed: sanitized ?? 0, usedMeals: false, ignoredInvalidManual: false };
}
