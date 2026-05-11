import type { VoiceDailyParsedFields } from "./types";
/**
 * Normalize LLM JSON object into strict VoiceDailyParsedFields.
 * Accepts snake_case keys from the model contract.
 */
export declare function normalizeVoiceDailyParseRecord(raw: unknown): VoiceDailyParsedFields | null;
