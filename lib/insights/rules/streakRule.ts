import { daysBetween, sortLogsAsc } from "@/lib/insights/helpers";
import type { InsightRule } from "@/lib/insights/types";

const MILESTONES = [100, 60, 30, 14, 7];

export const streakRule: InsightRule = (logs) => {
  const sorted = sortLogsAsc(logs);
  if (sorted.length === 0) return null;

  let streak = 1;
  for (let idx = sorted.length - 1; idx > 0; idx -= 1) {
    const prev = sorted[idx - 1];
    const curr = sorted[idx];
    if (daysBetween(prev.date, curr.date) === 1) {
      streak += 1;
    } else {
      break;
    }
  }

  const milestone = MILESTONES.find((value) => streak >= value);
  if (!milestone) return null;

  return {
    id: `streak-${milestone}-${sorted[sorted.length - 1]?.date ?? "unknown"}`,
    ruleId: "streak",
    priority: 80,
    headline: `${milestone}-day logging streak. Nice work.`,
    detail: "Consistency is one of your strongest predictors of progress. Keep the streak alive tomorrow.",
    why: [
      `Current consecutive-day logging streak: ${streak} days`,
      `Milestone reached: ${milestone} days`,
    ],
  };
};
