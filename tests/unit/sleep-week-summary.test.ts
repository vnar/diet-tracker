import { describe, expect, it } from "vitest";
import { averageSleepLastDays } from "@/lib/sleep/sleepWeekSummary";
import type { DailyEntry } from "@/lib/types";

function e(date: string, sleep: number): DailyEntry {
  return {
    id: date,
    date,
    morningWeight: 70,
    sleep,
    lateSnack: false,
    highSodium: false,
    workout: false,
    alcohol: false,
  };
}

describe("averageSleepLastDays", () => {
  it("returns null when no sleep data in window", () => {
    expect(averageSleepLastDays([], "2026-05-12", 7)).toBeNull();
  });

  it("averages positive sleep hours in the window", () => {
    const entries = [e("2026-05-12", 7), e("2026-05-11", 5), e("2026-05-10", 9)];
    expect(averageSleepLastDays(entries, "2026-05-12", 3)).toBeCloseTo(7, 5);
  });

  it("skips days with zero or missing sleep", () => {
    const entries = [e("2026-05-12", 8), { ...e("2026-05-11", 0), sleep: 0 }];
    expect(averageSleepLastDays(entries, "2026-05-12", 2)).toBe(8);
  });
});
