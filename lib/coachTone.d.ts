/**
 * Coach communication tone — templates when LLM is off. Factual lines stay in
 * `why` / `supportingEvidence`; we only restyle title/message (and insight action where noted).
 *
 * API + DynamoDB field: `tone` — friendly | clinical | tough-love | ayurvedic.
 */
import type { AiNudge } from "@/lib/aiNudges/types";
import type { Insight, InsightTone } from "@/lib/insights/types";
export type CoachTone = InsightTone;
export declare const COACH_TONE_OPTIONS: {
    value: CoachTone;
    label: string;
    hint: string;
}[];
export declare function normalizeCoachTone(value: string | undefined): CoachTone;
/** Map product / snake_case aliases to stored API values. */
export declare function parseCoachToneInput(raw: string | undefined): CoachTone | null;
export declare function applyCoachToneToAiNudge(nudge: AiNudge, tone: CoachTone): AiNudge;
export declare function applyCoachToneToAiNudges(nudges: AiNudge[], tone: CoachTone | undefined): AiNudge[];
export declare function applyCoachToneToInsight(ins: Insight, tone: CoachTone): Insight;
export declare function weeklyEnergyCoachLine(trend: "deficit" | "surplus" | "near_maintenance", avgNetKcal: number, tone: CoachTone): string;
