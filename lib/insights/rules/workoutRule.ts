import { average, roundTo, sortLogsAsc } from "@/lib/insights/helpers";
import type { InsightRule } from "@/lib/insights/types";

function weekKey(date: string): string {
  const dt = new Date(`${date}T12:00:00`);
  const day = dt.getUTCDay() || 7;
  dt.setUTCDate(dt.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(dt.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${dt.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

export const workoutRule: InsightRule = (logs) => {
  const sorted = sortLogsAsc(logs);
  if (sorted.length < 14) return null;

  const byWeek = new Map<string, { first: number; last: number; workouts: number }>();
  for (const log of sorted) {
    const key = weekKey(log.date);
    const existing = byWeek.get(key);
    if (!existing) {
      byWeek.set(key, { first: log.morningWeight, last: log.morningWeight, workouts: log.workout ? 1 : 0 });
    } else {
      existing.last = log.morningWeight;
      if (log.workout) existing.workouts += 1;
    }
  }

  const highWorkoutWeeks: number[] = [];
  const lowWorkoutWeeks: number[] = [];
  for (const week of byWeek.values()) {
    const weeklyDelta = week.last - week.first;
    if (week.workouts >= 3) highWorkoutWeeks.push(weeklyDelta);
    if (week.workouts < 3) lowWorkoutWeeks.push(weeklyDelta);
  }

  if (highWorkoutWeeks.length < 2 || lowWorkoutWeeks.length < 2) return null;
  const highAvg = average(highWorkoutWeeks);
  const lowAvg = average(lowWorkoutWeeks);
  if (highAvg === null || lowAvg === null) return null;

  const advantage = lowAvg - highAvg;
  if (advantage <= 0.2) return null;

  return {
    id: `workout-weeks-${sorted[sorted.length - 1]?.date ?? "unknown"}`,
    ruleId: "workout",
    priority: 84,
    headline: "Weeks with 3+ workouts trend better than lower-workout weeks.",
    detail: `Your weekly change is ${roundTo(advantage, 2)} kg better in high-workout weeks.`,
    why: [
      `${highWorkoutWeeks.length} weeks had 3+ workouts`,
      `${lowWorkoutWeeks.length} weeks had under 3 workouts`,
      `Average weekly change (3+ workouts): ${roundTo(highAvg, 2)} kg`,
      `Average weekly change (<3 workouts): ${roundTo(lowAvg, 2)} kg`,
    ],
  };
};
