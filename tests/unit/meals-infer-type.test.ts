import { describe, expect, it } from "vitest";
import { inferMealTypeFromLocalTime } from "@/lib/meals/mealTypes";

describe("inferMealTypeFromLocalTime", () => {
  it("maps wall-clock in America/New_York for fixed instants", () => {
    const breakfast = inferMealTypeFromLocalTime(new Date("2026-06-15T13:00:00.000Z"), "America/New_York");
    expect(breakfast).toBe("breakfast");
    const lunch = inferMealTypeFromLocalTime(new Date("2026-06-15T17:00:00.000Z"), "America/New_York");
    expect(lunch).toBe("lunch");
  });

  it("falls back without throwing on invalid timezone", () => {
    const t = inferMealTypeFromLocalTime(new Date("2026-06-15T12:00:00.000Z"), "Not/AZone");
    expect(["breakfast", "lunch", "dinner", "snack", "dessert"]).toContain(t);
  });
});
