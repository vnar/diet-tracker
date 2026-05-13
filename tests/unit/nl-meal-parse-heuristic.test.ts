import { describe, expect, it } from "vitest";
import {
  heuristicNlMealParse,
  parseLeadingQuantity,
  splitMealDescriptionSegments,
} from "@/lib/meals/nlMealParseHeuristic";

describe("splitMealDescriptionSegments", () => {
  it("splits on and", () => {
    expect(splitMealDescriptionSegments("dal and rice")).toEqual(["dal", "rice"]);
  });
});

describe("parseLeadingQuantity", () => {
  it("parses cups of", () => {
    expect(parseLeadingQuantity("2 cups of coffee")).toEqual({ factor: 2, foodPhrase: "coffee" });
  });
});

describe("heuristicNlMealParse", () => {
  it("handles two cups of coffee with plausible macros", () => {
    const r = heuristicNlMealParse("2 cups of coffee");
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.kcal).toBe(10);
    expect(r.items[0]!.quantity_grams).toBe(480);
    expect(r.meal_type_guess).toBe("snack");
    expect(r.title.toLowerCase()).toContain("coffee");
  });

  it("returns two items for dal and rice", () => {
    const r = heuristicNlMealParse("dal and rice");
    expect(r.items.length).toBeGreaterThanOrEqual(2);
    const names = r.items.map((i) => i.name.toLowerCase()).join(" ");
    expect(names).toMatch(/dal|rice/);
  });

  it("uses generic fallback for unknown food", () => {
    const r = heuristicNlMealParse("something obscure from a food truck");
    expect(r.items.length).toBeGreaterThanOrEqual(1);
    expect(r.items[0]!.kcal).toBeGreaterThan(0);
  });
});
