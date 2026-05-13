import { describe, expect, it } from "vitest";
import { buildCareShareSummaryText } from "@/lib/roadmap/buildCareShareSummary";
import type { DailyEntry } from "@/lib/types";

function row(date: string, w: number): DailyEntry {
  return {
    id: date,
    date,
    morningWeight: w,
    calories: 1800,
    protein: 80,
    sleep: 7,
    lateSnack: false,
    highSodium: false,
    workout: false,
    alcohol: false,
  };
}

describe("buildCareShareSummaryText", () => {
  it("includes logged days in the window", () => {
    const text = buildCareShareSummaryText({
      entries: [row("2026-05-10", 80), row("2026-05-09", 79.5)],
      asOfDate: "2026-05-10",
      unit: "kg",
      days: 3,
    });
    expect(text).toContain("2026-05-10");
    expect(text).toContain("morning 80.0 kg");
    expect(text).toContain("cal 1800");
  });

  it("notes empty window when no rows", () => {
    const text = buildCareShareSummaryText({
      entries: [],
      asOfDate: "2026-05-10",
      unit: "kg",
    });
    expect(text).toContain("No entries");
  });
});
