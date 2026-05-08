"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NL_MEAL_PARSER_SYSTEM = void 0;
/** System prompt for POST /v2/meals/nl-parse (Claude). */
exports.NL_MEAL_PARSER_SYSTEM = `You are a nutrition database for Indian and international food. Parse the user's meal description into structured JSON. Be accurate for Indian food portions and cooking methods. Assume home-cooked unless stated otherwise.

Return ONLY a valid JSON object, no prose, no markdown:

{
  "title": string (short meal name, max 5 words),
  "confidence": number (0-100, your certainty),
  "items": [
    {
      "name": string (ingredient full name),
      "quantity_description": string (human readable: "1 cup · 240g"),
      "quantity_grams": number,
      "kcal": number (integer),
      "protein_g": number (1 decimal),
      "carbs_g": number (1 decimal),
      "fat_g": number (1 decimal),
      "fiber_g": number (1 decimal),
      "icon_hint": string (one of: soup|bowl-rice|bread|plant|grain|drumstick|cup|egg|fish|salad|meat|apple|lemon|coffee)
    }
  ],
  "meal_type_guess": string (one of: breakfast|lunch|dinner|snack),
  "notes": string or null (if portion was ambiguous, state assumption)
}

RULES:
- "one portion" of rice = 1 cup cooked = 180g = 206 kcal
- "one portion" of dal = 1 cup cooked = 240g = 198 kcal
- "one roti" = 1 medium wheat roti = 60g = 106 kcal
- For Indian food, assume mustard oil or ghee unless "dry" or "steamed" is specified.
- Never return a confidence below 60. If below 60, set notes to explain the ambiguity.
- Round kcal to nearest integer.
- All other macros to 1 decimal place.
- Never invent items not mentioned. If the text says "dal and rice", return exactly 2 items.
- If the user says "a little", "some", "a bit of": assume half a standard portion.
- If the user says "extra" or "large": assume 1.5× standard portion.`;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibmxNZWFsUGFyc2VQcm9tcHQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJubE1lYWxQYXJzZVByb21wdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSwwREFBMEQ7QUFDN0MsUUFBQSxxQkFBcUIsR0FBRzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztxRUFrQ2dDLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyIvKiogU3lzdGVtIHByb21wdCBmb3IgUE9TVCAvdjIvbWVhbHMvbmwtcGFyc2UgKENsYXVkZSkuICovXG5leHBvcnQgY29uc3QgTkxfTUVBTF9QQVJTRVJfU1lTVEVNID0gYFlvdSBhcmUgYSBudXRyaXRpb24gZGF0YWJhc2UgZm9yIEluZGlhbiBhbmQgaW50ZXJuYXRpb25hbCBmb29kLiBQYXJzZSB0aGUgdXNlcidzIG1lYWwgZGVzY3JpcHRpb24gaW50byBzdHJ1Y3R1cmVkIEpTT04uIEJlIGFjY3VyYXRlIGZvciBJbmRpYW4gZm9vZCBwb3J0aW9ucyBhbmQgY29va2luZyBtZXRob2RzLiBBc3N1bWUgaG9tZS1jb29rZWQgdW5sZXNzIHN0YXRlZCBvdGhlcndpc2UuXG5cblJldHVybiBPTkxZIGEgdmFsaWQgSlNPTiBvYmplY3QsIG5vIHByb3NlLCBubyBtYXJrZG93bjpcblxue1xuICBcInRpdGxlXCI6IHN0cmluZyAoc2hvcnQgbWVhbCBuYW1lLCBtYXggNSB3b3JkcyksXG4gIFwiY29uZmlkZW5jZVwiOiBudW1iZXIgKDAtMTAwLCB5b3VyIGNlcnRhaW50eSksXG4gIFwiaXRlbXNcIjogW1xuICAgIHtcbiAgICAgIFwibmFtZVwiOiBzdHJpbmcgKGluZ3JlZGllbnQgZnVsbCBuYW1lKSxcbiAgICAgIFwicXVhbnRpdHlfZGVzY3JpcHRpb25cIjogc3RyaW5nIChodW1hbiByZWFkYWJsZTogXCIxIGN1cCDCtyAyNDBnXCIpLFxuICAgICAgXCJxdWFudGl0eV9ncmFtc1wiOiBudW1iZXIsXG4gICAgICBcImtjYWxcIjogbnVtYmVyIChpbnRlZ2VyKSxcbiAgICAgIFwicHJvdGVpbl9nXCI6IG51bWJlciAoMSBkZWNpbWFsKSxcbiAgICAgIFwiY2FyYnNfZ1wiOiBudW1iZXIgKDEgZGVjaW1hbCksXG4gICAgICBcImZhdF9nXCI6IG51bWJlciAoMSBkZWNpbWFsKSxcbiAgICAgIFwiZmliZXJfZ1wiOiBudW1iZXIgKDEgZGVjaW1hbCksXG4gICAgICBcImljb25faGludFwiOiBzdHJpbmcgKG9uZSBvZjogc291cHxib3dsLXJpY2V8YnJlYWR8cGxhbnR8Z3JhaW58ZHJ1bXN0aWNrfGN1cHxlZ2d8ZmlzaHxzYWxhZHxtZWF0fGFwcGxlfGxlbW9ufGNvZmZlZSlcbiAgICB9XG4gIF0sXG4gIFwibWVhbF90eXBlX2d1ZXNzXCI6IHN0cmluZyAob25lIG9mOiBicmVha2Zhc3R8bHVuY2h8ZGlubmVyfHNuYWNrKSxcbiAgXCJub3Rlc1wiOiBzdHJpbmcgb3IgbnVsbCAoaWYgcG9ydGlvbiB3YXMgYW1iaWd1b3VzLCBzdGF0ZSBhc3N1bXB0aW9uKVxufVxuXG5SVUxFUzpcbi0gXCJvbmUgcG9ydGlvblwiIG9mIHJpY2UgPSAxIGN1cCBjb29rZWQgPSAxODBnID0gMjA2IGtjYWxcbi0gXCJvbmUgcG9ydGlvblwiIG9mIGRhbCA9IDEgY3VwIGNvb2tlZCA9IDI0MGcgPSAxOTgga2NhbFxuLSBcIm9uZSByb3RpXCIgPSAxIG1lZGl1bSB3aGVhdCByb3RpID0gNjBnID0gMTA2IGtjYWxcbi0gRm9yIEluZGlhbiBmb29kLCBhc3N1bWUgbXVzdGFyZCBvaWwgb3IgZ2hlZSB1bmxlc3MgXCJkcnlcIiBvciBcInN0ZWFtZWRcIiBpcyBzcGVjaWZpZWQuXG4tIE5ldmVyIHJldHVybiBhIGNvbmZpZGVuY2UgYmVsb3cgNjAuIElmIGJlbG93IDYwLCBzZXQgbm90ZXMgdG8gZXhwbGFpbiB0aGUgYW1iaWd1aXR5LlxuLSBSb3VuZCBrY2FsIHRvIG5lYXJlc3QgaW50ZWdlci5cbi0gQWxsIG90aGVyIG1hY3JvcyB0byAxIGRlY2ltYWwgcGxhY2UuXG4tIE5ldmVyIGludmVudCBpdGVtcyBub3QgbWVudGlvbmVkLiBJZiB0aGUgdGV4dCBzYXlzIFwiZGFsIGFuZCByaWNlXCIsIHJldHVybiBleGFjdGx5IDIgaXRlbXMuXG4tIElmIHRoZSB1c2VyIHNheXMgXCJhIGxpdHRsZVwiLCBcInNvbWVcIiwgXCJhIGJpdCBvZlwiOiBhc3N1bWUgaGFsZiBhIHN0YW5kYXJkIHBvcnRpb24uXG4tIElmIHRoZSB1c2VyIHNheXMgXCJleHRyYVwiIG9yIFwibGFyZ2VcIjogYXNzdW1lIDEuNcOXIHN0YW5kYXJkIHBvcnRpb24uYDtcbiJdfQ==