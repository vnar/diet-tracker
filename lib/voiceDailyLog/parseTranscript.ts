import { extractJsonObjectFromNlText } from "../meals/nlMealParseResult";
import { getAnthropicApiKeyForServer } from "../server/anthropic-api-key";
import { VOICE_DAILY_LOG_SYSTEM } from "./prompt";
import { normalizeVoiceDailyParseRecord } from "./normalizeParse";
import type { VoiceDailyParsedFields } from "./types";

export type VoiceDailyParseResult =
  | { ok: true; parsed: VoiceDailyParsedFields }
  | {
      ok: false;
      error: "no_api_key" | "parse_failed" | "model_empty" | "voice_parse_timeout";
    };

/**
 * Server-only: call Anthropic to parse transcript into structured fields.
 */
export async function parseVoiceDailyTranscriptWithAnthropic(
  transcript: string,
): Promise<VoiceDailyParseResult> {
  const apiKey = getAnthropicApiKeyForServer();
  if (!apiKey) return { ok: false, error: "no_api_key" };

  const trimmed = transcript.trim();
  if (trimmed.length < 2) return { ok: false, error: "parse_failed" };

  /** HTTP API → Lambda integration is capped (~30s); stay well under so the client gets JSON, not a dropped connection. */
  const llmDeadlineMs = Math.min(
    26_000,
    Math.max(8_000, Number(process.env.VOICE_PARSE_LLM_DEADLINE_MS ?? "22000") || 22_000),
  );

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });
    const model = process.env.ANTHROPIC_VOICE_DAILY_MODEL ?? "claude-haiku-4-5";
    const createPromise = client.messages.create({
      model,
      max_tokens: 400,
      temperature: 0.1,
      system: VOICE_DAILY_LOG_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Transcript:\n"""${trimmed.slice(0, 8000)}"""`,
        },
      ],
    });
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        reject(Object.assign(new Error("voice_parse_llm_deadline"), { name: "VoiceParseLlmDeadline" }));
      }, llmDeadlineMs);
    });
    let response: Awaited<typeof createPromise>;
    try {
      response = await Promise.race([createPromise, timeoutPromise]);
    } catch (err) {
      if (err instanceof Error && err.name === "VoiceParseLlmDeadline") {
        return { ok: false, error: "voice_parse_timeout" };
      }
      throw err;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
    const text = response.content.find((p) => p.type === "text")?.text;
    if (!text) return { ok: false, error: "model_empty" };
    const jsonStr = extractJsonObjectFromNlText(text);
    if (!jsonStr) return { ok: false, error: "parse_failed" };
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonStr) as unknown;
    } catch {
      return { ok: false, error: "parse_failed" };
    }
    const norm = normalizeVoiceDailyParseRecord(parsed);
    if (!norm) return { ok: false, error: "parse_failed" };
    return { ok: true, parsed: norm };
  } catch {
    return { ok: false, error: "parse_failed" };
  }
}
