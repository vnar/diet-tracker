import type { VoiceDailyParsedFields } from "@/lib/voiceDailyLog/types";

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = typeof v === "string" ? Number.parseFloat(v.trim()) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function intish(v: unknown): number | null {
  const n = num(v);
  if (n === null) return null;
  return Math.round(n);
}

function bool(v: unknown): boolean | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["yes", "true", "y", "1"].includes(s)) return true;
    if (["no", "false", "n", "0"].includes(s)) return false;
  }
  return null;
}

function str(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length ? t : null;
  }
  return null;
}

/**
 * Normalize LLM JSON object into strict VoiceDailyParsedFields.
 * Accepts snake_case keys from the model contract.
 */
export function normalizeVoiceDailyParseRecord(raw: unknown): VoiceDailyParsedFields | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const unclear = o.unclear_parts ?? o.unclearParts;
  const unclearParts = Array.isArray(unclear)
    ? unclear.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
    : [];

  const c = num(o.confidence);
  const confidence = c != null ? Math.max(0, Math.min(1, c)) : 0.4;

  return {
    morningWeightKg: num(o.morning_weight_kg ?? o.morningWeightKg),
    nightWeightKg: num(o.night_weight_kg ?? o.nightWeightKg),
    calories: intish(o.calories),
    proteinG: intish(o.protein_g ?? o.proteinG),
    steps: intish(o.steps),
    sleepHours: num(o.sleep_hours ?? o.sleepHours),
    workout: bool(o.workout),
    alcohol: bool(o.alcohol),
    lateSnack: bool(o.late_snack ?? o.lateSnack),
    highSodium: bool(o.high_sodium ?? o.highSodium),
    mealsSummary: str(o.meals_summary ?? o.mealsSummary),
    confidence,
    unclearParts,
  };
}
