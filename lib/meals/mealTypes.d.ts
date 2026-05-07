export declare const MEAL_TYPES: readonly ["breakfast", "lunch", "dinner", "snack", "dessert"];
export type MealType = (typeof MEAL_TYPES)[number];
export declare function isMealType(v: string): v is MealType;
/** Local wall-clock time in `timeZone` (IANA) → meal type when model returns null. */
export declare function inferMealTypeFromLocalTime(now: Date, timeZone: string): MealType;
