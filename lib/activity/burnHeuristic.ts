/**
 * Rule-based activity burn (MET × duration × weight) used when Anthropic
 * is unavailable and as the client-side preview before/without AI.
 */
export type ActivityBurnHeuristicFields = {
  activitySummary: string;
  minutes: number;
  met: number;
  kcalBurn: number;
  confidence: number;
};

function activityLabelFromText(lower: string): string {
  if (lower.includes("bike") || lower.includes("biking") || lower.includes("cycling")) return "Cycling";
  if (lower.includes("mow") || lower.includes("lawn")) return "Yard work";
  if (lower.includes("run") || lower.includes("jog")) return "Running";
  if (lower.includes("walk")) return "Walking";
  if (lower.includes("swim")) return "Swimming";
  return "Activity";
}

/**
 * Parses duration from free text; returns null when no explicit duration was found
 * (caller may apply a default duration).
 */
export function parseActivityDurationMinutes(text: string): number | null {
  const lower = text.toLowerCase().trim();
  if (!lower) return null;
  const minMatch = lower.match(/(\d+)\s*(min|mins|minute|minutes|hr|hrs|hour|hours)\b/);
  if (!minMatch) return null;
  const n = Number(minMatch[1]);
  const unit = minMatch[2] ?? "min";
  if (!Number.isFinite(n) || n <= 0) return null;
  return unit.startsWith("h") ? n * 60 : n;
}

export function inferActivityMetFromText(text: string): number {
  const lower = text.toLowerCase();
  if (lower.includes("bike") || lower.includes("biking") || lower.includes("cycling")) return 7;
  if (lower.includes("mow") || lower.includes("lawn")) return 5;
  if (lower.includes("run") || lower.includes("jog")) return 8;
  if (lower.includes("walk")) return 3.5;
  if (lower.includes("swim")) return 6;
  return 4;
}

export function estimateActivityBurnHeuristic(activityText: string, weightKg: number): ActivityBurnHeuristicFields {
  const t = activityText.trim();
  if (!t || !Number.isFinite(weightKg) || weightKg <= 0) {
    return { activitySummary: "", minutes: 0, met: 0, kcalBurn: 0, confidence: 0 };
  }
  const lower = t.toLowerCase();
  const parsedMins = parseActivityDurationMinutes(t);
  const hadExplicitDuration = parsedMins != null;
  let minutes = parsedMins ?? 30;
  minutes = Math.max(1, Math.round(minutes));
  const met = inferActivityMetFromText(t);
  const kcalBurn = Math.round((met * 3.5 * weightKg * minutes) / 200);
  const label = activityLabelFromText(lower);
  const activitySummary = `${label} · ~${minutes} min · built-in estimate (MET ${Math.round(met * 10) / 10})`;
  const confidence = hadExplicitDuration ? 60 : 45;
  return {
    activitySummary,
    minutes,
    met: Math.round(met * 10) / 10,
    kcalBurn: Math.max(0, kcalBurn),
    confidence,
  };
}
