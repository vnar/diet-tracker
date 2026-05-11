import type { SubscriptionSnapshot } from "@/lib/billing/types";
import { isPaidPlanActive } from "@/lib/billing/access";

export type ProFeatureKey =
  | "personalized_coaching"
  | "voice_daily_parse"
  | "photo_food_estimate"
  | "nl_meal_parse"
  | "body_compare_ai"
  | "trajectory_forecast"
  | "weekly_ai_report"
  | "doctor_pdf_export"
  | "integrations_hub";

const COPY: Record<
  ProFeatureKey,
  { title: string; body: string }
> = {
  personalized_coaching: {
    title: "Personalized coaching nudges",
    body: "Deeper, log-aware nudges tuned to your goals — part of Pro.",
  },
  voice_daily_parse: {
    title: "Voice check-in (unlimited)",
    body: "You’ve reached the free limit for this month. Pro keeps voice parsing generous so logging stays effortless.",
  },
  photo_food_estimate: {
    title: "Photo meal estimates",
    body: "Snap-to-estimate for meals is a Pro convenience. Your saved days and weights are always yours.",
  },
  nl_meal_parse: {
    title: "Natural-language meal logging",
    body: "Describe meals in plain language and confirm — Pro unlocks this flow.",
  },
  body_compare_ai: {
    title: "AI photo compare",
    body: "Side-by-side visual comparisons use more model time — included with Pro.",
  },
  trajectory_forecast: {
    title: "Predictive trajectory & forecast",
    body: "Forward-looking charts and pace checks are Pro intelligence features.",
  },
  weekly_ai_report: {
    title: "Weekly AI report",
    body: "Summaries across your week ship with Pro (rolling out).",
  },
  doctor_pdf_export: {
    title: "Doctor-ready PDF export",
    body: "Pack your progress for a visit — Pro (rolling out).",
  },
  integrations_hub: {
    title: "Health integrations",
    body: "Apple Health, wearables, and more sync paths are Pro-scale (rolling out).",
  },
};

export function proFeatureCopy(key: ProFeatureKey) {
  return COPY[key];
}

export function isProUnlocked(sub: SubscriptionSnapshot | null | undefined): boolean {
  if (!sub) return false;
  return isPaidPlanActive(sub.plan, sub.status);
}

/** When monetization is on and user is not Pro, this feature should show upgrade path (not delete data). */
export function shouldGateProFeature(
  monetizationEnabled: boolean,
  sub: SubscriptionSnapshot | null | undefined,
): boolean {
  return monetizationEnabled && !isProUnlocked(sub);
}
