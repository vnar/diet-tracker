import type { MealType } from "@/lib/meals/mealTypes";

/** Review row shape from the voice sheet (string inputs for editing). */
export type VoiceFoodReviewRow = {
  description: string;
  estKcal: string;
  estProteinG: string;
  includeInDaily: boolean;
};

/**
 * Builds payloads for POST /v2/days/.../meal-entries (with matching library create in the caller).
 * Only checked rows with a positive kcal estimate are included — additive to whatever is already logged today.
 */
export function buildSpokenFoodMealsToLog(
  rows: VoiceFoodReviewRow[],
  mealType: MealType,
): Array<{
  name: string;
  kcal: number;
  protein_g: number;
  meal_type: MealType;
}> | null {
  const out: Array<{
    name: string;
    kcal: number;
    protein_g: number;
    meal_type: MealType;
  }> = [];
  for (const row of rows) {
    if (!row.includeInDaily) continue;
    const k = row.estKcal.trim() === "" ? NaN : parseFloat(row.estKcal);
    if (Number.isNaN(k) || k <= 0) continue;
    const pr = row.estProteinG.trim() === "" ? NaN : parseFloat(row.estProteinG);
    const proteinG = Number.isNaN(pr) || pr < 0 ? 0 : Math.round(pr);
    const name = row.description.trim() || "Meal";
    out.push({
      name,
      kcal: Math.round(k),
      protein_g: proteinG,
      meal_type: mealType,
    });
  }
  return out.length > 0 ? out : null;
}
