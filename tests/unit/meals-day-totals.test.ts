import { describe, expect, it } from "vitest";
import { getDayTotals } from "@/lib/meals/dayTotals";

describe("getDayTotals", () => {
  it("uses manual values when flag is off", () => {
    const r = getDayTotals({
      mealLibraryEnabled: false,
      mealEntries: [{ kcal: 500, proteinG: 30, deletedAt: undefined }],
      manualCalories: 100,
      manualProtein: 5,
    });
    expect(r.fromMeals).toBe(false);
    expect(r.caloriesDisplay).toBe("100");
    expect(r.proteinDisplay).toBe("5");
  });

  it("uses manual values when flag is on but no entries", () => {
    const r = getDayTotals({
      mealLibraryEnabled: true,
      mealEntries: [],
      manualCalories: 200,
      manualProtein: 12,
    });
    expect(r.fromMeals).toBe(false);
    expect(r.caloriesDisplay).toBe("200");
  });

  it("sums active entries when flag is on and entries exist", () => {
    const r = getDayTotals({
      mealLibraryEnabled: true,
      mealEntries: [
        { kcal: 400, proteinG: 25, deletedAt: undefined },
        { kcal: 300, proteinG: 15, deletedAt: undefined },
      ],
      manualCalories: 999,
      manualProtein: 99,
    });
    expect(r.fromMeals).toBe(true);
    expect(r.caloriesDisplay).toBe("700");
    expect(r.proteinDisplay).toBe("40");
  });

  it("excludes soft-deleted entries from sum", () => {
    const r = getDayTotals({
      mealLibraryEnabled: true,
      mealEntries: [
        { kcal: 100, proteinG: 10, deletedAt: undefined },
        { kcal: 900, proteinG: 90, deletedAt: "2026-01-01T00:00:00.000Z" },
      ],
      manualCalories: 1,
      manualProtein: 1,
    });
    expect(r.fromMeals).toBe(true);
    expect(r.caloriesDisplay).toBe("100");
    expect(r.proteinDisplay).toBe("10");
  });
});
