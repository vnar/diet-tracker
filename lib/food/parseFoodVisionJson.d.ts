import type { FoodVisionEstimate } from "./contracts";
/** Parse Claude vision JSON: meal name, kcal range, protein, confidence 0–1 */
export declare function parseFoodVisionEstimate(raw: string): FoodVisionEstimate | null;
