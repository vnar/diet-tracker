import { describe, expect, it } from "vitest";
import type { FoodEstimateResponse } from "@/lib/food/contracts";

function isFoodEstimateResponse(x: unknown): x is FoodEstimateResponse {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (typeof o.foodLogId !== "string" || !o.foodLogId) return false;
  const est = o.estimate;
  if (!est || typeof est !== "object") return false;
  const e = est as Record<string, unknown>;
  return (
    typeof e.mealLabel === "string" &&
    typeof e.kcalLow === "number" &&
    typeof e.kcalMid === "number" &&
    typeof e.kcalHigh === "number" &&
    typeof e.proteinG === "number" &&
    typeof e.confidence === "number"
  );
}

describe("food estimate API contract", () => {
  it("accepts a well-formed success payload", () => {
    const payload: FoodEstimateResponse = {
      foodLogId: "food#2026-05-05#1#a",
      estimate: {
        mealLabel: "Rice bowl",
        kcalLow: 500,
        kcalMid: 620,
        kcalHigh: 740,
        proteinG: 35,
        confidence: 0.72,
      },
    };
    expect(isFoodEstimateResponse(payload)).toBe(true);
  });

  it("rejects missing estimate fields", () => {
    expect(
      isFoodEstimateResponse({
        foodLogId: "x",
        estimate: { mealLabel: "a", kcalLow: 1, kcalMid: 2, kcalHigh: 3 },
      }),
    ).toBe(false);
  });
});
