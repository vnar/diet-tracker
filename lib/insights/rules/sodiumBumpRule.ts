import { average, buildNextMorningDeltas, roundTo } from "@/lib/insights/helpers";
import type { InsightRule } from "@/lib/insights/types";

export const sodiumBumpRule: InsightRule = (logs) => {
  const { flagged, baseline } = buildNextMorningDeltas(logs, (log) => log.highSodium);
  if (flagged.length < 4 || baseline.length < 1) return null;
  const flaggedAvg = average(flagged);
  const baselineAvg = average(baseline);
  if (flaggedAvg === null || baselineAvg === null) return null;

  const excess = flaggedAvg - baselineAvg;
  if (excess <= 0.3) return null;

  return {
    id: `sodium-bump-${logs[logs.length - 1]?.date ?? "unknown"}`,
    ruleId: "sodiumBump",
    priority: 95,
    headline: "High-sodium days are linked to heavier next-morning weigh-ins.",
    detail: `You average +${roundTo(excess, 2)} kg vs your non-sodium baseline the next morning.`,
    why: [
      `${flagged.length} high-sodium days in the last 90 days`,
      `Average next-morning change on high-sodium days: +${roundTo(flaggedAvg, 2)} kg`,
      `Baseline next-morning change: +${roundTo(baselineAvg, 2)} kg`,
    ],
    action: "Try one lower-sodium dinner swap tonight.",
    category: "sodium",
  };
};
