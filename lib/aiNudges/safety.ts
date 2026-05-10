import type { AiNudge } from "@/lib/aiNudges/types";

export const GLOBAL_HEALTH_COACHING_DISCLAIMER =
  "This is wellness coaching based on your logs, not medical advice. It is not a diagnosis and does not replace a clinician.";

const UNSAFE_PATTERNS: Array<{ re: RegExp; replacement: string }> = [
  { re: /\bdiagnos(e|is|ed|ing)\b/gi, replacement: "assess clinically (not something we do here)" },
  { re: /\bprescrib(e|ing|ed)\b/gi, replacement: "discuss with a licensed prescriber" },
  { re: /\bmedication(s)?\b/gi, replacement: "any medications you take" },
  { re: /\b(start|stop|increase|decrease|taper)\s+(your\s+)?(meds|medications?|pills?)\b/gi, replacement: "talk to your clinician about medication changes" },
  { re: /\bSSRIs?\b/gi, replacement: "prescription treatments" },
  { re: /\b(cure|treats?|heals?)\s+(your\s+)?(diabetes|disease|cancer)\b/gi, replacement: "support goals you set with your care team" },
];

/**
 * Soft sanitizer for rule output — prefer catching issues in copy templates; this is a backstop.
 */
export function sanitizeHealthCoachingCopy(text: string): string {
  let out = text;
  for (const { re, replacement } of UNSAFE_PATTERNS) {
    out = out.replace(re, replacement);
  }
  return out;
}

export function applySafetyGuardrails(nudge: AiNudge): AiNudge {
  return {
    ...nudge,
    title: sanitizeHealthCoachingCopy(nudge.title),
    message: sanitizeHealthCoachingCopy(nudge.message),
    supportingEvidence: nudge.supportingEvidence.map(sanitizeHealthCoachingCopy),
    safetyNotice: nudge.safetyNotice ?? GLOBAL_HEALTH_COACHING_DISCLAIMER,
  };
}
