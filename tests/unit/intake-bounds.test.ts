import { describe, expect, it } from "vitest";
import {
  MAX_REASONABLE_DAILY_CALORIES,
  MAX_REASONABLE_DAILY_PROTEIN_G,
  sanitizeDailyCalories,
  sanitizeDailyProtein,
} from "@/lib/nutrition/intakeBounds";

describe("intake bounds", () => {
  it("caps implausible calories while keeping valid values", () => {
    expect(sanitizeDailyCalories(2200)).toBe(2200);
    expect(sanitizeDailyCalories(15418)).toBe(MAX_REASONABLE_DAILY_CALORIES);
  });

  it("drops invalid negative or NaN values", () => {
    expect(sanitizeDailyCalories(-1)).toBeNull();
    expect(sanitizeDailyCalories(Number.NaN)).toBeNull();
    expect(sanitizeDailyProtein(-5)).toBeNull();
  });

  it("caps protein grams too", () => {
    expect(sanitizeDailyProtein(180)).toBe(180);
    expect(sanitizeDailyProtein(900)).toBe(MAX_REASONABLE_DAILY_PROTEIN_G);
  });
});
