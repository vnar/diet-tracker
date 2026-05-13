import type { MealType } from "./mealTypes";
import type { NlMealParseItem, NlMealParseResponse } from "./nlMealParseResult";

type FoodTemplate = {
  /** Substrings to match against normalized food phrase (longest wins). */
  keys: string[];
  /** Per logical “cup” (240 ml) for liquids, or per piece, etc. */
  quantity_description: string;
  quantity_grams: number;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  icon_hint: NlMealParseItem["icon_hint"];
};

const TEMPLATES: FoodTemplate[] = [
  {
    keys: ["espresso", "americano"],
    quantity_description: "1 shot · ~30 ml",
    quantity_grams: 30,
    kcal: 3,
    protein_g: 0.2,
    carbs_g: 0.5,
    fat_g: 0,
    fiber_g: 0,
    icon_hint: "coffee",
  },
  {
    keys: ["coffee", "black coffee"],
    quantity_description: "1 cup · ~240 ml",
    quantity_grams: 240,
    kcal: 5,
    protein_g: 0.3,
    carbs_g: 0.7,
    fat_g: 0,
    fiber_g: 0,
    icon_hint: "coffee",
  },
  {
    keys: ["latte", "cappuccino", "macchiato", "mocha", "flat white"],
    quantity_description: "1 cup · ~240 ml",
    quantity_grams: 240,
    kcal: 120,
    protein_g: 8,
    carbs_g: 12,
    fat_g: 4,
    fiber_g: 0,
    icon_hint: "coffee",
  },
  {
    keys: ["chai", "tea with milk", "masala chai"],
    quantity_description: "1 cup · ~240 ml",
    quantity_grams: 240,
    kcal: 90,
    protein_g: 3,
    carbs_g: 14,
    fat_g: 2.5,
    fiber_g: 0,
    icon_hint: "cup",
  },
  {
    keys: ["green tea", "black tea", "tea"],
    quantity_description: "1 cup · ~240 ml",
    quantity_grams: 240,
    kcal: 2,
    protein_g: 0,
    carbs_g: 0.5,
    fat_g: 0,
    fiber_g: 0,
    icon_hint: "cup",
  },
  {
    keys: ["roti", "chapati", "phulka"],
    quantity_description: "1 medium roti · ~60 g",
    quantity_grams: 60,
    kcal: 106,
    protein_g: 3.5,
    carbs_g: 18,
    fat_g: 3,
    fiber_g: 2.5,
    icon_hint: "bread",
  },
  {
    keys: ["rice", "steamed rice", "jeera rice"],
    quantity_description: "1 cup cooked · ~180 g",
    quantity_grams: 180,
    kcal: 206,
    protein_g: 4.3,
    carbs_g: 45,
    fat_g: 0.4,
    fiber_g: 0.6,
    icon_hint: "bowl-rice",
  },
  {
    keys: ["dal", "daal", "lentil", "sambar", "rasam"],
    quantity_description: "1 cup · ~240 g",
    quantity_grams: 240,
    kcal: 198,
    protein_g: 12,
    carbs_g: 30,
    fat_g: 6,
    fiber_g: 8,
    icon_hint: "soup",
  },
  {
    keys: ["curd rice", "yogurt rice"],
    quantity_description: "1 bowl · ~300 g",
    quantity_grams: 300,
    kcal: 320,
    protein_g: 10,
    carbs_g: 52,
    fat_g: 8,
    fiber_g: 1,
    icon_hint: "bowl-rice",
  },
  {
    keys: ["poha", "upma", "idli", "dosa"],
    quantity_description: "1 plate · ~250 g",
    quantity_grams: 250,
    kcal: 280,
    protein_g: 8,
    carbs_g: 45,
    fat_g: 8,
    fiber_g: 3,
    icon_hint: "bowl-rice",
  },
  {
    keys: ["oats", "oatmeal"],
    quantity_description: "1 bowl cooked · ~250 g",
    quantity_grams: 250,
    kcal: 220,
    protein_g: 9,
    carbs_g: 36,
    fat_g: 5,
    fiber_g: 5,
    icon_hint: "grain",
  },
  {
    keys: ["egg", "eggs", "omelette", "omelet", "scrambled egg"],
    quantity_description: "1 large egg · ~50 g",
    quantity_grams: 50,
    kcal: 72,
    protein_g: 6.3,
    carbs_g: 0.4,
    fat_g: 4.8,
    fiber_g: 0,
    icon_hint: "egg",
  },
  {
    keys: ["apple", "banana", "orange"],
    quantity_description: "1 medium fruit · ~150 g",
    quantity_grams: 150,
    kcal: 95,
    protein_g: 0.5,
    carbs_g: 25,
    fat_g: 0.3,
    fiber_g: 3,
    icon_hint: "apple",
  },
  {
    keys: ["salad"],
    quantity_description: "1 bowl · ~200 g",
    quantity_grams: 200,
    kcal: 80,
    protein_g: 3,
    carbs_g: 12,
    fat_g: 3,
    fiber_g: 4,
    icon_hint: "salad",
  },
  {
    keys: ["ice cream", "cake", "brownie", "dessert", "cookie", "cookies"],
    quantity_description: "1 serving · ~100 g",
    quantity_grams: 100,
    kcal: 250,
    protein_g: 4,
    carbs_g: 35,
    fat_g: 11,
    fiber_g: 1,
    icon_hint: "apple",
  },
];

function scaleTemplate(t: FoodTemplate, factor: number): Omit<NlMealParseItem, "name"> {
  const f = Math.max(0.25, Math.min(12, factor));
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    quantity_description: t.quantity_description,
    quantity_grams: Math.round(t.quantity_grams * f),
    kcal: Math.round(t.kcal * f),
    protein_g: round1(t.protein_g * f),
    carbs_g: round1(t.carbs_g * f),
    fat_g: round1(t.fat_g * f),
    fiber_g: round1(t.fiber_g * f),
    icon_hint: t.icon_hint,
  };
}

function matchTemplate(foodPhrase: string): FoodTemplate | null {
  const lower = foodPhrase.toLowerCase().trim();
  let best: { len: number; t: FoodTemplate } | null = null;
  for (const t of TEMPLATES) {
    for (const k of t.keys) {
      if (lower.includes(k) && (!best || k.length > best.len)) {
        best = { len: k.length, t };
      }
    }
  }
  return best?.t ?? null;
}

function titleCaseWords(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .map((w) => (w.length ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : ""))
    .join(" ");
}

/** Split user text into rough per-item lines (same spirit as LLM “dal and rice”). */
export function splitMealDescriptionSegments(text: string): string[] {
  const t = text.trim();
  if (!t) return [];
  const chunks: string[] = [];
  for (const part of t.split(/\s*;\s*|\n+/)) {
    for (const plus of part.split(/\s+\+\s+/)) {
      for (const andPart of plus.split(/\s+and\s+/i)) {
        for (const comma of andPart.split(/\s*,\s*/)) {
          const x = comma.trim();
          if (x) chunks.push(x);
        }
      }
    }
  }
  return chunks.length ? chunks : [t];
}

function inferMealTypeFromText(text: string, itemNames: string[]): MealType {
  const blob = `${text} ${itemNames.join(" ")}`.toLowerCase();
  if (/\b(breakfast|toast|cereal|oats|poha|idli|dosa|paratha)\b/.test(blob)) return "breakfast";
  if (/\b(lunch|biryani|thali)\b/.test(blob)) return "lunch";
  if (/\b(dinner|supper)\b/.test(blob)) return "dinner";
  if (/\b(dessert|ice cream|cake|cookie|brownie|sweet)\b/.test(blob)) return "dessert";
  if (/\b(snack|chai|coffee|tea|juice|smoothie|nuts)\b/.test(blob)) return "snack";
  return "lunch";
}

function parseRotiCount(segment: string): { count: number; rest: string } | null {
  const m = segment.trim().match(/^(\d+(?:\.\d+)?)\s*rotis?\b/i);
  if (!m) return null;
  const count = Number(m[1]);
  if (!Number.isFinite(count) || count <= 0) return null;
  const rest = segment.slice(m[0].length).replace(/^[,\s]+/, "").trim();
  return { count, rest };
}

/**
 * Parse leading quantity like "2 cups of", "a bowl of", "3 x".
 * Returns multiplier for template units and the remaining food phrase.
 */
export function parseLeadingQuantity(segment: string): { factor: number; foodPhrase: string } {
  const s = segment.trim();

  const mNum = s.match(
    /^(\d+(?:\.\d+)?)\s*(cups?|cup|bowls?|bowl|plates?|plate|glasses?|glass|slices?|pieces?|pcs?)?\s*(?:of\s+)?(.+)$/i,
  );
  if (mNum) {
    const n = Number(mNum[1]);
    const food = (mNum[3] ?? "").trim();
    if (Number.isFinite(n) && n > 0 && food) return { factor: n, foodPhrase: food };
  }

  const mOne = s.match(/^(a|an|one)\s+(cup|bowl|plate|glass)\s+of\s+(.+)$/i);
  if (mOne) {
    const food = (mOne[3] ?? "").trim();
    if (food) return { factor: 1, foodPhrase: food };
  }

  const mX = s.match(/^(\d+(?:\.\d+)?)\s*x\s+(.+)$/i);
  if (mX) {
    const n = Number(mX[1]);
    const food = (mX[2] ?? "").trim();
    if (Number.isFinite(n) && n > 0 && food) return { factor: n, foodPhrase: food };
  }

  return { factor: 1, foodPhrase: s };
}

function genericPortion(name: string): NlMealParseItem {
  const display = titleCaseWords(name) || "Meal";
  return {
    name: display,
    quantity_description: "1 portion (estimated) · ~250 g",
    quantity_grams: 250,
    kcal: 350,
    protein_g: 18,
    carbs_g: 40,
    fat_g: 14,
    fiber_g: 3,
    icon_hint: "bowl-rice",
  };
}

function parseOneSegment(segment: string): NlMealParseItem {
  const roti = parseRotiCount(segment.trim());
  if (roti) {
    const tmpl = matchTemplate("roti")!;
    const scaled = scaleTemplate(tmpl, roti.count);
    return {
      name: roti.count === 1 ? "Roti" : `${Math.round(roti.count)} rotis`,
      ...scaled,
    };
  }

  const { factor, foodPhrase } = parseLeadingQuantity(segment);
  const tmpl = matchTemplate(foodPhrase);
  if (tmpl) {
    const scaled = scaleTemplate(tmpl, factor);
    const baseName = titleCaseWords(foodPhrase.split(/\s+/).slice(0, 4).join(" "));
    return {
      name: factor !== 1 ? `${baseName} (×${factor})` : baseName,
      ...scaled,
    };
  }

  return genericPortion(foodPhrase);
}

/**
 * Rule-based meal parse when Anthropic is unavailable or fails.
 * Returns the same shape as POST /v2/meals/nl-parse (before library enrichment).
 */
export function heuristicNlMealParse(text: string): NlMealParseResponse {
  const segments = splitMealDescriptionSegments(text);
  const items = segments.map(parseOneSegment);
  const title =
    items.length === 1
      ? items[0]!.name.slice(0, 40)
      : items
          .map((i) => i.name)
          .join(" · ")
          .slice(0, 48);
  const meal_type_guess = inferMealTypeFromText(text, items.map((i) => i.name));
  return {
    title: title || "Meal",
    confidence: 62,
    items,
    meal_type_guess,
    notes: "Built-in parser — verify portions and macros before saving.",
  };
}
