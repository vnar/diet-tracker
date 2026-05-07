import { describe, expect, it } from "vitest";

import {
  addDaysIso,
  avgDeltaMorningAfterWorkout,
  avgMorningAfterLateSnack,
  buildAiInsightFingerprint,
  countLateSnackInWindow,
  currentSevenDayLossRateKgPerWeek,
  entryByDateMap,
  lastNDates,
  loggingStreaks,
  requiredWeeklyLossRate,
  sortEntriesAsc,
  type InsightEntryRow,
} from "@/lib/insights/aiInsightData";

function e(p: Partial<InsightEntryRow> & Pick<InsightEntryRow, "date" | "morningWeight">): InsightEntryRow {
  return {
    lateSnack: false,
    highSodium: false,
    workout: false,
    alcohol: false,
    ...p,
  };
}

describe("aiInsightData", () => {
  it("sorts by date ascending", () => {
    const rows = sortEntriesAsc([
      e({ date: "2026-05-02", morningWeight: 80 }),
      e({ date: "2026-05-01", morningWeight: 81 }),
    ]);
    expect(rows.map((r) => r.date)).toEqual(["2026-05-01", "2026-05-02"]);
  });

  it("counts late snack days in window", () => {
    const map = entryByDateMap([
      e({ date: "2026-05-01", morningWeight: 80, lateSnack: true }),
      e({ date: "2026-05-02", morningWeight: 79, lateSnack: false }),
    ]);
    expect(countLateSnackInWindow(["2026-05-01", "2026-05-02"], map)).toBe(1);
  });

  it("avg morning after late snack uses next calendar day", () => {
    const rows = sortEntriesAsc([
      e({ date: "2026-05-01", morningWeight: 80, lateSnack: true }),
      e({ date: "2026-05-02", morningWeight: 81 }),
    ]);
    expect(avgMorningAfterLateSnack(rows)).toBe(81);
  });

  it("avg delta after workout uses next morning minus current", () => {
    const rows = sortEntriesAsc([
      e({ date: "2026-05-01", morningWeight: 80, workout: true }),
      e({ date: "2026-05-02", morningWeight: 79 }),
    ]);
    expect(avgDeltaMorningAfterWorkout(rows)).toBe(-1);
  });

  it("fingerprint is stable for same inputs", () => {
    const a = buildAiInsightFingerprint({
      userId: "u1",
      latestDate: "2026-05-07",
      latestMorning: 73.2,
      goalWeight: 71,
      targetDate: "2026-07-07",
      mealDigest: "x",
      habitTail: "y",
    });
    const b = buildAiInsightFingerprint({
      userId: "u1",
      latestDate: "2026-05-07",
      latestMorning: 73.2,
      goalWeight: 71,
      targetDate: "2026-07-07",
      mealDigest: "x",
      habitTail: "y",
    });
    expect(a).toBe(b);
  });

  it("required weekly rate divides by weeks to goal", () => {
    const r = requiredWeeklyLossRate(80, 72, "2026-05-01", "2026-05-29");
    expect(r).not.toBeNull();
    expect(r!).toBeGreaterThan(0);
  });

  it("logging streaks count consecutive days from today", () => {
    const rows = sortEntriesAsc([
      e({ date: addDaysIso("2026-05-07", -2), morningWeight: 80 }),
      e({ date: addDaysIso("2026-05-07", -1), morningWeight: 79 }),
      e({ date: "2026-05-07", morningWeight: 78 }),
    ]);
    const s = loggingStreaks(rows, "2026-05-07");
    expect(s.current).toBe(3);
  });

  it("7-day loss rate is null with one point", () => {
    expect(currentSevenDayLossRateKgPerWeek([e({ date: "2026-05-07", morningWeight: 75 })])).toBeNull();
  });

  it("lastNDates returns ascending span ending at endDate", () => {
    expect(lastNDates("2026-05-03", 3)).toEqual(["2026-05-01", "2026-05-02", "2026-05-03"]);
  });
});
