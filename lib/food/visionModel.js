"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFoodVisionModel = runFoodVisionModel;
const parseFoodVisionJson_1 = require("./parseFoodVisionJson");
const VISION_MODEL = (typeof process !== "undefined" && process.env.ANTHROPIC_FOOD_VISION_MODEL?.trim()) ||
    "claude-sonnet-4-20250514";
const VISION_SYSTEM = `You estimate calories and protein from a meal photo for a diet-tracking app.
Return ONLY one JSON object (no markdown fences) with exactly these keys:
- mealLabel: short meal name (string)
- kcalLow, kcalMid, kcalHigh: integers for plausible calorie range (low ≤ mid ≤ high)
- proteinG: integer grams of protein
- confidence: number from 0 to 1 for how sure you are
If the image is not food, use mealLabel "Unrecognized" and wide ranges with confidence under 0.3.`;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlzaW9uTW9kZWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2aXNpb25Nb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQWtCQSxnREFtQ0M7QUFwREQsK0RBQWdFO0FBRWhFLE1BQU0sWUFBWSxHQUNoQixDQUFDLE9BQU8sT0FBTyxLQUFLLFdBQVcsSUFBSSxPQUFPLENBQUMsR0FBRyxDQUFDLDJCQUEyQixFQUFFLElBQUksRUFBRSxDQUFDO0lBQ25GLDBCQUEwQixDQUFDO0FBRTdCLE1BQU0sYUFBYSxHQUFHOzs7Ozs7a0dBTTRFLENBQUM7QUFJbkcsbUZBQW1GO0FBQzVFLEtBQUssVUFBVSxrQkFBa0IsQ0FBQyxLQUl4QztJQUNDLE1BQU0sU0FBUyxHQUFHLENBQUMsMkNBQWEsbUJBQW1CLEVBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztJQUM5RCxNQUFNLE1BQU0sR0FBRyxJQUFJLFNBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxLQUFLLENBQUMsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUN2RCxNQUFNLFFBQVEsR0FBRyxNQUFNLE1BQU0sQ0FBQyxRQUFRLENBQUMsTUFBTSxDQUFDO1FBQzVDLEtBQUssRUFBRSxZQUFZO1FBQ25CLFVBQVUsRUFBRSxHQUFHO1FBQ2YsV0FBVyxFQUFFLEdBQUc7UUFDaEIsTUFBTSxFQUFFLGFBQWE7UUFDckIsUUFBUSxFQUFFO1lBQ1I7Z0JBQ0UsSUFBSSxFQUFFLE1BQU07Z0JBQ1osT0FBTyxFQUFFO29CQUNQO3dCQUNFLElBQUksRUFBRSxPQUFPO3dCQUNiLE1BQU0sRUFBRTs0QkFDTixJQUFJLEVBQUUsUUFBUTs0QkFDZCxVQUFVLEVBQUUsS0FBSyxDQUFDLFNBQVM7NEJBQzNCLElBQUksRUFBRSxLQUFLLENBQUMsTUFBTTt5QkFDbkI7cUJBQ0Y7b0JBQ0Q7d0JBQ0UsSUFBSSxFQUFFLE1BQU07d0JBQ1osSUFBSSxFQUFFLDBEQUEwRDtxQkFDakU7aUJBQ0Y7YUFDRjtTQUNGO0tBQ0YsQ0FBQyxDQUFDO0lBQ0gsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUFDLEVBQUUsSUFBSSxDQUFDO0lBQ25FLElBQUksQ0FBQyxJQUFJO1FBQUUsT0FBTyxJQUFJLENBQUM7SUFDdkIsT0FBTyxJQUFBLDZDQUF1QixFQUFDLElBQUksQ0FBQyxDQUFDO0FBQ3ZDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgdHlwZSB7IEZvb2RWaXNpb25Fc3RpbWF0ZSB9IGZyb20gXCIuL2NvbnRyYWN0c1wiO1xuaW1wb3J0IHsgcGFyc2VGb29kVmlzaW9uRXN0aW1hdGUgfSBmcm9tIFwiLi9wYXJzZUZvb2RWaXNpb25Kc29uXCI7XG5cbmNvbnN0IFZJU0lPTl9NT0RFTCA9XG4gICh0eXBlb2YgcHJvY2VzcyAhPT0gXCJ1bmRlZmluZWRcIiAmJiBwcm9jZXNzLmVudi5BTlRIUk9QSUNfRk9PRF9WSVNJT05fTU9ERUw/LnRyaW0oKSkgfHxcbiAgXCJjbGF1ZGUtc29ubmV0LTQtMjAyNTA1MTRcIjtcblxuY29uc3QgVklTSU9OX1NZU1RFTSA9IGBZb3UgZXN0aW1hdGUgY2Fsb3JpZXMgYW5kIHByb3RlaW4gZnJvbSBhIG1lYWwgcGhvdG8gZm9yIGEgZGlldC10cmFja2luZyBhcHAuXG5SZXR1cm4gT05MWSBvbmUgSlNPTiBvYmplY3QgKG5vIG1hcmtkb3duIGZlbmNlcykgd2l0aCBleGFjdGx5IHRoZXNlIGtleXM6XG4tIG1lYWxMYWJlbDogc2hvcnQgbWVhbCBuYW1lIChzdHJpbmcpXG4tIGtjYWxMb3csIGtjYWxNaWQsIGtjYWxIaWdoOiBpbnRlZ2VycyBmb3IgcGxhdXNpYmxlIGNhbG9yaWUgcmFuZ2UgKGxvdyDiiaQgbWlkIOKJpCBoaWdoKVxuLSBwcm90ZWluRzogaW50ZWdlciBncmFtcyBvZiBwcm90ZWluXG4tIGNvbmZpZGVuY2U6IG51bWJlciBmcm9tIDAgdG8gMSBmb3IgaG93IHN1cmUgeW91IGFyZVxuSWYgdGhlIGltYWdlIGlzIG5vdCBmb29kLCB1c2UgbWVhbExhYmVsIFwiVW5yZWNvZ25pemVkXCIgYW5kIHdpZGUgcmFuZ2VzIHdpdGggY29uZmlkZW5jZSB1bmRlciAwLjMuYDtcblxuZXhwb3J0IHR5cGUgRm9vZFZpc2lvbk1lZGlhVHlwZSA9IFwiaW1hZ2UvanBlZ1wiIHwgXCJpbWFnZS9wbmdcIiB8IFwiaW1hZ2UvZ2lmXCIgfCBcImltYWdlL3dlYnBcIjtcblxuLyoqIENhbGxzIEFudGhyb3BpYyB2aXNpb24gYW5kIHBhcnNlcyBKU09OIGludG8gYSBzdHJ1Y3R1cmVkIGVzdGltYXRlIChvciBudWxsKS4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBydW5Gb29kVmlzaW9uTW9kZWwoaW5wdXQ6IHtcbiAgYXBpS2V5OiBzdHJpbmc7XG4gIGJhc2U2NDogc3RyaW5nO1xuICBtZWRpYVR5cGU6IEZvb2RWaXNpb25NZWRpYVR5cGU7XG59KTogUHJvbWlzZTxGb29kVmlzaW9uRXN0aW1hdGUgfCBudWxsPiB7XG4gIGNvbnN0IEFudGhyb3BpYyA9IChhd2FpdCBpbXBvcnQoXCJAYW50aHJvcGljLWFpL3Nka1wiKSkuZGVmYXVsdDtcbiAgY29uc3QgY2xpZW50ID0gbmV3IEFudGhyb3BpYyh7IGFwaUtleTogaW5wdXQuYXBpS2V5IH0pO1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNsaWVudC5tZXNzYWdlcy5jcmVhdGUoe1xuICAgIG1vZGVsOiBWSVNJT05fTU9ERUwsXG4gICAgbWF4X3Rva2VuczogNTEyLFxuICAgIHRlbXBlcmF0dXJlOiAwLjIsXG4gICAgc3lzdGVtOiBWSVNJT05fU1lTVEVNLFxuICAgIG1lc3NhZ2VzOiBbXG4gICAgICB7XG4gICAgICAgIHJvbGU6IFwidXNlclwiLFxuICAgICAgICBjb250ZW50OiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgdHlwZTogXCJpbWFnZVwiLFxuICAgICAgICAgICAgc291cmNlOiB7XG4gICAgICAgICAgICAgIHR5cGU6IFwiYmFzZTY0XCIsXG4gICAgICAgICAgICAgIG1lZGlhX3R5cGU6IGlucHV0Lm1lZGlhVHlwZSxcbiAgICAgICAgICAgICAgZGF0YTogaW5wdXQuYmFzZTY0LFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICAgIHtcbiAgICAgICAgICAgIHR5cGU6IFwidGV4dFwiLFxuICAgICAgICAgICAgdGV4dDogXCJBbmFseXplIHRoaXMgbWVhbCBwaG90byBhbmQgcmV0dXJuIHRoZSBKU09OIG9iamVjdCBvbmx5LlwiLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICB9LFxuICAgIF0sXG4gIH0pO1xuICBjb25zdCB0ZXh0ID0gcmVzcG9uc2UuY29udGVudC5maW5kKChwKSA9PiBwLnR5cGUgPT09IFwidGV4dFwiKT8udGV4dDtcbiAgaWYgKCF0ZXh0KSByZXR1cm4gbnVsbDtcbiAgcmV0dXJuIHBhcnNlRm9vZFZpc2lvbkVzdGltYXRlKHRleHQpO1xufVxuIl19