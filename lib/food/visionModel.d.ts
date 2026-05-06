import type { FoodVisionEstimate } from "./contracts";
export type FoodVisionMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";
/** Calls Anthropic vision and parses JSON into a structured estimate (or null). */
export declare function runFoodVisionModel(input: {
    apiKey: string;
    base64: string;
    mediaType: FoodVisionMediaType;
}): Promise<FoodVisionEstimate | null>;
