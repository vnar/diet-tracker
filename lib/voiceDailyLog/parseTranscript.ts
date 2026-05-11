import { extractJsonObjectFromNlText } from "@/lib/meals/nlMealParseResult";
import { getAnthropicApiKeyForServer } from "@/lib/server/anthropic-api-key";
import { VOICE_DAILY_LOG_SYSTEM } from "@/lib/voiceDailyLog/prompt";
import { normalizeVoiceDailyParseRecord } from "@/lib/voiceDailyLog/normalizeParse";
import type { VoiceDailyParsedFields } from "@/lib/voiceDailyLog/types";

export type VoiceDailyParseResult =
  | { ok: true; parsed: VoiceDailyParsedFields }
  | { ok: false; error: "no_api_key" | "parse_failed" | "model_empty" };

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

  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey });
    const model = process.env.ANTHROPIC_VOICE_DAILY_MODEL ?? "claude-haiku-4-5";
    const response = await client.messages.create({
      model,
      max_tokens: 500,
      temperature: 0.1,
      system: VOICE_DAILY_LOG_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Transcript:\n"""${trimmed.slice(0, 8000)}"""`,
        },
      ],
    });
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
