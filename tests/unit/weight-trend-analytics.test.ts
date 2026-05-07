import { describe, expect, it } from "vitest";
import { goalEditedFieldNames } from "@/lib/weightTrendAnalytics";

describe("goalEditedFieldNames", () => {
  const base = { startWeight: 85, goalWeight: 72, targetDate: "2026-12-01" };

  it("returns empty when nothing changed", () => {
    expect(goalEditedFieldNames(base, { ...base })).toEqual([]);
  });

  it("detects goal weight change", () => {
    expect(
      goalEditedFieldNames(base, { ...base, goalWeight: 70 }),
    ).toEqual(["goal_weight"]);
  });

  it("detects target date change", () => {
    expect(
      goalEditedFieldNames(base, { ...base, targetDate: "2026-11-01" }),
    ).toEqual(["target_date"]);
  });

  it("detects start weight change", () => {
    expect(
      goalEditedFieldNames(base, { ...base, startWeight: 86 }),
    ).toEqual(["start_weight"]);
  });

  it("returns multiple fields when several change", () => {
    expect(
      goalEditedFieldNames(base, {
        startWeight: 80,
        goalWeight: 70,
        targetDate: "2026-06-01",
      }),
    ).toEqual(["start_weight", "goal_weight", "target_date"]);
  });
});
