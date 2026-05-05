import { roundTo, sortLogsAsc } from "@/lib/insights/helpers";
import type { InsightRule } from "@/lib/insights/types";

function rollingAverage(logs: Array<{ morningWeight: number }>, idx: number, windowSize: number): number {
  const start = Math.max(0, idx - windowSize + 1);
  const chunk = logs.slice(start, idx + 1);
  return chunk.reduce((acc, log) => acc + log.morningWeight, 0) / chunk.length;
}

export const plateauRule: InsightRule = (logs) => {
  const sorted = sortLogsAsc(logs);
  if (sorted.length < 14) return null;

  const latestIdx = sorted.length - 1;
  const currentAvg = rollingAverage(sorted, latestIdx, 7);
  const priorIdx = latestIdx - 13;
  if (priorIdx < 0) return null;
  const priorAvg = rollingAverage(sorted, priorIdx, 7);
  const movement = Math.abs(currentAvg - priorAvg);
  if (movement >= 0.2) return null;

  return {
    id: `plateau-${sorted[latestIdx]?.date ?? "unknown"}`,
    ruleId: "plateau",
    priority: 93,
    headline: "You may be in a weight plateau right now.",
    detail: "Your 7-day average has barely moved over the last two weeks. Try a tighter calorie target or add one extra walk/workout block this week.",
    why: [
      `Current 7-day average: ${roundTo(currentAvg, 2)} kg`,
      `7-day average from 14 days ago: ${roundTo(priorAvg, 2)} kg`,
      `Total movement over 14 days: ${roundTo(movement, 2)} kg (< 0.2 kg threshold)`,
    ],
    action: "Adjust one habit this week: calories or activity.",
    category: "plateau",
  };
};
