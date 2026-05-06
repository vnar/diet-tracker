"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runFoodVisionModel = runFoodVisionModel;
const parseFoodVisionJson_1 = require("./parseFoodVisionJson");
/** Default: same Haiku family as insights refine (proven on this stack). Override via ANTHROPIC_FOOD_VISION_MODEL. */
const VISION_MODEL = (typeof process !== "undefined" && process.env.ANTHROPIC_FOOD_VISION_MODEL?.trim()) ||
    "claude-haiku-4-5";
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidmlzaW9uTW9kZWwuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJ2aXNpb25Nb2RlbC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOztBQW1CQSxnREFtQ0M7QUFyREQsK0RBQWdFO0FBRWhFLHNIQUFzSDtBQUN0SCxNQUFNLFlBQVksR0FDaEIsQ0FBQyxPQUFPLE9BQU8sS0FBSyxXQUFXLElBQUksT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsRUFBRSxJQUFJLEVBQUUsQ0FBQztJQUNuRixrQkFBa0IsQ0FBQztBQUVyQixNQUFNLGFBQWEsR0FBRzs7Ozs7O2tHQU00RSxDQUFDO0FBSW5HLG1GQUFtRjtBQUM1RSxLQUFLLFVBQVUsa0JBQWtCLENBQUMsS0FJeEM7SUFDQyxNQUFNLFNBQVMsR0FBRyxDQUFDLDJDQUFhLG1CQUFtQixFQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7SUFDOUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxTQUFTLENBQUMsRUFBRSxNQUFNLEVBQUUsS0FBSyxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDdkQsTUFBTSxRQUFRLEdBQUcsTUFBTSxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztRQUM1QyxLQUFLLEVBQUUsWUFBWTtRQUNuQixVQUFVLEVBQUUsR0FBRztRQUNmLFdBQVcsRUFBRSxHQUFHO1FBQ2hCLE1BQU0sRUFBRSxhQUFhO1FBQ3JCLFFBQVEsRUFBRTtZQUNSO2dCQUNFLElBQUksRUFBRSxNQUFNO2dCQUNaLE9BQU8sRUFBRTtvQkFDUDt3QkFDRSxJQUFJLEVBQUUsT0FBTzt3QkFDYixNQUFNLEVBQUU7NEJBQ04sSUFBSSxFQUFFLFFBQVE7NEJBQ2QsVUFBVSxFQUFFLEtBQUssQ0FBQyxTQUFTOzRCQUMzQixJQUFJLEVBQUUsS0FBSyxDQUFDLE1BQU07eUJBQ25CO3FCQUNGO29CQUNEO3dCQUNFLElBQUksRUFBRSxNQUFNO3dCQUNaLElBQUksRUFBRSwwREFBMEQ7cUJBQ2pFO2lCQUNGO2FBQ0Y7U0FDRjtLQUNGLENBQUMsQ0FBQztJQUNILE1BQU0sSUFBSSxHQUFHLFFBQVEsQ0FBQyxPQUFPLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxFQUFFLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxLQUFLLE1BQU0sQ0FBQyxFQUFFLElBQUksQ0FBQztJQUNuRSxJQUFJLENBQUMsSUFBSTtRQUFFLE9BQU8sSUFBSSxDQUFDO0lBQ3ZCLE9BQU8sSUFBQSw2Q0FBdUIsRUFBQyxJQUFJLENBQUMsQ0FBQztBQUN2QyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHR5cGUgeyBGb29kVmlzaW9uRXN0aW1hdGUgfSBmcm9tIFwiLi9jb250cmFjdHNcIjtcbmltcG9ydCB7IHBhcnNlRm9vZFZpc2lvbkVzdGltYXRlIH0gZnJvbSBcIi4vcGFyc2VGb29kVmlzaW9uSnNvblwiO1xuXG4vKiogRGVmYXVsdDogc2FtZSBIYWlrdSBmYW1pbHkgYXMgaW5zaWdodHMgcmVmaW5lIChwcm92ZW4gb24gdGhpcyBzdGFjaykuIE92ZXJyaWRlIHZpYSBBTlRIUk9QSUNfRk9PRF9WSVNJT05fTU9ERUwuICovXG5jb25zdCBWSVNJT05fTU9ERUwgPVxuICAodHlwZW9mIHByb2Nlc3MgIT09IFwidW5kZWZpbmVkXCIgJiYgcHJvY2Vzcy5lbnYuQU5USFJPUElDX0ZPT0RfVklTSU9OX01PREVMPy50cmltKCkpIHx8XG4gIFwiY2xhdWRlLWhhaWt1LTQtNVwiO1xuXG5jb25zdCBWSVNJT05fU1lTVEVNID0gYFlvdSBlc3RpbWF0ZSBjYWxvcmllcyBhbmQgcHJvdGVpbiBmcm9tIGEgbWVhbCBwaG90byBmb3IgYSBkaWV0LXRyYWNraW5nIGFwcC5cblJldHVybiBPTkxZIG9uZSBKU09OIG9iamVjdCAobm8gbWFya2Rvd24gZmVuY2VzKSB3aXRoIGV4YWN0bHkgdGhlc2Uga2V5czpcbi0gbWVhbExhYmVsOiBzaG9ydCBtZWFsIG5hbWUgKHN0cmluZylcbi0ga2NhbExvdywga2NhbE1pZCwga2NhbEhpZ2g6IGludGVnZXJzIGZvciBwbGF1c2libGUgY2Fsb3JpZSByYW5nZSAobG93IOKJpCBtaWQg4omkIGhpZ2gpXG4tIHByb3RlaW5HOiBpbnRlZ2VyIGdyYW1zIG9mIHByb3RlaW5cbi0gY29uZmlkZW5jZTogbnVtYmVyIGZyb20gMCB0byAxIGZvciBob3cgc3VyZSB5b3UgYXJlXG5JZiB0aGUgaW1hZ2UgaXMgbm90IGZvb2QsIHVzZSBtZWFsTGFiZWwgXCJVbnJlY29nbml6ZWRcIiBhbmQgd2lkZSByYW5nZXMgd2l0aCBjb25maWRlbmNlIHVuZGVyIDAuMy5gO1xuXG5leHBvcnQgdHlwZSBGb29kVmlzaW9uTWVkaWFUeXBlID0gXCJpbWFnZS9qcGVnXCIgfCBcImltYWdlL3BuZ1wiIHwgXCJpbWFnZS9naWZcIiB8IFwiaW1hZ2Uvd2VicFwiO1xuXG4vKiogQ2FsbHMgQW50aHJvcGljIHZpc2lvbiBhbmQgcGFyc2VzIEpTT04gaW50byBhIHN0cnVjdHVyZWQgZXN0aW1hdGUgKG9yIG51bGwpLiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIHJ1bkZvb2RWaXNpb25Nb2RlbChpbnB1dDoge1xuICBhcGlLZXk6IHN0cmluZztcbiAgYmFzZTY0OiBzdHJpbmc7XG4gIG1lZGlhVHlwZTogRm9vZFZpc2lvbk1lZGlhVHlwZTtcbn0pOiBQcm9taXNlPEZvb2RWaXNpb25Fc3RpbWF0ZSB8IG51bGw+IHtcbiAgY29uc3QgQW50aHJvcGljID0gKGF3YWl0IGltcG9ydChcIkBhbnRocm9waWMtYWkvc2RrXCIpKS5kZWZhdWx0O1xuICBjb25zdCBjbGllbnQgPSBuZXcgQW50aHJvcGljKHsgYXBpS2V5OiBpbnB1dC5hcGlLZXkgfSk7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2xpZW50Lm1lc3NhZ2VzLmNyZWF0ZSh7XG4gICAgbW9kZWw6IFZJU0lPTl9NT0RFTCxcbiAgICBtYXhfdG9rZW5zOiA1MTIsXG4gICAgdGVtcGVyYXR1cmU6IDAuMixcbiAgICBzeXN0ZW06IFZJU0lPTl9TWVNURU0sXG4gICAgbWVzc2FnZXM6IFtcbiAgICAgIHtcbiAgICAgICAgcm9sZTogXCJ1c2VyXCIsXG4gICAgICAgIGNvbnRlbnQ6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICB0eXBlOiBcImltYWdlXCIsXG4gICAgICAgICAgICBzb3VyY2U6IHtcbiAgICAgICAgICAgICAgdHlwZTogXCJiYXNlNjRcIixcbiAgICAgICAgICAgICAgbWVkaWFfdHlwZTogaW5wdXQubWVkaWFUeXBlLFxuICAgICAgICAgICAgICBkYXRhOiBpbnB1dC5iYXNlNjQsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgdHlwZTogXCJ0ZXh0XCIsXG4gICAgICAgICAgICB0ZXh0OiBcIkFuYWx5emUgdGhpcyBtZWFsIHBob3RvIGFuZCByZXR1cm4gdGhlIEpTT04gb2JqZWN0IG9ubHkuXCIsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgIH0sXG4gICAgXSxcbiAgfSk7XG4gIGNvbnN0IHRleHQgPSByZXNwb25zZS5jb250ZW50LmZpbmQoKHApID0+IHAudHlwZSA9PT0gXCJ0ZXh0XCIpPy50ZXh0O1xuICBpZiAoIXRleHQpIHJldHVybiBudWxsO1xuICByZXR1cm4gcGFyc2VGb29kVmlzaW9uRXN0aW1hdGUodGV4dCk7XG59XG4iXX0=