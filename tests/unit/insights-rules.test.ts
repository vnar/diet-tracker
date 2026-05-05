import { describe, expect, it } from "vitest";
import { alcoholRule } from "@/lib/insights/rules/alcoholRule";
import { lateSnackRule } from "@/lib/insights/rules/lateSnackRule";
import { plateauRule } from "@/lib/insights/rules/plateauRule";
import { sodiumBumpRule } from "@/lib/insights/rules/sodiumBumpRule";
import { streakRule } from "@/lib/insights/rules/streakRule";
import { trajectoryRule } from "@/lib/insights/rules/trajectoryRule";
import { workoutRule } from "@/lib/insights/rules/workoutRule";
import type { InsightLog } from "@/lib/insights/types";

function mk(date: string, morningWeight: number, overrides?: Partial<InsightLog>): InsightLog {
  return {
    id: date,
    date,
    morningWeight,
    lateSnack: false,
    highSodium: false,
    workout: false,
    alcohol: false,
    ...overrides,
  };
}

describe("insight rules", () => {
  it("sodium bump rule triggers and skips below threshold", () => {
    const logs = [
      mk("2026-01-01", 80, { highSodium: true }), mk("2026-01-02", 80.6),
      mk("2026-01-03", 80, { highSodium: true }), mk("2026-01-04", 80.6),
      mk("2026-01-05", 80, { highSodium: true }), mk("2026-01-06", 80.6),
      mk("2026-01-07", 80, { highSodium: true }), mk("2026-01-08", 80.6),
      mk("2026-01-09", 80), mk("2026-01-10", 80.1),
    ];
    expect(sodiumBumpRule(logs, {})).not.toBeNull();
    expect(sodiumBumpRule(logs.slice(0, 7), {})).toBeNull();
  });

  it("alcohol rule triggers and handles small difference", () => {
    const logs = [
      mk("2026-02-01", 80, { alcohol: true }), mk("2026-02-02", 80.5),
      mk("2026-02-03", 80, { alcohol: true }), mk("2026-02-04", 80.5),
      mk("2026-02-05", 80, { alcohol: true }), mk("2026-02-06", 80.5),
      mk("2026-02-07", 80, { alcohol: true }), mk("2026-02-08", 80.5),
      mk("2026-02-09", 80), mk("2026-02-10", 80.1),
    ];
    expect(alcoholRule(logs, {})).not.toBeNull();
    expect(alcoholRule(logs.map((log) => ({ ...log, morningWeight: 80 })), {})).toBeNull();
  });

  it("late snack rule triggers and needs enough flagged samples", () => {
    const logs = [
      mk("2026-03-01", 80, { lateSnack: true }), mk("2026-03-02", 80.5),
      mk("2026-03-03", 80, { lateSnack: true }), mk("2026-03-04", 80.5),
      mk("2026-03-05", 80, { lateSnack: true }), mk("2026-03-06", 80.5),
      mk("2026-03-07", 80, { lateSnack: true }), mk("2026-03-08", 80.5),
      mk("2026-03-09", 80), mk("2026-03-10", 80.1),
    ];
    expect(lateSnackRule(logs, {})).not.toBeNull();
    expect(lateSnackRule(logs.slice(0, 7), {})).toBeNull();
  });

  it("workout rule compares high and low workout weeks", () => {
    const logs: InsightLog[] = [];
    for (let day = 1; day <= 56; day += 1) {
      const month = day <= 30 ? "04" : "05";
      const dayInMonth = day <= 30 ? day : day - 30;
      const date = `2026-${month}-${String(dayInMonth).padStart(2, "0")}`;
      const workout = day <= 28 ? day % 2 === 0 : false;
      const weight = day <= 28 ? 86 - day * 0.15 : 81 + (day - 28) * 0.11;
      logs.push(mk(date, weight, { workout }));
    }
    expect(workoutRule(logs, {})).not.toBeNull();
    expect(workoutRule(logs.slice(0, 10), {})).toBeNull();
  });

  it("plateau rule triggers with small movement and ignores active trend", () => {
    const plateau = Array.from({ length: 20 }).map((_, idx) =>
      mk(`2026-05-${String(idx + 1).padStart(2, "0")}`, 80 + (idx % 2) * 0.02),
    );
    const trend = Array.from({ length: 20 }).map((_, idx) =>
      mk(`2026-06-${String(idx + 1).padStart(2, "0")}`, 85 - idx * 0.2),
    );
    expect(plateauRule(plateau, {})).not.toBeNull();
    expect(plateauRule(trend, {})).toBeNull();
  });

  it("streak rule celebrates milestones and ignores short streaks", () => {
    const streak14 = Array.from({ length: 14 }).map((_, idx) =>
      mk(`2026-07-${String(idx + 1).padStart(2, "0")}`, 80 - idx * 0.01),
    );
    const streak3 = [
      mk("2026-07-01", 80),
      mk("2026-07-02", 79.9),
      mk("2026-07-03", 79.8),
    ];
    expect(streakRule(streak14, {})?.headline).toContain("14-day");
    expect(streakRule(streak3, {})).toBeNull();
  });

  it("trajectory rule triggers when off pace and skips when near pace", () => {
    const logs = [
      mk("2026-01-01", 90, { startWeight: 90, goalWeight: 80, targetDate: "2026-03-01" }),
      mk("2026-02-01", 89, { startWeight: 90, goalWeight: 80, targetDate: "2026-03-01" }),
    ];
    const nearPace = [
      mk("2026-01-01", 90, { startWeight: 90, goalWeight: 80, targetDate: "2026-03-01" }),
      mk("2026-02-01", 84.9, { startWeight: 90, goalWeight: 80, targetDate: "2026-03-01" }),
    ];
    expect(trajectoryRule(logs, {})).not.toBeNull();
    expect(trajectoryRule(nearPace, {})).toBeNull();
  });
});
