import { describe, expect, it } from "vitest";
import { buildSpokenFoodMealsToLog } from "@/lib/voiceDailyLog/spokenFoodMealsFromReview";

describe("buildSpokenFoodMealsToLog", () => {
  it("returns null when no checked rows with valid kcal", () => {
    expect(
      buildSpokenFoodMealsToLog(
        [
          {
            description: "Grapes",
            estKcal: "",
            estProteinG: "2",
            includeInDaily: true,
          },
        ],
        "snack",
      ),
    ).toBeNull();
  });

  it("includes only checked rows with positive kcal", () => {
    const r = buildSpokenFoodMealsToLog(
      [
        {
          description: "Two bowls of grapes",
          estKcal: "120",
          estProteinG: "",
          includeInDaily: true,
        },
        {
          description: "Lemon",
          estKcal: "5",
          estProteinG: "0",
          includeInDaily: false,
        },
      ],
      "lunch",
    );
    expect(r).toEqual([
      {
        name: "Two bowls of grapes",
        kcal: 120,
        protein_g: 0,
        meal_type: "lunch",
      },
    ]);
  });
});
