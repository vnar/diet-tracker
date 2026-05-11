"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VOICE_DAILY_LOG_SYSTEM = void 0;
exports.VOICE_DAILY_LOG_SYSTEM = `You extract structured daily health check-in fields from colloquial English (e.g. "I biked 30 min", "two coffees", "ate a burrito").
Reply with ONLY a single JSON object (no markdown, no code fences). Use null when unknown or not mentioned.

Schema (all keys required; use null or [] when absent):
{
  "morning_weight_kg": number|null,
  "night_weight_kg": number|null,
  "calories": number|null,
  "protein_g": number|null,
  "steps": number|null,
  "sleep_hours": number|null,
  "workout": boolean|null,
  "alcohol": boolean|null,
  "late_snack": boolean|null,
  "high_sodium": boolean|null,
  "meals_summary": string|null,
  "food_items": [{"description": string, "est_kcal": number|null, "est_protein_g": number|null}],
  "activity_burn_hint": string|null,
  "confidence": number,
  "unclear_parts": string[]
}

Rules:
- Weights must be in kilograms (convert from lb/stones/pounds if the user said those units).
- "food_items": each distinct food or drink mentioned (e.g. "two coffees" → one item with description "Two coffees" and a rough est_kcal range 20–80 if unsure pick mid). Snacks/meals get separate items when clearly separate.
- "activity_burn_hint": concise English for activity burn estimation, include duration if said (e.g. "45 minute bike ride", "walked 20 minutes"). null if no exercise beyond generic "workout".
- "calories" / "protein_g": only if the user stated a daily total explicitly; otherwise null (do not sum food_items into calories automatically).
- "confidence" is 0–1 for how sure you are overall.
- "unclear_parts" lists short phrases you could not map (empty array if none).
- Booleans: true only if clearly affirmed for today; false if clearly denied; null if not mentioned.
- meals_summary: one-line summary of eating (optional; may overlap food_items).
- Prefer reasonable est_kcal for common items over null when the user clearly ate/drank something.
- Never invent body weight or step counts: prefer null over guessing.
- Do not diagnose or prescribe.`;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicHJvbXB0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicHJvbXB0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUFhLFFBQUEsc0JBQXNCLEdBQUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztnQ0FpQ04sQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImV4cG9ydCBjb25zdCBWT0lDRV9EQUlMWV9MT0dfU1lTVEVNID0gYFlvdSBleHRyYWN0IHN0cnVjdHVyZWQgZGFpbHkgaGVhbHRoIGNoZWNrLWluIGZpZWxkcyBmcm9tIGNvbGxvcXVpYWwgRW5nbGlzaCAoZS5nLiBcIkkgYmlrZWQgMzAgbWluXCIsIFwidHdvIGNvZmZlZXNcIiwgXCJhdGUgYSBidXJyaXRvXCIpLlxuUmVwbHkgd2l0aCBPTkxZIGEgc2luZ2xlIEpTT04gb2JqZWN0IChubyBtYXJrZG93biwgbm8gY29kZSBmZW5jZXMpLiBVc2UgbnVsbCB3aGVuIHVua25vd24gb3Igbm90IG1lbnRpb25lZC5cblxuU2NoZW1hIChhbGwga2V5cyByZXF1aXJlZDsgdXNlIG51bGwgb3IgW10gd2hlbiBhYnNlbnQpOlxue1xuICBcIm1vcm5pbmdfd2VpZ2h0X2tnXCI6IG51bWJlcnxudWxsLFxuICBcIm5pZ2h0X3dlaWdodF9rZ1wiOiBudW1iZXJ8bnVsbCxcbiAgXCJjYWxvcmllc1wiOiBudW1iZXJ8bnVsbCxcbiAgXCJwcm90ZWluX2dcIjogbnVtYmVyfG51bGwsXG4gIFwic3RlcHNcIjogbnVtYmVyfG51bGwsXG4gIFwic2xlZXBfaG91cnNcIjogbnVtYmVyfG51bGwsXG4gIFwid29ya291dFwiOiBib29sZWFufG51bGwsXG4gIFwiYWxjb2hvbFwiOiBib29sZWFufG51bGwsXG4gIFwibGF0ZV9zbmFja1wiOiBib29sZWFufG51bGwsXG4gIFwiaGlnaF9zb2RpdW1cIjogYm9vbGVhbnxudWxsLFxuICBcIm1lYWxzX3N1bW1hcnlcIjogc3RyaW5nfG51bGwsXG4gIFwiZm9vZF9pdGVtc1wiOiBbe1wiZGVzY3JpcHRpb25cIjogc3RyaW5nLCBcImVzdF9rY2FsXCI6IG51bWJlcnxudWxsLCBcImVzdF9wcm90ZWluX2dcIjogbnVtYmVyfG51bGx9XSxcbiAgXCJhY3Rpdml0eV9idXJuX2hpbnRcIjogc3RyaW5nfG51bGwsXG4gIFwiY29uZmlkZW5jZVwiOiBudW1iZXIsXG4gIFwidW5jbGVhcl9wYXJ0c1wiOiBzdHJpbmdbXVxufVxuXG5SdWxlczpcbi0gV2VpZ2h0cyBtdXN0IGJlIGluIGtpbG9ncmFtcyAoY29udmVydCBmcm9tIGxiL3N0b25lcy9wb3VuZHMgaWYgdGhlIHVzZXIgc2FpZCB0aG9zZSB1bml0cykuXG4tIFwiZm9vZF9pdGVtc1wiOiBlYWNoIGRpc3RpbmN0IGZvb2Qgb3IgZHJpbmsgbWVudGlvbmVkIChlLmcuIFwidHdvIGNvZmZlZXNcIiDihpIgb25lIGl0ZW0gd2l0aCBkZXNjcmlwdGlvbiBcIlR3byBjb2ZmZWVzXCIgYW5kIGEgcm91Z2ggZXN0X2tjYWwgcmFuZ2UgMjDigJM4MCBpZiB1bnN1cmUgcGljayBtaWQpLiBTbmFja3MvbWVhbHMgZ2V0IHNlcGFyYXRlIGl0ZW1zIHdoZW4gY2xlYXJseSBzZXBhcmF0ZS5cbi0gXCJhY3Rpdml0eV9idXJuX2hpbnRcIjogY29uY2lzZSBFbmdsaXNoIGZvciBhY3Rpdml0eSBidXJuIGVzdGltYXRpb24sIGluY2x1ZGUgZHVyYXRpb24gaWYgc2FpZCAoZS5nLiBcIjQ1IG1pbnV0ZSBiaWtlIHJpZGVcIiwgXCJ3YWxrZWQgMjAgbWludXRlc1wiKS4gbnVsbCBpZiBubyBleGVyY2lzZSBiZXlvbmQgZ2VuZXJpYyBcIndvcmtvdXRcIi5cbi0gXCJjYWxvcmllc1wiIC8gXCJwcm90ZWluX2dcIjogb25seSBpZiB0aGUgdXNlciBzdGF0ZWQgYSBkYWlseSB0b3RhbCBleHBsaWNpdGx5OyBvdGhlcndpc2UgbnVsbCAoZG8gbm90IHN1bSBmb29kX2l0ZW1zIGludG8gY2Fsb3JpZXMgYXV0b21hdGljYWxseSkuXG4tIFwiY29uZmlkZW5jZVwiIGlzIDDigJMxIGZvciBob3cgc3VyZSB5b3UgYXJlIG92ZXJhbGwuXG4tIFwidW5jbGVhcl9wYXJ0c1wiIGxpc3RzIHNob3J0IHBocmFzZXMgeW91IGNvdWxkIG5vdCBtYXAgKGVtcHR5IGFycmF5IGlmIG5vbmUpLlxuLSBCb29sZWFuczogdHJ1ZSBvbmx5IGlmIGNsZWFybHkgYWZmaXJtZWQgZm9yIHRvZGF5OyBmYWxzZSBpZiBjbGVhcmx5IGRlbmllZDsgbnVsbCBpZiBub3QgbWVudGlvbmVkLlxuLSBtZWFsc19zdW1tYXJ5OiBvbmUtbGluZSBzdW1tYXJ5IG9mIGVhdGluZyAob3B0aW9uYWw7IG1heSBvdmVybGFwIGZvb2RfaXRlbXMpLlxuLSBQcmVmZXIgcmVhc29uYWJsZSBlc3Rfa2NhbCBmb3IgY29tbW9uIGl0ZW1zIG92ZXIgbnVsbCB3aGVuIHRoZSB1c2VyIGNsZWFybHkgYXRlL2RyYW5rIHNvbWV0aGluZy5cbi0gTmV2ZXIgaW52ZW50IGJvZHkgd2VpZ2h0IG9yIHN0ZXAgY291bnRzOiBwcmVmZXIgbnVsbCBvdmVyIGd1ZXNzaW5nLlxuLSBEbyBub3QgZGlhZ25vc2Ugb3IgcHJlc2NyaWJlLmA7XG4iXX0=