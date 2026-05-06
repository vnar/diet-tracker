/** Shared API contract for POST /v2/food/estimate (AWS HTTP API + JWT). */

import type { MealType } from "../meals/mealTypes";

export type MacroRangeEstimate = { low: number; high: number };

export type FoodVisionEstimate = {
  mealLabel: string;
  kcalLow: number;
  kcalMid: number;
  kcalHigh: number;
  proteinG: number;
  confidence: number;
  /** P1.3.1 — optional; concise title case dish name for library. */
  suggestedName?: string;
  /** P1.3.1 — optional; when null/omitted client infers from local time + timezone. */
  suggestedMealType?: MealType | null;
  /** P1.3.1 — optional carb range in grams. */
  carbsGRange?: MacroRangeEstimate;
  /** P1.3.1 — optional fat range in grams. */
  fatGRange?: MacroRangeEstimate;
};

export type FoodEstimateResponse = {
  estimate: FoodVisionEstimate;
  foodLogId: string;
};

export type FoodLogConfirmBody = {
  foodLogId: string;
  confirmedKcal: number;
  confirmedProtein: number;
};
