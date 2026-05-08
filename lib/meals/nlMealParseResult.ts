import type { MealType } from "./mealTypes";
import { isMealType } from "./mealTypes";

export type NlMealParseItem = {
  name: string;
  quantity_description: string;
  quantity_grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  icon_hint: string;
  isInLibrary?: boolean;
  libraryId?: string | null;
};

export type NlMealParseResponse = {
  title: string;
  confidence: number;
  items: NlMealParseItem[];
  meal_type_guess: MealType;
  notes: string | null;
};

const ICONS = new Set([
  "soup",
  "bowl-rice",
  "bread",
  "plant",
  "grain",
  "drumstick",
  "cup",
  "egg",
  "fish",
  "salad",
  "meat",
  "apple",
  "lemon",
  "coffee",
]);

/** Pull first balanced \`{...}\` from model output. */
export function extractJsonObjectFromNlText(raw: string): string | null {
  let text = raw.trim();
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/i, "");
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i += 1) {
    const c = text[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\" && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (c === "{") depth += 1;
      else if (c === "}") {
        depth -= 1;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

function num1(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v * 10) / 10;
  const n = typeof v === "string" ? Number(v) : Number(v);
  if (typeof n === "number" && Number.isFinite(n)) return Math.round(n * 10) / 10;
  return null;
}

function intish(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function str(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

export function parseNlMealLlmJson(raw: string): { ok: true; data: NlMealParseResponse } | { ok: false; error: string } {
  const extracted = extractJsonObjectFromNlText(raw);
  if (!extracted) return { ok: false, error: "no_json_object" };
  const cleaned = extracted.replace(/,\s*([}\]])/g, "$1");
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return { ok: false, error: "json_parse" };
  }
  if (!parsed || typeof parsed !== "object") return { ok: false, error: "not_object" };
  const o = parsed as Record<string, unknown>;
  const title = str(o.title);
  const confRaw = typeof o.confidence === "number" ? o.confidence : Number(o.confidence);
  const confidence = Number.isFinite(confRaw) ? Math.max(0, Math.min(100, Math.round(confRaw))) : NaN;
  const mealGuess = str(o.meal_type_guess);
  const notesRaw = o.notes;
  const notes = notesRaw === null || notesRaw === undefined ? null : str(notesRaw);

  if (!title || !Number.isFinite(confidence) || !mealGuess || !isMealType(mealGuess)) {
    return { ok: false, error: "invalid_top_level" };
  }

  if (!Array.isArray(o.items) || o.items.length < 1) {
    return { ok: false, error: "items_required" };
  }

  const items: NlMealParseItem[] = [];
  for (const row of o.items) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const name = str(r.name);
    const qd = str(r.quantity_description);
    const qg = intish(r.quantity_grams);
    const kcal = intish(r.kcal);
    const pg = num1(r.protein_g);
    const cg = num1(r.carbs_g);
    const fg = num1(r.fat_g);
    const fib = num1(r.fiber_g);
    const hintRaw = str(r.icon_hint)?.toLowerCase() ?? "bowl-rice";
    const icon_hint = ICONS.has(hintRaw) ? hintRaw : "bowl-rice";
    if (!name || !qd || qg === null || kcal === null || pg === null || cg === null || fg === null || fib === null) {
      continue;
    }
    items.push({
      name,
      quantity_description: qd,
      quantity_grams: qg,
      kcal,
      protein_g: pg,
      carbs_g: cg,
      fat_g: fg,
      fiber_g: fib,
      icon_hint,
    });
  }

  if (items.length < 1) return { ok: false, error: "no_valid_items" };

  return {
    ok: true,
    data: {
      title,
      confidence,
      items,
      meal_type_guess: mealGuess,
      notes,
    },
  };
}
