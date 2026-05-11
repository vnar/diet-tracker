"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseVoiceDailyTranscriptWithAnthropic = parseVoiceDailyTranscriptWithAnthropic;
const nlMealParseResult_1 = require("../meals/nlMealParseResult");
const anthropic_api_key_1 = require("../server/anthropic-api-key");
const prompt_1 = require("./prompt");
const normalizeParse_1 = require("./normalizeParse");
/**
 * Server-only: call Anthropic to parse transcript into structured fields.
 */
async function parseVoiceDailyTranscriptWithAnthropic(transcript) {
    const apiKey = (0, anthropic_api_key_1.getAnthropicApiKeyForServer)();
    if (!apiKey)
        return { ok: false, error: "no_api_key" };
    const trimmed = transcript.trim();
    if (trimmed.length < 2)
        return { ok: false, error: "parse_failed" };
    try {
        const Anthropic = (await Promise.resolve().then(() => require("@anthropic-ai/sdk"))).default;
        const client = new Anthropic({ apiKey });
        const model = process.env.ANTHROPIC_VOICE_DAILY_MODEL ?? "claude-haiku-4-5";
        const response = await client.messages.create({
            model,
            max_tokens: 500,
            temperature: 0.1,
            system: prompt_1.VOICE_DAILY_LOG_SYSTEM,
            messages: [
                {
                    role: "user",
                    content: `Transcript:\n"""${trimmed.slice(0, 8000)}"""`,
                },
            ],
        });
        const text = response.content.find((p) => p.type === "text")?.text;
        if (!text)
            return { ok: false, error: "model_empty" };
        const jsonStr = (0, nlMealParseResult_1.extractJsonObjectFromNlText)(text);
        if (!jsonStr)
            return { ok: false, error: "parse_failed" };
        let parsed;
        try {
            parsed = JSON.parse(jsonStr);
        }
        catch {
            return { ok: false, error: "parse_failed" };
        }
        const norm = (0, normalizeParse_1.normalizeVoiceDailyParseRecord)(parsed);
        if (!norm)
            return { ok: false, error: "parse_failed" };
        return { ok: true, parsed: norm };
    }
    catch {
        return { ok: false, error: "parse_failed" };
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyc2VUcmFuc2NyaXB0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicGFyc2VUcmFuc2NyaXB0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBYUEsd0ZBeUNDO0FBdERELGtFQUF5RTtBQUN6RSxtRUFBMEU7QUFDMUUscUNBQWtEO0FBQ2xELHFEQUFrRTtBQU9sRTs7R0FFRztBQUNJLEtBQUssVUFBVSxzQ0FBc0MsQ0FDMUQsVUFBa0I7SUFFbEIsTUFBTSxNQUFNLEdBQUcsSUFBQSwrQ0FBMkIsR0FBRSxDQUFDO0lBQzdDLElBQUksQ0FBQyxNQUFNO1FBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRSxDQUFDO0lBRXZELE1BQU0sT0FBTyxHQUFHLFVBQVUsQ0FBQyxJQUFJLEVBQUUsQ0FBQztJQUNsQyxJQUFJLE9BQU8sQ0FBQyxNQUFNLEdBQUcsQ0FBQztRQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQztJQUVwRSxJQUFJLENBQUM7UUFDSCxNQUFNLFNBQVMsR0FBRyxDQUFDLDJDQUFhLG1CQUFtQixFQUFDLENBQUMsQ0FBQyxPQUFPLENBQUM7UUFDOUQsTUFBTSxNQUFNLEdBQUcsSUFBSSxTQUFTLENBQUMsRUFBRSxNQUFNLEVBQUUsQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sS0FBSyxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLElBQUksa0JBQWtCLENBQUM7UUFDNUUsTUFBTSxRQUFRLEdBQUcsTUFBTSxNQUFNLENBQUMsUUFBUSxDQUFDLE1BQU0sQ0FBQztZQUM1QyxLQUFLO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixXQUFXLEVBQUUsR0FBRztZQUNoQixNQUFNLEVBQUUsK0JBQXNCO1lBQzlCLFFBQVEsRUFBRTtnQkFDUjtvQkFDRSxJQUFJLEVBQUUsTUFBTTtvQkFDWixPQUFPLEVBQUUsbUJBQW1CLE9BQU8sQ0FBQyxLQUFLLENBQUMsQ0FBQyxFQUFFLElBQUksQ0FBQyxLQUFLO2lCQUN4RDthQUNGO1NBQ0YsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxJQUFJLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLEVBQUUsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLEtBQUssTUFBTSxDQUFDLEVBQUUsSUFBSSxDQUFDO1FBQ25FLElBQUksQ0FBQyxJQUFJO1lBQUUsT0FBTyxFQUFFLEVBQUUsRUFBRSxLQUFLLEVBQUUsS0FBSyxFQUFFLGFBQWEsRUFBRSxDQUFDO1FBQ3RELE1BQU0sT0FBTyxHQUFHLElBQUEsK0NBQTJCLEVBQUMsSUFBSSxDQUFDLENBQUM7UUFDbEQsSUFBSSxDQUFDLE9BQU87WUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFLENBQUM7UUFDMUQsSUFBSSxNQUFlLENBQUM7UUFDcEIsSUFBSSxDQUFDO1lBQ0gsTUFBTSxHQUFHLElBQUksQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFZLENBQUM7UUFDMUMsQ0FBQztRQUFDLE1BQU0sQ0FBQztZQUNQLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQztRQUM5QyxDQUFDO1FBQ0QsTUFBTSxJQUFJLEdBQUcsSUFBQSwrQ0FBOEIsRUFBQyxNQUFNLENBQUMsQ0FBQztRQUNwRCxJQUFJLENBQUMsSUFBSTtZQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQztRQUN2RCxPQUFPLEVBQUUsRUFBRSxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLENBQUM7SUFDcEMsQ0FBQztJQUFDLE1BQU0sQ0FBQztRQUNQLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxjQUFjLEVBQUUsQ0FBQztJQUM5QyxDQUFDO0FBQ0gsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IGV4dHJhY3RKc29uT2JqZWN0RnJvbU5sVGV4dCB9IGZyb20gXCIuLi9tZWFscy9ubE1lYWxQYXJzZVJlc3VsdFwiO1xuaW1wb3J0IHsgZ2V0QW50aHJvcGljQXBpS2V5Rm9yU2VydmVyIH0gZnJvbSBcIi4uL3NlcnZlci9hbnRocm9waWMtYXBpLWtleVwiO1xuaW1wb3J0IHsgVk9JQ0VfREFJTFlfTE9HX1NZU1RFTSB9IGZyb20gXCIuL3Byb21wdFwiO1xuaW1wb3J0IHsgbm9ybWFsaXplVm9pY2VEYWlseVBhcnNlUmVjb3JkIH0gZnJvbSBcIi4vbm9ybWFsaXplUGFyc2VcIjtcbmltcG9ydCB0eXBlIHsgVm9pY2VEYWlseVBhcnNlZEZpZWxkcyB9IGZyb20gXCIuL3R5cGVzXCI7XG5cbmV4cG9ydCB0eXBlIFZvaWNlRGFpbHlQYXJzZVJlc3VsdCA9XG4gIHwgeyBvazogdHJ1ZTsgcGFyc2VkOiBWb2ljZURhaWx5UGFyc2VkRmllbGRzIH1cbiAgfCB7IG9rOiBmYWxzZTsgZXJyb3I6IFwibm9fYXBpX2tleVwiIHwgXCJwYXJzZV9mYWlsZWRcIiB8IFwibW9kZWxfZW1wdHlcIiB9O1xuXG4vKipcbiAqIFNlcnZlci1vbmx5OiBjYWxsIEFudGhyb3BpYyB0byBwYXJzZSB0cmFuc2NyaXB0IGludG8gc3RydWN0dXJlZCBmaWVsZHMuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZVZvaWNlRGFpbHlUcmFuc2NyaXB0V2l0aEFudGhyb3BpYyhcbiAgdHJhbnNjcmlwdDogc3RyaW5nLFxuKTogUHJvbWlzZTxWb2ljZURhaWx5UGFyc2VSZXN1bHQ+IHtcbiAgY29uc3QgYXBpS2V5ID0gZ2V0QW50aHJvcGljQXBpS2V5Rm9yU2VydmVyKCk7XG4gIGlmICghYXBpS2V5KSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIm5vX2FwaV9rZXlcIiB9O1xuXG4gIGNvbnN0IHRyaW1tZWQgPSB0cmFuc2NyaXB0LnRyaW0oKTtcbiAgaWYgKHRyaW1tZWQubGVuZ3RoIDwgMikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJwYXJzZV9mYWlsZWRcIiB9O1xuXG4gIHRyeSB7XG4gICAgY29uc3QgQW50aHJvcGljID0gKGF3YWl0IGltcG9ydChcIkBhbnRocm9waWMtYWkvc2RrXCIpKS5kZWZhdWx0O1xuICAgIGNvbnN0IGNsaWVudCA9IG5ldyBBbnRocm9waWMoeyBhcGlLZXkgfSk7XG4gICAgY29uc3QgbW9kZWwgPSBwcm9jZXNzLmVudi5BTlRIUk9QSUNfVk9JQ0VfREFJTFlfTU9ERUwgPz8gXCJjbGF1ZGUtaGFpa3UtNC01XCI7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjbGllbnQubWVzc2FnZXMuY3JlYXRlKHtcbiAgICAgIG1vZGVsLFxuICAgICAgbWF4X3Rva2VuczogNTAwLFxuICAgICAgdGVtcGVyYXR1cmU6IDAuMSxcbiAgICAgIHN5c3RlbTogVk9JQ0VfREFJTFlfTE9HX1NZU1RFTSxcbiAgICAgIG1lc3NhZ2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICByb2xlOiBcInVzZXJcIixcbiAgICAgICAgICBjb250ZW50OiBgVHJhbnNjcmlwdDpcXG5cIlwiXCIke3RyaW1tZWQuc2xpY2UoMCwgODAwMCl9XCJcIlwiYCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG4gICAgY29uc3QgdGV4dCA9IHJlc3BvbnNlLmNvbnRlbnQuZmluZCgocCkgPT4gcC50eXBlID09PSBcInRleHRcIik/LnRleHQ7XG4gICAgaWYgKCF0ZXh0KSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIm1vZGVsX2VtcHR5XCIgfTtcbiAgICBjb25zdCBqc29uU3RyID0gZXh0cmFjdEpzb25PYmplY3RGcm9tTmxUZXh0KHRleHQpO1xuICAgIGlmICghanNvblN0cikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJwYXJzZV9mYWlsZWRcIiB9O1xuICAgIGxldCBwYXJzZWQ6IHVua25vd247XG4gICAgdHJ5IHtcbiAgICAgIHBhcnNlZCA9IEpTT04ucGFyc2UoanNvblN0cikgYXMgdW5rbm93bjtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwicGFyc2VfZmFpbGVkXCIgfTtcbiAgICB9XG4gICAgY29uc3Qgbm9ybSA9IG5vcm1hbGl6ZVZvaWNlRGFpbHlQYXJzZVJlY29yZChwYXJzZWQpO1xuICAgIGlmICghbm9ybSkgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJwYXJzZV9mYWlsZWRcIiB9O1xuICAgIHJldHVybiB7IG9rOiB0cnVlLCBwYXJzZWQ6IG5vcm0gfTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJwYXJzZV9mYWlsZWRcIiB9O1xuICB9XG59XG4iXX0=