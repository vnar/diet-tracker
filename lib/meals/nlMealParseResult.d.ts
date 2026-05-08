import type { MealType } from "./mealTypes";
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
/** Pull first balanced \`{...}\` from model output. */
export declare function extractJsonObjectFromNlText(raw: string): string | null;
export declare function parseNlMealLlmJson(raw: string): {
    ok: true;
    data: NlMealParseResponse;
} | {
    ok: false;
    error: string;
};
