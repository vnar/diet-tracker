import type { FoodVisionEstimate } from "./contracts";
import { parseFoodVisionEstimate } from "./parseFoodVisionJson";

const VISION_MODEL =
  (typeof process !== "undefined" && process.env.ANTHROPIC_FOOD_VISION_MODEL?.trim()) ||
  "claude-sonnet-4-20250514";

const VISION_SYSTEM = `You estimate calories and protein from a meal photo for a diet-tracking app.
Return ONLY one JSON object (no markdown fences) with exactly these keys:
- mealLabel: short meal name (string)
- kcalLow, kcalMid, kcalHigh: integers for plausible calorie range (low ≤ mid ≤ high)
- proteinG: integer grams of protein
- confidence: number from 0 to 1 for how sure you are
If the image is not food, use mealLabel "Unrecognized" and wide ranges with confidence under 0.3.`;

export type FoodVisionMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

/** Calls Anthropic vision and parses JSON into a structured estimate (or null). */
export async function runFoodVisionModel(input: {
  apiKey: string;
  base64: string;
  mediaType: FoodVisionMediaType;
}): Promise<FoodVisionEstimate | null> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey: input.apiKey });
  const response = await client.messages.create({
    model: VISION_MODEL,
    max_tokens: 512,
    temperature: 0.2,
    system: VISION_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: input.mediaType,
              data: input.base64,
            },
          },
          {
            type: "text",
            text: "Analyze this meal photo and return the JSON object only.",
          },
        ],
      },
    ],
  });
  const text = response.content.find((p) => p.type === "text")?.text;
  if (!text) return null;
  return parseFoodVisionEstimate(text);
}
