import { describe, expect, it } from "vitest";
import { buildWeeklyAggregate } from "@/lib/weeklyReport/aggregate";
import type { DailyEntry } from "@/lib/types";

function entry(p: Partial<DailyEntry> & Pick<DailyEntry, "date" | "morningWeight">): DailyEntry {
  return {
    id: p.id ?? `id-${p.date}`,
    lateSnack: p.lateSnack ?? false,
    highSodium: p.highSodium ?? false,
    workout: p.workout ?? false,
    alcohol: p.alcohol ?? false,
    ...p,
  };
}

describe("buildWeeklyAggregate", () => {
  it("counts seven days and weight delta from morning weights", () => {
    const weekEnd = "2026-05-10";
    const agg = buildWeeklyAggregate({
      weekEnd,
      entries: [
        entry({ date: "2026-05-04", morningWeight: 80 }),
        entry({ date: "2026-05-10", morningWeight: 79 }),
      ],
      settings: { unit: "kg", tone: "friendly" },
    });
    expect(agg.weekStart).toBe("2026-05-04");
    expect(agg.weekEnd).toBe("2026-05-10");
    expect(agg.days).toHaveLength(7);
    expect(agg.weighInDays).toBe(2);
    expect(agg.weightDelta).toBe(-1);
    expect(agg.checkInDays).toBeGreaterThanOrEqual(2);
  });

  it("sums meal kcal and protein when mealsByDay provided", () => {
    const agg = buildWeeklyAggregate({
      weekEnd: "2026-05-10",
      entries: [entry({ date: "2026-05-05", morningWeight: 70, calories: 400, protein: 20 })],
      mealsByDay: {
        "2026-05-05": [
          { kcal: 300, proteinG: 15 },
          { kcal: 100, proteinG: 5 },
        ],
      },
      settings: { unit: "kg", tone: "clinical" },
    });
    expect(agg.mealEntriesTotal).toBe(2);
    expect(agg.sumMealKcal).toBe(400);
    expect(agg.sumMealProteinG).toBe(20);
  });

  it("flags medication-keyword notes without counting as clinical data", () => {
    const agg = buildWeeklyAggregate({
      weekEnd: "2026-05-10",
      entries: [
        entry({
          date: "2026-05-06",
          morningWeight: 72,
          notes: "Felt off after changing dose of prescription med — will ask doctor.",
        }),
      ],
      settings: { unit: "kg", tone: "friendly" },
    });
    expect(agg.notesMedicationKeywordHits).toBeGreaterThanOrEqual(1);
  });

  it("counts progress photos in window", () => {
    const agg = buildWeeklyAggregate({
      weekEnd: "2026-05-10",
      entries: [],
      photos: [
        { photoId: "1", userId: "u", date: "2026-05-05", createdAt: "x" },
        { photoId: "2", userId: "u", date: "2026-04-01", createdAt: "x" },
      ],
      settings: { unit: "kg", tone: "friendly" },
    });
    expect(agg.progressPhotosInWeek).toBe(1);
  });
});
