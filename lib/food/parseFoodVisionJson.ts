import type { FoodVisionEstimate, MacroRangeEstimate } from "./contracts";
import { isMealType } from "../meals/mealTypes";

function trimFence(raw: string): string {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```/im.exec(s);
  if (fence?.[1]) s = fence[1].trim();
  return s;
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function parseBalancedJsonObject(s: string): Record<string, unknown> | null {
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(s.slice(start, i + 1)) as Record<string, unknown>;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Parse Claude vision JSON: meal name, kcal range, protein, confidence 0–1 */
export function parseFoodVisionEstimate(raw: string): FoodVisionEstimate | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = trimFence(raw).trim();
  try {
    let o: Record<string, unknown> | null = null;
    try {
      o = JSON.parse(s) as Record<string, unknown>;
    } catch {
      o = parseBalancedJsonObject(s);
    }
    if (!o) return null;
    const doc = o;
    const mealLabel = typeof doc.mealLabel === "string" ? doc.mealLabel.trim() : "";
    let kcalLow = num(doc.kcalLow);
    const kcalMid = num(doc.kcalMid ?? doc.kcal_mid);
    let kcalHigh = num(doc.kcalHigh);
    const proteinG = num(doc.proteinG ?? doc.protein_g);
    let confidence = num(doc.confidence);
    if (confidence !== null && confidence > 1 && confidence <= 100) {
      confidence = confidence / 100;
    }
    if (!mealLabel || kcalLow === null || kcalMid === null || kcalHigh === null || proteinG === null) {
      return null;
    }
    if (confidence === null || confidence < 0 || confidence > 1) {
      confidence = 0.5;
    }
    if (kcalLow > kcalHigh) {
      const t = kcalLow;
      kcalLow = kcalHigh;
      kcalHigh = t;
    }
    const mid = Math.round(kcalMid);
    const lo = Math.round(Math.min(kcalLow, mid));
    const hi = Math.round(Math.max(kcalHigh, mid));
    const out: FoodVisionEstimate = {
      mealLabel,
      kcalLow: lo,
      kcalMid: mid,
      kcalHigh: hi,
      proteinG: Math.round(proteinG),
      confidence,
    };

    const suggestedNameRaw =
      typeof doc.suggestedName === "string" ? doc.suggestedName.trim() : "";
    if (suggestedNameRaw) out.suggestedName = suggestedNameRaw;

    const smt = doc.suggestedMealType;
    if (smt === null) out.suggestedMealType = null;
    else if (typeof smt === "string" && isMealType(smt.trim())) {
      out.suggestedMealType = smt.trim() as FoodVisionEstimate["suggestedMealType"];
    }

    function parseRange(key: string): MacroRangeEstimate | undefined {
      const r = doc[key];
      if (!r || typeof r !== "object") return undefined;
      const rec = r as Record<string, unknown>;
      const low = num(rec.low);
      const high = num(rec.high);
      if (low === null || high === null) return undefined;
      const a = Math.min(low, high);
      const b = Math.max(low, high);
      return { low: Math.round(a), high: Math.round(b) };
    }
    const carbs = parseRange("carbsGRange");
    if (carbs) out.carbsGRange = carbs;
    const fat = parseRange("fatGRange");
    if (fat) out.fatGRange = fat;

    return out;
  } catch {
    return null;
  }
}
