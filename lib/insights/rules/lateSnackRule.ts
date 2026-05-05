import { average, buildNextMorningDeltas, roundTo } from "@/lib/insights/helpers";
import type { InsightRule } from "@/lib/insights/types";

export const lateSnackRule: InsightRule = (logs) => {
  const { flagged, baseline } = buildNextMorningDeltas(logs, (log) => log.lateSnack);
  if (flagged.length < 4 || baseline.length < 1) return null;
  const flaggedAvg = average(flagged);
  const baselineAvg = average(baseline);
  if (flaggedAvg === null || baselineAvg === null) return null;

  const excess = flaggedAvg - baselineAvg;
  if (excess <= 0.3) return null;

  return {
    id: `late-snack-bump-${logs[logs.length - 1]?.date ?? "unknown"}`,
    ruleId: "lateSnack",
    priority: 88,
    headline: "Late snacks are correlated with heavier next-morning scale readings.",
    detail: `Your next-day change is +${roundTo(excess, 2)} kg higher than your non-late-snack baseline.`,
    why: [
      `${flagged.length} late-snack days in the last 90 days`,
      `Average next-morning change with late snack: +${roundTo(flaggedAvg, 2)} kg`,
      `Baseline next-morning change: +${roundTo(baselineAvg, 2)} kg`,
    ],
    action: "Set a 2-hour kitchen close time before bed.",
    category: "late_snack",
  };
};
