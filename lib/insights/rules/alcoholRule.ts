import { average, buildNextMorningDeltas, roundTo } from "@/lib/insights/helpers";
import type { InsightRule } from "@/lib/insights/types";

export const alcoholRule: InsightRule = (logs) => {
  const { flagged, baseline } = buildNextMorningDeltas(logs, (log) => log.alcohol);
  if (flagged.length < 4 || baseline.length < 1) return null;
  const flaggedAvg = average(flagged);
  const baselineAvg = average(baseline);
  if (flaggedAvg === null || baselineAvg === null) return null;

  const excess = flaggedAvg - baselineAvg;
  if (excess <= 0.3) return null;

  return {
    id: `alcohol-bump-${logs[logs.length - 1]?.date ?? "unknown"}`,
    ruleId: "alcohol",
    priority: 90,
    headline: "Alcohol days tend to show a next-day weight bump.",
    detail: `You average +${roundTo(excess, 2)} kg versus non-alcohol days the next morning.`,
    why: [
      `${flagged.length} alcohol-logged days in the last 90 days`,
      `Average next-morning change after alcohol: +${roundTo(flaggedAvg, 2)} kg`,
      `Baseline next-morning change: +${roundTo(baselineAvg, 2)} kg`,
    ],
  };
};
