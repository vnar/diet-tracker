import { describe, expect, it } from "vitest";
import { parseFoodVisionEstimate } from "@/lib/food/parseFoodVisionJson";

describe("parseFoodVisionEstimate", () => {
  it("parses bare JSON", () => {
    const raw = `{"mealLabel":"Salad","kcalLow":400,"kcalMid":500,"kcalHigh":600,"proteinG":25,"confidence":0.8}`;
    const r = parseFoodVisionEstimate(raw);
    expect(r).toEqual({
      mealLabel: "Salad",
      kcalLow: 400,
      kcalMid: 500,
      kcalHigh: 600,
      proteinG: 25,
      confidence: 0.8,
    });
  });

  it("parses markdown-fenced JSON", () => {
    const raw = "```json\n{\"mealLabel\":\"X\",\"kcalLow\":1,\"kcalMid\":2,\"kcalHigh\":3,\"proteinG\":4,\"confidence\":0.5}\n```";
    const r = parseFoodVisionEstimate(raw);
    expect(r?.mealLabel).toBe("X");
    expect(r?.kcalMid).toBe(2);
  });

  it("maps confidence from 0–100 to 0–1", () => {
    const raw = `{"mealLabel":"X","kcalLow":1,"kcalMid":2,"kcalHigh":3,"proteinG":1,"confidence":75}`;
    const r = parseFoodVisionEstimate(raw);
    expect(r?.confidence).toBe(0.75);
  });

  it("returns null for invalid payloads", () => {
    expect(parseFoodVisionEstimate("")).toBeNull();
    expect(parseFoodVisionEstimate("not json")).toBeNull();
  });

  it("parses optional P1.3.1 fields when present", () => {
    const raw = `{"mealLabel":"Salad","kcalLow":400,"kcalMid":500,"kcalHigh":600,"proteinG":25,"confidence":0.8,"suggestedName":"Greek Salad With Chicken","suggestedMealType":"lunch","carbsGRange":{"low":30,"high":45},"fatGRange":{"low":10,"high":18}}`;
    const r = parseFoodVisionEstimate(raw);
    expect(r?.suggestedName).toBe("Greek Salad With Chicken");
    expect(r?.suggestedMealType).toBe("lunch");
    expect(r?.carbsGRange).toEqual({ low: 30, high: 45 });
    expect(r?.fatGRange).toEqual({ low: 10, high: 18 });
  });
});
