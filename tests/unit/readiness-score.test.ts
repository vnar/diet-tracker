import { describe, expect, it } from "vitest";
import { computeDailyReadiness } from "@/lib/recovery/readinessScore";
import type { DailyEntry } from "@/lib/types";

function e(date: string, patch: Partial<DailyEntry>): DailyEntry {
  return {
    id: date,
    date,
    morningWeight: 80,
    lateSnack: false,
    highSodium: false,
    workout: false,
    alcohol: false,
    ...patch,
  };
}

describe("computeDailyReadiness", () => {
  it("returns yellow default when yesterday is missing", () => {
    const r = computeDailyReadiness([], "2026-05-25");
    expect(r.zone).toBe("yellow");
    expect(r.yesterdayScore).toBeNull();
  });

  it("uses 7-day trend and yesterday signal", () => {
    const entries: DailyEntry[] = [
      e("2026-05-17", { sleep: 6.4, steps: 6400 }),
      e("2026-05-18", { sleep: 6.8, steps: 6800 }),
      e("2026-05-19", { sleep: 7.0, steps: 7200, workout: true }),
      e("2026-05-20", { sleep: 7.1, steps: 7600 }),
      e("2026-05-21", { sleep: 6.9, steps: 7000 }),
      e("2026-05-22", { sleep: 6.7, steps: 6900, lateSnack: true }),
      e("2026-05-23", { sleep: 7.2, steps: 8100, workout: true }),
      e("2026-05-24", { sleep: 7.6, steps: 9800, workout: true }),
    ];
    const r = computeDailyReadiness(entries, "2026-05-25");
    expect(r.trend7d).not.toBeNull();
    expect(r.yesterdayScore).not.toBeNull();
    expect(r.score).toBeGreaterThanOrEqual(55);
    expect(["green", "yellow"]).toContain(r.zone);
  });
});
