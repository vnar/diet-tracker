"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFoodVisionModel = runFoodVisionModel;
const parseFoodVisionJson_1 = require("./parseFoodVisionJson");
/** Default: same Haiku family as insights refine (proven on this stack). Override via ANTHROPIC_FOOD_VISION_MODEL. */
const VISION_MODEL = (typeof process !== "undefined" && process.env.ANTHROPIC_FOOD_VISION_MODEL?.trim()) ||
    "claude-haiku-4-5";
const VISION_SYSTEM = `You estimate calories and protein from a meal photo for a diet-tracking app.
Return ONLY one JSON object (no markdown fences) with these keys:
- mealLabel: short meal name (string)
- kcalLow, kcalMid, kcalHigh: integers for plausible calorie range (low ≤ mid ≤ high)
- proteinG: integer grams of protein
- confidence: number from 0 to 1 for how sure you are
- suggestedName: concise 2–5 words, Title Case, e.g. "Greek Salad with Chicken" (string)
- suggestedMealType: one of breakfast, lunch, dinner, snack, dessert — or null if unsure
- carbsGRange: { "low": number, "high": number } plausible total carbs in grams for the plate
- fatGRange: { "low": number, "high": number } plausible total fat in grams for the plate
If the image is not food, use mealLabel "Unrecognized" and wide ranges with confidence under 0.3; suggestedName may echo mealLabel; suggestedMealType may be null.`;
/** Calls Anthropic vision and parses JSON into a structured estimate (or null). */
async function runFoodVisionModel(input) {
    const Anthropic = (await Promise.resolve().then(() => require("@anthropic-ai/sdk"))).default;
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
    if (!text)
        return null;
    return (0, parseFoodVisionJson_1.parseFoodVisionEstimate)(text);
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlzaW9uTW9kZWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2aXNpb25Nb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQXVCQSxnREFtQ0M7QUF6REQsK0RBQWdFO0FBRWhFLHNIQUFzSDtBQUN0SCxNQUFNLFlBQVksR0FDaEIsQ0FBQyxPQUFPLE9BQU8sS0FBSyxXQUFXLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUNuRixrQkFBa0IsQ0FBQztBQUVyQixNQUFNLGFBQWEsR0FBRzs7Ozs7Ozs7OzttS0FVNkksQ0FBQztBQUlwSyxtRkFBbUY7QUFDNUUsS0FBSyxVQUFVLGtCQUFrQixDQUFDLEtBSXhDO0lBQ0MsTUFBTSxTQUFTLEdBQUcsQ0FBQywyQ0FBYSxtQkFBbUIsRUFBQyxDQUFDLENBQUMsT0FBTyxDQUFDO0lBQzlELE1BQU0sTUFBTSxHQUFHLElBQUksU0FBUyxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDO0lBQ3ZELE1BQU0sUUFBUSxHQUFHLE1BQU0sTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUM7UUFDNUMsS0FBSyxFQUFFLFlBQVk7UUFDbkIsVUFBVSxFQUFFLEdBQUc7UUFDZixXQUFXLEVBQUUsR0FBRztRQUNoQixNQUFNLEVBQUUsYUFBYTtRQUNyQixRQUFRLEVBQUU7WUFDUjtnQkFDRSxJQUFJLEVBQUUsTUFBTTtnQkFDWixPQUFPLEVBQUU7b0JBQ1A7d0JBQ0UsSUFBSSxFQUFFLE9BQU87d0JBQ2IsTUFBTSxFQUFFOzRCQUNOLElBQUksRUFBRSxRQUFROzRCQUNkLFVBQVUsRUFBRSxLQUFLLENBQUMsU0FBUzs0QkFDM0IsSUFBSSxFQUFFLEtBQUssQ0FBQyxNQUFNO3lCQUNuQjtxQkFDRjtvQkFDRDt3QkFDRSxJQUFJLEVBQUUsTUFBTTt3QkFDWixJQUFJLEVBQUUsMERBQTBEO3FCQUNqRTtpQkFDRjthQUNGO1NBQ0Y7S0FDRixDQUFDLENBQUM7SUFDSCxNQUFNLElBQUksR0FBRyxRQUFRLENBQUMsT0FBTyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsRUFBRSxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksS0FBSyxNQUFNLENBQUMsRUFBRSxJQUFJLENBQUM7SUFDbkUsSUFBSSxDQUFDLElBQUk7UUFBRSxPQUFPLElBQUksQ0FBQztJQUN2QixPQUFPLElBQUEsNkNBQXVCLEVBQUMsSUFBSSxDQUFDLENBQUM7QUFDdkMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB0eXBlIHsgRm9vZFZpc2lvbkVzdGltYXRlIH0gZnJvbSBcIi4vY29udHJhY3RzXCI7XG5pbXBvcnQgeyBwYXJzZUZvb2RWaXNpb25Fc3RpbWF0ZSB9IGZyb20gXCIuL3BhcnNlRm9vZFZpc2lvbkpzb25cIjtcblxuLyoqIERlZmF1bHQ6IHNhbWUgSGFpa3UgZmFtaWx5IGFzIGluc2lnaHRzIHJlZmluZSAocHJvdmVuIG9uIHRoaXMgc3RhY2spLiBPdmVycmlkZSB2aWEgQU5USFJPUElDX0ZPT0RfVklTSU9OX01PREVMLiAqL1xuY29uc3QgVklTSU9OX01PREVMID1cbiAgKHR5cGVvZiBwcm9jZXNzICE9PSBcInVuZGVmaW5lZFwiICYmIHByb2Nlc3MuZW52LkFOVEhST1BJQ19GT09EX1ZJU0lPTl9NT0RFTD8udHJpbSgpKSB8fFxuICBcImNsYXVkZS1oYWlrdS00LTVcIjtcblxuY29uc3QgVklTSU9OX1NZU1RFTSA9IGBZb3UgZXN0aW1hdGUgY2Fsb3JpZXMgYW5kIHByb3RlaW4gZnJvbSBhIG1lYWwgcGhvdG8gZm9yIGEgZGlldC10cmFja2luZyBhcHAuXG5SZXR1cm4gT05MWSBvbmUgSlNPTiBvYmplY3QgKG5vIG1hcmtkb3duIGZlbmNlcykgd2l0aCB0aGVzZSBrZXlzOlxuLSBtZWFsTGFiZWw6IHNob3J0IG1lYWwgbmFtZSAoc3RyaW5nKVxuLSBrY2FsTG93LCBrY2FsTWlkLCBrY2FsSGlnaDogaW50ZWdlcnMgZm9yIHBsYXVzaWJsZSBjYWxvcmllIHJhbmdlIChsb3cg4omkIG1pZCDiiaQgaGlnaClcbi0gcHJvdGVpbkc6IGludGVnZXIgZ3JhbXMgb2YgcHJvdGVpblxuLSBjb25maWRlbmNlOiBudW1iZXIgZnJvbSAwIHRvIDEgZm9yIGhvdyBzdXJlIHlvdSBhcmVcbi0gc3VnZ2VzdGVkTmFtZTogY29uY2lzZSAy4oCTNSB3b3JkcywgVGl0bGUgQ2FzZSwgZS5nLiBcIkdyZWVrIFNhbGFkIHdpdGggQ2hpY2tlblwiIChzdHJpbmcpXG4tIHN1Z2dlc3RlZE1lYWxUeXBlOiBvbmUgb2YgYnJlYWtmYXN0LCBsdW5jaCwgZGlubmVyLCBzbmFjaywgZGVzc2VydCDigJQgb3IgbnVsbCBpZiB1bnN1cmVcbi0gY2FyYnNHUmFuZ2U6IHsgXCJsb3dcIjogbnVtYmVyLCBcImhpZ2hcIjogbnVtYmVyIH0gcGxhdXNpYmxlIHRvdGFsIGNhcmJzIGluIGdyYW1zIGZvciB0aGUgcGxhdGVcbi0gZmF0R1JhbmdlOiB7IFwibG93XCI6IG51bWJlciwgXCJoaWdoXCI6IG51bWJlciB9IHBsYXVzaWJsZSB0b3RhbCBmYXQgaW4gZ3JhbXMgZm9yIHRoZSBwbGF0ZVxuSWYgdGhlIGltYWdlIGlzIG5vdCBmb29kLCB1c2UgbWVhbExhYmVsIFwiVW5yZWNvZ25pemVkXCIgYW5kIHdpZGUgcmFuZ2VzIHdpdGggY29uZmlkZW5jZSB1bmRlciAwLjM7IHN1Z2dlc3RlZE5hbWUgbWF5IGVjaG8gbWVhbExhYmVsOyBzdWdnZXN0ZWRNZWFsVHlwZSBtYXkgYmUgbnVsbC5gO1xuXG5leHBvcnQgdHlwZSBGb29kVmlzaW9uTWVkaWFUeXBlID0gXCJpbWFnZS9qcGVnXCIgfCBcImltYWdlL3BuZ1wiIHwgXCJpbWFnZS9naWZcIiB8IFwiaW1hZ2Uvd2VicFwiO1xuXG4vKiogQ2FsbHMgQW50aHJvcGljIHZpc2lvbiBhbmQgcGFyc2VzIEpTT04gaW50byBhIHN0cnVjdHVyZWQgZXN0aW1hdGUgKG9yIG51bGwpLiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1bkZvb2RWaXNpb25Nb2RlbChpbnB1dDoge1xuICBhcGlLZXk6IHN0cmluZztcbiAgYmFzZTY0OiBzdHJpbmc7XG4gIG1lZGlhVHlwZTogRm9vZFZpc2lvbk1lZGlhVHlwZTtcbn0pOiBQcm9taXNlPEZvb2RWaXNpb25Fc3RpbWF0ZSB8IG51bGw+IHtcbiAgY29uc3QgQW50aHJvcGljID0gKGF3YWl0IGltcG9ydChcIkBhbnRocm9waWMtYWkvc2RrXCIpKS5kZWZhdWx0O1xuICBjb25zdCBjbGllbnQgPSBuZXcgQW50aHJvcGljKHsgYXBpS2V5OiBpbnB1dC5hcGlLZXkgfSk7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2xpZW50Lm1lc3NhZ2VzLmNyZWF0ZSh7XG4gICAgbW9kZWw6IFZJU0lPTl9NT0RFTCxcbiAgICBtYXhfdG9rZW5zOiA1MTIsXG4gICAgdGVtcGVyYXR1cmU6IDAuMixcbiAgICBzeXN0ZW06IFZJU0lPTl9TWVNURU0sXG4gICAgbWVzc2FnZXM6IFtcbiAgICAgIHtcbiAgICAgICAgcm9sZTogXCJ1c2VyXCIsXG4gICAgICAgIGNvbnRlbnQ6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICB0eXBlOiBcImltYWdlXCIsXG4gICAgICAgICAgICBzb3VyY2U6IHtcbiAgICAgICAgICAgICAgdHlwZTogXCJiYXNlNjRcIixcbiAgICAgICAgICAgICAgbWVkaWFfdHlwZTogaW5wdXQubWVkaWFUeXBlLFxuICAgICAgICAgICAgICBkYXRhOiBpbnB1dC5iYXNlNjQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgdHlwZTogXCJ0ZXh0XCIsXG4gICAgICAgICAgICB0ZXh0OiBcIkFuYWx5emUgdGhpcyBtZWFsIHBob3RvIGFuZCByZXR1cm4gdGhlIEpTT04gb2JqZWN0IG9ubHkuXCIsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgXSxcbiAgfSk7XG4gIGNvbnN0IHRleHQgPSByZXNwb25zZS5jb250ZW50LmZpbmQoKHApID0+IHAudHlwZSA9PT0gXCJ0ZXh0XCIpPy50ZXh0O1xuICBpZiAoIXRleHQpIHJldHVybiBudWxsO1xuICByZXR1cm4gcGFyc2VGb29kVmlzaW9uRXN0aW1hdGUodGV4dCk7XG59XG4iXX0=