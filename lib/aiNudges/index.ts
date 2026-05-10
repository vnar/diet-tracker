import type { AiNudge, NormalizedUserHealthSnapshot, PersonalizedCoachingApiPayload } from "@/lib/aiNudges/types";
import { buildNormalizedHealthSnapshot, type RawEntryForNudges } from "@/lib/aiNudges/normalize";
import { GLOBAL_HEALTH_COACHING_DISCLAIMER, applySafetyGuardrails } from "@/lib/aiNudges/safety";
import {
  LlmNudgeProvider,
  RuleBasedNudgeProvider,
  generateFromProviders,
  type AiNudgeProvider,
  type NudgeGenerationContext,
} from "@/lib/aiNudges/providers";
import { generateRuleBasedNudges } from "@/lib/aiNudges/ruleEngine";
import { isPaidPlanActive } from "@/lib/billing/access";

export type {
  AiNudge,
  AiNudgeCategory,
  NormalizedUserHealthSnapshot,
  PersonalizedCoachingApiPayload,
} from "@/lib/aiNudges/types";
export { buildNormalizedHealthSnapshot } from "@/lib/aiNudges/normalize";
export { GLOBAL_HEALTH_COACHING_DISCLAIMER } from "@/lib/aiNudges/safety";
export { generateRuleBasedNudges } from "@/lib/aiNudges/ruleEngine";

export async function generatePersonalizedNudges(
  snapshot: NormalizedUserHealthSnapshot,
  opts?: { includeLlm?: boolean; nowIso?: string },
): Promise<AiNudge[]> {
  const providers: AiNudgeProvider[] = [new RuleBasedNudgeProvider()];
  if (opts?.includeLlm) providers.push(new LlmNudgeProvider());
  const ctx: NudgeGenerationContext = { snapshot, nowIso: opts?.nowIso };
  const raw = await generateFromProviders(providers, ctx);
  return raw.map(applySafetyGuardrails);
}

/** Same output as async path for HTTP handlers that must stay synchronous. */
export function generatePersonalizedNudgesSync(
  snapshot: NormalizedUserHealthSnapshot,
  nowIso: string = new Date().toISOString(),
): AiNudge[] {
  return generateRuleBasedNudges(snapshot, nowIso).map(applySafetyGuardrails);
}

/**
 * Full API payload for GET /v2/insights — no raw entries returned, only derived nudges.
 */
export function buildPersonalizedCoachingPayload(input: {
  entriesRaw: RawEntryForNudges[];
  goalWeight: number;
  startWeight: number;
  targetDate: string;
  asOfDate: string;
  plan: string | undefined;
  subscriptionStatus: string | undefined;
  recentAvgDailyCalories?: number | null;
  nowIso?: string;
}): PersonalizedCoachingApiPayload {
  const gated = !isPaidPlanActive(input.plan, input.subscriptionStatus);
  const snapshot = buildNormalizedHealthSnapshot({
    asOfDate: input.asOfDate,
    entriesRaw: input.entriesRaw,
    goalWeight: input.goalWeight,
    startWeight: input.startWeight,
    targetDate: input.targetDate,
    recentAvgDailyCalories: input.recentAvgDailyCalories,
  });
  const nowIso = input.nowIso ?? new Date().toISOString();
  if (gated) {
    return {
      enabled: true,
      gated: true,
      nudges: [],
      globalSafetyNotice: GLOBAL_HEALTH_COACHING_DISCLAIMER,
    };
  }
  return {
    enabled: true,
    gated: false,
    nudges: generatePersonalizedNudgesSync(snapshot, nowIso),
    globalSafetyNotice: GLOBAL_HEALTH_COACHING_DISCLAIMER,
  };
}
