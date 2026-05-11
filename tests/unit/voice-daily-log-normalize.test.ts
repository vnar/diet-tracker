import { describe, expect, it } from "vitest";
import { normalizeVoiceDailyParseRecord } from "@/lib/voiceDailyLog/normalizeParse";

describe("normalizeVoiceDailyParseRecord", () => {
  it("maps snake_case LLM JSON to VoiceDailyParsedFields", () => {
    const r = normalizeVoiceDailyParseRecord({
      morning_weight_kg: 80.2,
      night_weight_kg: null,
      calories: 2100,
      protein_g: 120,
      steps: 8500,
      sleep_hours: 7.5,
      workout: true,
      alcohol: false,
      late_snack: null,
      high_sodium: true,
      meals_summary: "Oatmeal, salad, chicken",
      confidence: 0.88,
      unclear_parts: [],
    });
    expect(r).not.toBeNull();
    expect(r!.morningWeightKg).toBe(80.2);
    expect(r!.nightWeightKg).toBeNull();
    expect(r!.calories).toBe(2100);
    expect(r!.proteinG).toBe(120);
    expect(r!.steps).toBe(8500);
    expect(r!.sleepHours).toBe(7.5);
    expect(r!.workout).toBe(true);
    expect(r!.alcohol).toBe(false);
    expect(r!.lateSnack).toBeNull();
    expect(r!.highSodium).toBe(true);
    expect(r!.mealsSummary).toBe("Oatmeal, salad, chicken");
    expect(r!.confidence).toBe(0.88);
    expect(r!.unclearParts).toEqual([]);
    expect(r!.foodItems).toEqual([]);
    expect(r!.activityBurnHint).toBeNull();
  });

  it("normalizes food_items and activity_burn_hint", () => {
    const r = normalizeVoiceDailyParseRecord({
      morning_weight_kg: null,
      food_items: [
        { description: "Two coffees", est_kcal: 40, est_protein_g: 2 },
        { description: "Bagel", est_kcal: 280, est_protein_g: null },
      ],
      activity_burn_hint: "biked 35 minutes",
      confidence: 0.7,
      unclear_parts: [],
    });
    expect(r!.foodItems).toHaveLength(2);
    expect(r!.foodItems[0]!.description).toBe("Two coffees");
    expect(r!.foodItems[0]!.estKcal).toBe(40);
    expect(r!.activityBurnHint).toBe("biked 35 minutes");
  });

  it("returns null for non-objects", () => {
    expect(normalizeVoiceDailyParseRecord(null)).toBeNull();
    expect(normalizeVoiceDailyParseRecord("x")).toBeNull();
    expect(normalizeVoiceDailyParseRecord([])).toBeNull();
  });

  it("accepts camelCase keys", () => {
    const r = normalizeVoiceDailyParseRecord({
      morningWeightKg: 70,
      unclearParts: ["garbled bit"],
      confidence: 0.3,
    });
    expect(r!.morningWeightKg).toBe(70);
    expect(r!.unclearParts).toEqual(["garbled bit"]);
    expect(r!.confidence).toBe(0.3);
  });

  it("clamps confidence to 0–1", () => {
    const hi = normalizeVoiceDailyParseRecord({ confidence: 2 });
    expect(hi!.confidence).toBe(1);
    const lo = normalizeVoiceDailyParseRecord({ confidence: -1 });
    expect(lo!.confidence).toBe(0);
  });
});
