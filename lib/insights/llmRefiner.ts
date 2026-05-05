import { isInsightsLlmRefineEnabled } from "@/lib/featureFlags";
import type { InsightCard } from "@/lib/insights/types";

export async function maybeRefineInsight(insight: InsightCard): Promise<InsightCard> {
  if (!isInsightsLlmRefineEnabled()) {
    return insight;
  }
  // v1 no-op: keep deterministic pure-rule copy in production.
  return insight;
}
