import { describe, expect, it } from "vitest";
import { computeWeightLogStreak } from "@/lib/streaks/weightLogStreak";
import type { DailyEntry } from "@/lib/types";

function entry(date: string, kg: number): DailyEntry {
  return {
    id: date,
    date,
    morningWeight: kg,
    lateSnack: false,
    highSodium: false,
    workout: false,
    alcohol: false,
  };
}

describe("computeWeightLogStreak", () => {
  it("returns 0 when there are no entries", () => {
    expect(computeWeightLogStreak([], "2026-05-12")).toBe(0);
  });

  it("counts consecutive days backward from asOfDate when logged", () => {
    const entries = [entry("2026-05-12", 80), entry("2026-05-11", 79.5), entry("2026-05-10", 79)];
    expect(computeWeightLogStreak(entries, "2026-05-12")).toBe(3);
  });

  it("breaks streak on a gap", () => {
    const entries = [entry("2026-05-12", 80), entry("2026-05-10", 79)];
    expect(computeWeightLogStreak(entries, "2026-05-12")).toBe(1);
  });

  it("uses yesterday as anchor when asOfDate is not logged", () => {
    const entries = [entry("2026-05-11", 79), entry("2026-05-10", 79.2)];
    expect(computeWeightLogStreak(entries, "2026-05-12")).toBe(2);
  });
});
