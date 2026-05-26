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
