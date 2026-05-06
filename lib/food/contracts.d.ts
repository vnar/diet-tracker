/** Shared API contract for POST /v2/food/estimate (AWS HTTP API + JWT). */
export type FoodVisionEstimate = {
    mealLabel: string;
    kcalLow: number;
    kcalMid: number;
    kcalHigh: number;
    proteinG: number;
    confidence: number;
};
export type FoodEstimateResponse = {
    estimate: FoodVisionEstimate;
    foodLogId: string;
};
export type FoodLogConfirmBody = {
    foodLogId: string;
    confirmedKcal: number;
    confirmedProtein: number;
};
