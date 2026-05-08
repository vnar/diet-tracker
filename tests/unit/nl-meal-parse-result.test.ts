import { describe, expect, it } from "vitest";
import { extractJsonObjectFromNlText, parseNlMealLlmJson } from "@/lib/meals/nlMealParseResult";

describe("nlMealParseResult", () => {
  it("extracts JSON when wrapped in prose", () => {
    const inner = `{"title":"Test","confidence":85,"items":[{"name":"Dal","quantity_description":"1 cup","quantity_grams":240,"kcal":198,"protein_g":10.0,"carbs_g":30.0,"fat_g":5.0,"fiber_g":8.0,"icon_hint":"soup"}],"meal_type_guess":"lunch","notes":null}`;
    const raw = `Here is the meal:\n${inner}\nEnjoy.`;
    expect(extractJsonObjectFromNlText(raw)).toBe(inner);
  });

  it("parses minimal valid payload", () => {
    const json = {
      title: "Dal rice",
      confidence: 88,
      items: [
        {
          name: "Dal",
          quantity_description: "1 cup · 240g",
          quantity_grams: 240,
          kcal: 198,
          protein_g: 10.0,
          carbs_g: 30.0,
          fat_g: 5.0,
          fiber_g: 8.0,
          icon_hint: "soup",
        },
        {
          name: "Rice",
          quantity_description: "1 cup · 180g",
          quantity_grams: 180,
          kcal: 206,
          protein_g: 4.0,
          carbs_g: 45.0,
          fat_g: 0.5,
          fiber_g: 0.5,
          icon_hint: "bowl-rice",
        },
      ],
      meal_type_guess: "lunch",
      notes: null,
    };
    const r = parseNlMealLlmJson(JSON.stringify(json));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.items).toHaveLength(2);
      expect(r.data.meal_type_guess).toBe("lunch");
      expect(r.data.items[0]?.kcal).toBe(198);
    }
  });

  it("rejects empty items", () => {
    const r = parseNlMealLlmJson(
      JSON.stringify({
        title: "X",
        confidence: 80,
        items: [],
        meal_type_guess: "snack",
        notes: null,
      }),
    );
    expect(r.ok).toBe(false);
  });
});
