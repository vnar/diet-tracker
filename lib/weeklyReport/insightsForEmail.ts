import type { Insight } from "@/lib/insights/types";
import type { WeeklyReportDocument, WeeklyReportEmailInsight } from "@/lib/weeklyReport/types";

const DEFAULT_MAX = 5;

export function insightsToEmailSnapshot(insights: Insight[], max = DEFAULT_MAX): WeeklyReportEmailInsight[] {
  const slice = insights.slice(0, Math.max(0, max));
  return slice.map((i) => ({
    headline: i.headline.trim(),
    detail: i.detail?.trim() || undefined,
    action: i.action.trim(),
    source: i.generationSource === "llm" ? ("llm" as const) : ("rules" as const),
  }));
}

export function attachInsightsForEmail(
  doc: WeeklyReportDocument,
  lines: WeeklyReportEmailInsight[] | undefined,
): WeeklyReportDocument {
  if (!lines?.length) return doc;
  return { ...doc, aiInsightsForEmail: lines };
}
