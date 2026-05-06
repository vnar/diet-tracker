import { limitToLast90Days, sortLogsAsc } from "@/lib/insights/helpers";
import { maybeRefineInsight } from "@/lib/insights/llmRefiner";
import { alcoholRule } from "@/lib/insights/rules/alcoholRule";
import { lateSnackRule } from "@/lib/insights/rules/lateSnackRule";
import { plateauRule } from "@/lib/insights/rules/plateauRule";
import { sodiumBumpRule } from "@/lib/insights/rules/sodiumBumpRule";
import { streakRule } from "@/lib/insights/rules/streakRule";
import { trajectoryRule } from "@/lib/insights/rules/trajectoryRule";
import { workoutRule } from "@/lib/insights/rules/workoutRule";
import type { Insight, InsightLog, InsightRule, UserPrefs } from "@/lib/insights/types";

const ALL_RULES: InsightRule[] = [
  sodiumBumpRule,
  alcoholRule,
  lateSnackRule,
  workoutRule,
  plateauRule,
  streakRule,
  trajectoryRule,
];

export async function generateInsights(
  logs: InsightLog[],
  userPrefs: UserPrefs = {},
): Promise<Insight[]> {
  const scoped = limitToLast90Days(sortLogsAsc(logs));
  if (scoped.length === 0) return [];

  const candidates = ALL_RULES.map((rule) => rule(scoped, userPrefs)).filter(
    (insight): insight is Insight => insight !== null,
  );

  const dedupedByCategory = new Map<string, Insight>();
  for (const insight of candidates) {
    const current = dedupedByCategory.get(insight.category);
    if (!current || insight.priority > current.priority) {
      dedupedByCategory.set(insight.category, insight);
    }
  }

  const ranked = [...dedupedByCategory.values()]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);

  const refined: Insight[] = [];
  for (const insight of ranked) {
    refined.push(await maybeRefineInsight(insight, userPrefs));
  }
  if (refined.length > 0) return refined;
  const latestDate = scoped[scoped.length - 1]?.date ?? new Date().toISOString().slice(0, 10);
  return [
    {
      id: `baseline-insight-${latestDate}`,
      ruleId: "baseline",
      priority: 10,
      headline: "Great consistency so far - keep logging daily for sharper insights.",
      detail: "We need a bit more signal to detect strong personal patterns, but your data flow is active.",
      why: [
        `${scoped.length} logs analyzed from the last 90 days`,
        "No rule crossed confidence thresholds yet",
      ],
      action: "Keep tracking daily habits and weight to unlock stronger personalized insights.",
      category: "streak",
      generationSource: "rules",
    },
  ];
}

export type { Insight, InsightLog, UserPrefs } from "@/lib/insights/types";
