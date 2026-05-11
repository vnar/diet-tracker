import type { AiNudge, NormalizedUserHealthSnapshot } from "@/lib/aiNudges/types";
/**
 * Deterministic nudges from normalized logs. Returns [] if there is not enough weight signal.
 */
export declare function generateRuleBasedNudges(snapshot: NormalizedUserHealthSnapshot, nowIso?: string): AiNudge[];
