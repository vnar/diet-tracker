"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
    /** HTTP API → Lambda integration is capped (~30s); stay well under so the client gets JSON, not a dropped connection. */
    const llmDeadlineMs = Math.min(26000, Math.max(8000, Number(process.env.VOICE_PARSE_LLM_DEADLINE_MS ?? "22000") || 22000));
    try {
        const Anthropic = (await Promise.resolve().then(() => __importStar(require("@anthropic-ai/sdk")))).default;
        const client = new Anthropic({ apiKey });
        const model = process.env.ANTHROPIC_VOICE_DAILY_MODEL ?? "claude-haiku-4-5";
        const createPromise = client.messages.create({
            model,
            max_tokens: 400,
            temperature: 0.1,
            system: prompt_1.VOICE_DAILY_LOG_SYSTEM,
            messages: [
                {
                    role: "user",
                    content: `Transcript:\n"""${trimmed.slice(0, 8000)}"""`,
                },
            ],
        });
        let timeoutId;
        const timeoutPromise = new Promise((_, reject) => {
            timeoutId = setTimeout(() => {
                reject(Object.assign(new Error("voice_parse_llm_deadline"), { name: "VoiceParseLlmDeadline" }));
            }, llmDeadlineMs);
        });
        let response;
        try {
            response = await Promise.race([createPromise, timeoutPromise]);
        }
        catch (err) {
            if (err instanceof Error && err.name === "VoiceParseLlmDeadline") {
                return { ok: false, error: "voice_parse_timeout" };
            }
            throw err;
        }
        finally {
            if (timeoutId)
                clearTimeout(timeoutId);
        }
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicGFyc2VUcmFuc2NyaXB0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicGFyc2VUcmFuc2NyaXB0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBZ0JBLHdGQWdFQztBQWhGRCxrRUFBeUU7QUFDekUsbUVBQTBFO0FBQzFFLHFDQUFrRDtBQUNsRCxxREFBa0U7QUFVbEU7O0dBRUc7QUFDSSxLQUFLLFVBQVUsc0NBQXNDLENBQzFELFVBQWtCO0lBRWxCLE1BQU0sTUFBTSxHQUFHLElBQUEsK0NBQTJCLEdBQUUsQ0FBQztJQUM3QyxJQUFJLENBQUMsTUFBTTtRQUFFLE9BQU8sRUFBRSxFQUFFLEVBQUUsS0FBSyxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUUsQ0FBQztJQUV2RCxNQUFNLE9BQU8sR0FBRyxVQUFVLENBQUMsSUFBSSxFQUFFLENBQUM7SUFDbEMsSUFBSSxPQUFPLENBQUMsTUFBTSxHQUFHLENBQUM7UUFBRSxPQUFPLEVBQUUsRUFBRSxFQUFFLEtBQUssRUFBRSxLQUFLLEVBQUUsY0FBYyxFQUFFLENBQUM7SUFFcEUseUhBQXlIO0lBQ3pILE1BQU0sYUFBYSxHQUFHLElBQUksQ0FBQyxHQUFHLENBQzVCLEtBQU0sRUFDTixJQUFJLENBQUMsR0FBRyxDQUFDLElBQUssRUFBRSxNQUFNLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsSUFBSSxPQUFPLENBQUMsSUFBSSxLQUFNLENBQUMsQ0FDdEYsQ0FBQztJQUVGLElBQUksQ0FBQztRQUNILE1BQU0sU0FBUyxHQUFHLENBQUMsd0RBQWEsbUJBQW1CLEdBQUMsQ0FBQyxDQUFDLE9BQU8sQ0FBQztRQUM5RCxNQUFNLE1BQU0sR0FBRyxJQUFJLFNBQVMsQ0FBQyxFQUFFLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFDekMsTUFBTSxLQUFLLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQywyQkFBMkIsSUFBSSxrQkFBa0IsQ0FB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YmplY3RGcm9tTmxUZXh0IH0gZnJvbSBcIi4uL21lYWxzL25sTWVhbFBhcnNlUmVzdWx0XCI7XG5pbXBvcnQgeyBnZXRBbnRocm9waWNBcGlLZXlGb3JTZXJ2ZXIgfSBmcm9tIFwiLi4vc2VydmVyL2FudGhyb3BpYy1hcGkta2V5XCI7XG5pbXBvcnQgeyBWT0lDRV9EQUlMWV9MT0dfU1lTVEVNIH0gZnJvbSBcIi4vcHJvbXB0XCI7XG5pbXBvcnQgeyBub3JtYWxpemVWb2ljZURhaWx5UGFyc2VSZWNvcmQgfSBmcm9tIFwiLi9ub3JtYWxpemVQYXJzZVwiO1xuaW1wb3J0IHR5cGUgeyBWb2ljZURhaWx5UGFyc2VkRmllbGRzIH0gZnJvbSBcIi4vdHlwZXNcIjtcblxuZXhwb3J0IHR5cGUgVm9pY2VEYWlseVBhcnNlUmVzdWx0ID1cbiAgfCB7IG9rOiB0cnVlOyBwYXJzZWQ6IFZvaWNlRGFpbHlQYXJzZWRGaWVsZHMgfVxuICB8IHtcbiAgICAgIG9rOiBmYWxzZTtcbiAgICAgIGVycm9yOiBcIm5vX2FwaV9rZXlcIiB8IFwicGFyc2VfZmFpbGVkXCIgfCBcIm1vZGVsX2VtcHR5XCIgfCBcInZvaWNlX3BhcnNlX3RpbWVvdXRcIjtcbiAgICB9O1xuXG4vKipcbiAqIFNlcnZlci1vbmx5OiBjYWxsIEFudGhyb3BpYyB0byBwYXJzZSB0cmFuc2NyaXB0IGludG8gc3RydWN0dXJlZCBmaWVsZHMuXG4gKi9cbmV4cG9ydCBhc3luYyBmdW5jdGlvbiBwYXJzZVZvaWNlRGFpbHlUcmFuc2NyaXB0V2l0aEFudGhyb3BpYyhcbiAgdHJhbnNjcmlwdDogc3RyaW5nLFxuKTogUHJvbWlzZTxWb2ljZURhaWx5UGFyc2VSZXN1bHQ+IHtcbiAgY29uc3QgYXBpS2V5ID0gZ2V0QW50aHJvcGljQXBpS2V5Rm9yU2VydmVyKCk7XG4gIGlmICghYXBpS2V5KSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcIm5vX2FwaV9rZXlcIiB9O1xuXG4gIGNvbnN0IHRyaW1tZWQgPSB0cmFuc2NyaXB0LnRyaW0oKTtcbiAgaWYgKHRyaW1tZWQubGVuZ3RoIDwgMikgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJwYXJzZV9mYWlsZWRcIiB9O1xuXG4gIC8qKiBIVFRQIEFQSSDihpIgTGFtYmRhIGludGVncmF0aW9uIGlzIGNhcHBlZCAofjMwcyk7IHN0YXkgd2VsbCB1bmRlciBzbyB0aGUgY2xpZW50IGdldHMgSlNPTiwgbm90IGEgZHJvcHBlZCBjb25uZWN0aW9uLiAqL1xuICBjb25zdCBsbG1EZWFkbGluZU1zID0gTWF0aC5taW4oXG4gICAgMjZfMDAwLFxuICAgIE1hdGgubWF4KDhfMDAwLCBOdW1iZXIocHJvY2Vzcy5lbnYuVk9JQ0VfUEFSU0VfTExNX0RFQURMSU5FX01TID8/IFwiMjIwMDBcIikgfHwgMjJfMDAwKSxcbiAgKTtcblxuICB0cnkge1xuICAgIGNvbnN0IEFudGhyb3BpYyA9IChhd2FpdCBpbXBvcnQoXCJAYW50aHJvcGljLWFpL3Nka1wiKSkuZGVmYXVsdDtcbiAgICBjb25zdCBjbGllbnQgPSBuZXcgQW50aHJvcGljKHsgYXBpS2V5IH0pO1xuICAgIGNvbnN0IG1vZGVsID0gcHJvY2Vzcy5lbnYuQU5USFJPUElDX1ZPSUNFX0RBSUxZX01PREVMID8/IFwiY2xhdWRlLWhhaWt1LTQtNVwiO1xuICAgIGNvbnN0IGNyZWF0ZVByb21pc2UgPSBjbGllbnQubWVzc2FnZXMuY3JlYXRlKHtcbiAgICAgIG1vZGVsLFxuICAgICAgbWF4X3Rva2VuczogNDAwLFxuICAgICAgdGVtcGVyYXR1cmU6IDAuMSxcbiAgICAgIHN5c3RlbTogVk9JQ0VfREFJTFlfTE9HX1NZU1RFTSxcbiAgICAgIG1lc3NhZ2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICByb2xlOiBcInVzZXJcIixcbiAgICAgICAgICBjb250ZW50OiBgVHJhbnNjcmlwdDpcXG5cIlwiXCIke3RyaW1tZWQuc2xpY2UoMCwgODAwMCl9XCJcIlwiYCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG4gICAgbGV0IHRpbWVvdXRJZDogUmV0dXJuVHlwZTx0eXBlb2Ygc2V0VGltZW91dD4gfCB1bmRlZmluZWQ7XG4gICAgY29uc3QgdGltZW91dFByb21pc2UgPSBuZXcgUHJvbWlzZTxuZXZlcj4oKF8sIHJlamVjdCkgPT4ge1xuICAgICAgdGltZW91dElkID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgIHJlamVjdChPYmplY3QuYXNzaWduKG5ldyBFcnJvcihcInZvaWNlX3BhcnNlX2xsbV9kZWFkbGluZVwiKSwgeyBuYW1lOiBcIlZvaWNlUGFyc2VMbG1EZWFkbGluZVwiIH0pKTtcbiAgICAgIH0sIGxsbURlYWRsaW5lTXMpO1xuICAgIH0pO1xuICAgIGxldCByZXNwb25zZTogQXdhaXRlZDx0eXBlb2YgY3JlYXRlUHJvbWlzZT47XG4gICAgdHJ5IHtcbiAgICAgIHJlc3BvbnNlID0gYXdhaXQgUHJvbWlzZS5yYWNlKFtjcmVhdGVQcm9taXNlLCB0aW1lb3V0UHJvbWlzZV0pO1xuICAgIH0gY2F0Y2ggKGVycikge1xuICAgICAgaWYgKGVyciBpbnN0YW5jZW9mIEVycm9yICYmIGVyci5uYW1lID09PSBcIlZvaWNlUGFyc2VMbG1EZWFkbGluZVwiKSB7XG4gICAgICAgIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwidm9pY2VfcGFyc2VfdGltZW91dFwiIH07XG4gICAgICB9XG4gICAgICB0aHJvdyBlcnI7XG4gICAgfSBmaW5hbGx5IHtcbiAgICAgIGlmICh0aW1lb3V0SWQpIGNsZWFyVGltZW91dCh0aW1lb3V0SWQpO1xuICAgIH1cbiAgICBjb25zdCB0ZXh0ID0gcmVzcG9uc2UuY29udGVudC5maW5kKChwKSA9PiBwLnR5cGUgPT09IFwidGV4dFwiKT8udGV4dDtcbiAgICBpZiAoIXRleHQpIHJldHVybiB7IG9rOiBmYWxzZSwgZXJyb3I6IFwibW9kZWxfZW1wdHlcIiB9O1xuICAgIGNvbnN0IGpzb25TdHIgPSBleHRyYWN0SnNvbk9iamVjdEZyb21ObFRleHQodGV4dCk7XG4gICAgaWYgKCFqc29uU3RyKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcInBhcnNlX2ZhaWxlZFwiIH07XG4gICAgbGV0IHBhcnNlZDogdW5rbm93bjtcbiAgICB0cnkge1xuICAgICAgcGFyc2VkID0gSlNPTi5wYXJzZShqc29uU3RyKSBhcyB1bmtub3duO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHsgb2s6IGZhbHNlLCBlcnJvcjogXCJwYXJzZV9mYWlsZWRcIiB9O1xuICAgIH1cbiAgICBjb25zdCBub3JtID0gbm9ybWFsaXplVm9pY2VEYWlseVBhcnNlUmVjb3JkKHBhcnNlZCk7XG4gICAgaWYgKCFub3JtKSByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcInBhcnNlX2ZhaWxlZFwiIH07XG4gICAgcmV0dXJuIHsgb2s6IHRydWUsIHBhcnNlZDogbm9ybSB9O1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4geyBvazogZmFsc2UsIGVycm9yOiBcInBhcnNlX2ZhaWxlZFwiIH07XG4gIH1cbn1cbiJdfQ==