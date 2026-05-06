import type { FoodVisionEstimate } from "./contracts";

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

/** Parse Claude vision JSON: meal name, kcal range, protein, confidence 0–1 */
export function parseFoodVisionEstimate(raw: string): FoodVisionEstimate | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const s = trimFence(raw);
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const o = JSON.parse(s.slice(start, end + 1)) as Record<string, unknown>;
    const mealLabel = typeof o.mealLabel === "string" ? o.mealLabel.trim() : "";
    let kcalLow = num(o.kcalLow);
    const kcalMid = num(o.kcalMid ?? o.kcal_mid);
    let kcalHigh = num(o.kcalHigh);
    const proteinG = num(o.proteinG ?? o.protein_g);
    let confidence = num(o.confidence);
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
    return {
      mealLabel,
      kcalLow: lo,
      kcalMid: mid,
      kcalHigh: hi,
      proteinG: Math.round(proteinG),
      confidence,
    };
  } catch {
    return null;
  }
}
