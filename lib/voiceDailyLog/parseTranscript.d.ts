import type { VoiceDailyParsedFields } from "./types";
export type VoiceDailyParseResult = {
    ok: true;
    parsed: VoiceDailyParsedFields;
} | {
    ok: false;
    error: "no_api_key" | "parse_failed" | "model_empty" | "voice_parse_timeout";
};
/**
 * Server-only: call Anthropic to parse transcript into structured fields.
 */
export declare function parseVoiceDailyTranscriptWithAnthropic(transcript: string): Promise<VoiceDailyParseResult>;
