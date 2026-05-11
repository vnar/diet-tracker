import type { AiNudge } from "@/lib/aiNudges/types";
export declare const GLOBAL_HEALTH_COACHING_DISCLAIMER = "This is wellness coaching based on your logs, not medical advice. It is not a diagnosis and does not replace a clinician.";
/**
 * Soft sanitizer for rule output — prefer catching issues in copy templates; this is a backstop.
 */
export declare function sanitizeHealthCoachingCopy(text: string): string;
export declare function applySafetyGuardrails(nudge: AiNudge): AiNudge;
