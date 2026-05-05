import { daysBetween, roundTo, sortLogsAsc } from "@/lib/insights/helpers";
import type { InsightRule } from "@/lib/insights/types";

export const trajectoryRule: InsightRule = (logs) => {
  const sorted = sortLogsAsc(logs);
  if (sorted.length < 2) return null;

  const latest = sorted[sorted.length - 1];
  if (
    typeof latest.goalWeight !== "number" ||
    typeof latest.startWeight !== "number" ||
    typeof latest.targetDate !== "string"
  ) {
    return null;
  }

  const totalDays = Math.max(1, daysBetween(sorted[0].date, latest.targetDate));
  const elapsedDays = Math.max(1, daysBetween(sorted[0].date, latest.date));
  const expectedByNow =
    latest.startWeight + ((latest.goalWeight - latest.startWeight) * elapsedDays) / totalDays;

  const drift = latest.morningWeight - expectedByNow;
  if (Math.abs(drift) < 0.4) return null;

  const remainingDays = Math.max(1, daysBetween(latest.date, latest.targetDate));
  const neededPerWeek = ((latest.goalWeight - latest.morningWeight) / remainingDays) * 7;
  const kcalPerDay = Math.round((neededPerWeek / 7) * 7700);

  return {
    id: `trajectory-${latest.date}`,
    ruleId: "trajectory",
    priority: 91,
    headline: "You are currently off-pace from your target trend.",
    detail: `To hit your goal, you need about ${roundTo(neededPerWeek, 2)} kg/week. Estimated daily calorie adjustment: ${kcalPerDay > 0 ? "+" : ""}${kcalPerDay} kcal/day.`,
    why: [
      `Current weight: ${roundTo(latest.morningWeight, 2)} kg`,
      `Expected weight by now: ${roundTo(expectedByNow, 2)} kg`,
      `Difference vs expected: ${roundTo(drift, 2)} kg`,
      `Days remaining to target: ${remainingDays}`,
    ],
    action: "Apply the calorie adjustment for 7 days, then reassess.",
    category: "trajectory",
  };
};
