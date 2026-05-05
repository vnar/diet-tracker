import { limitToLast90Days, sortLogsAsc } from "@/lib/insights/helpers";
import { maybeRefineInsight } from "@/lib/insights/llmRefiner";
import { alcoholRule } from "@/lib/insights/rules/alcoholRule";
import { lateSnackRule } from "@/lib/insights/rules/lateSnackRule";
import { plateauRule } from "@/lib/insights/rules/plateauRule";
import { sodiumBumpRule } from "@/lib/insights/rules/sodiumBumpRule";
import { streakRule } from "@/lib/insights/rules/streakRule";
import { trajectoryRule } from "@/lib/insights/rules/trajectoryRule";
import { workoutRule } from "@/lib/insights/rules/workoutRule";
import type { InsightCard, InsightLog, InsightRule } from "@/lib/insights/types";

const ALL_RULES: InsightRule[] = [
  sodiumBumpRule,
  alcoholRule,
  lateSnackRule,
  workoutRule,
  plateauRule,
  streakRule,
  trajectoryRule,
];

export async function generateInsights(logs: InsightLog[]): Promise<InsightCard[]> {
  const scoped = limitToLast90Days(sortLogsAsc(logs));
  if (scoped.length === 0) return [];

  const candidates = ALL_RULES.map((rule) => rule(scoped)).filter(
    (insight): insight is InsightCard => insight !== null,
  );

  const dedupedByRule = new Map<string, InsightCard>();
  for (const insight of candidates) {
    const current = dedupedByRule.get(insight.ruleId);
    if (!current || insight.priority > current.priority) {
      dedupedByRule.set(insight.ruleId, insight);
    }
  }

  const ranked = [...dedupedByRule.values()]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 3);

  const refined: InsightCard[] = [];
  for (const insight of ranked) {
    refined.push(await maybeRefineInsight(insight));
  }
  return refined;
}

export type { InsightCard, InsightLog } from "@/lib/insights/types";
