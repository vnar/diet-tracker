/**
 * Voice daily check-in: structured fields extracted from a transcript (never raw audio).
 * Weights are stored in kg in the parse contract; UI converts with user unit.
 */
import type { MealType } from "@/lib/meals/mealTypes";
export type VoiceSpokenFoodItem = {
    description: string;
    estKcal: number | null;
    estProteinG: number | null;
};
export type VoiceDailyParsedFields = {
    morningWeightKg: number | null;
    nightWeightKg: number | null;
    calories: number | null;
    proteinG: number | null;
    steps: number | null;
    sleepHours: number | null;
    workout: boolean | null;
    alcohol: boolean | null;
    lateSnack: boolean | null;
    highSodium: boolean | null;
    /** Free-text meals / food; optional notes — structured foods use `foodItems`. */
    mealsSummary: string | null;
    /** Colloquial eats ("two coffees", "burger") with rough kcal for manual calorie grid. */
    foodItems: VoiceSpokenFoodItem[];
    /** Short phrase for Energy balance activity line (e.g. "biked 40 minutes"). */
    activityBurnHint: string | null;
    confidence: number;
    unclearParts: string[];
};
export type VoiceDailyParseApiResponse = {
    ok: true;
    parsed: VoiceDailyParsedFields;
};
/** Final values after user review; applied to today’s form (still requires Save today). */
export type VoiceDailyFormApply = {
    morningWeightKg: number | null;
    nightWeightKg: number | null;
    calories: number | null;
    proteinG: number | null;
    steps: number | null;
    sleepHours: number | null;
    workout: boolean;
    alcohol: boolean;
    lateSnack: boolean;
    highSodium: boolean;
    mealsSummaryForNotes: string | null;
    transcript: string;
    appendTranscriptToNotes: boolean;
    appendMealsSummaryToNotes: boolean;
    /** Sum of selected spoken-food estimates added to Today’s calories (manual mode). */
    foodKcalDelta: number | null;
    foodProteinDeltaG: number | null;
    /** Prefill Energy balance “activity text” when user opts in. */
    activityBurnHint: string | null;
    syncActivityToEnergyCard: boolean;
    /**
     * When non-null, the client appends each row as a new day meal (and creates a library item),
     * additive to anything already logged today. When used, omit top-level calories/protein and
     * food deltas so totals are not double-counted.
     */
    spokenFoodMealsToLog: Array<{
        name: string;
        kcal: number;
        protein_g: number;
        meal_type: MealType;
        notes?: string;
    }> | null;
};
