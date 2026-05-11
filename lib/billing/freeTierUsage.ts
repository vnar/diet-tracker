/** Client-only soft cap for voice parses when Pro monetization is on and user is Free. */

const DEFAULT_FREE_VOICE_PARSES_PER_MONTH = 10;

export function voiceParseMonthKey(d = new Date()): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function freeVoiceParseMonthlyLimit(): number {
  const raw = process.env.NEXT_PUBLIC_FREE_VOICE_PARSES_PER_MONTH;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_FREE_VOICE_PARSES_PER_MONTH;
}

export function getVoiceParsesUsedThisMonth(userId: string, d = new Date()): number {
  if (typeof window === "undefined") return 0;
  const key = `ojas_voice_parse_${userId}_${voiceParseMonthKey(d)}`;
  const raw = window.localStorage.getItem(key);
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export function incrementVoiceParsesThisMonth(userId: string, d = new Date()): number {
  if (typeof window === "undefined") return 0;
  const key = `ojas_voice_parse_${userId}_${voiceParseMonthKey(d)}`;
  const next = getVoiceParsesUsedThisMonth(userId, d) + 1;
  window.localStorage.setItem(key, String(next));
  return next;
}

export function isVoiceParseOverFreeLimit(userId: string | undefined, d = new Date()): boolean {
  if (!userId) return false;
  return getVoiceParsesUsedThisMonth(userId, d) >= freeVoiceParseMonthlyLimit();
}
