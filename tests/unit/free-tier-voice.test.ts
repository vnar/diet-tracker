import { describe, expect, it, beforeEach } from "vitest";
import {
  freeVoiceParseMonthlyLimit,
  getVoiceParsesUsedThisMonth,
  incrementVoiceParsesThisMonth,
  isVoiceParseOverFreeLimit,
  voiceParseMonthKey,
} from "@/lib/billing/freeTierUsage";

describe("freeTierUsage voice parses", () => {
  beforeEach(() => {
    if (typeof localStorage === "undefined") return;
    for (let i = localStorage.length - 1; i >= 0; i -= 1) {
      const k = localStorage.key(i);
      if (k?.startsWith("ojas_voice_parse_test-voice-user")) localStorage.removeItem(k);
    }
  });

  it("increments and reads month-scoped counter", () => {
    const uid = "test-voice-user-a";
    const d = new Date("2026-03-15T12:00:00Z");
    expect(voiceParseMonthKey(d)).toMatch(/^\d{4}-\d{2}$/);
    expect(getVoiceParsesUsedThisMonth(uid, d)).toBe(0);
    incrementVoiceParsesThisMonth(uid, d);
    expect(getVoiceParsesUsedThisMonth(uid, d)).toBe(1);
  });

  it("isVoiceParseOverFreeLimit respects limit", () => {
    const uid = "test-voice-user-b";
    const d = new Date("2026-05-10T12:00:00Z");
    const lim = freeVoiceParseMonthlyLimit();
    for (let i = 0; i < lim; i += 1) {
      incrementVoiceParsesThisMonth(uid, d);
    }
    expect(isVoiceParseOverFreeLimit(uid, d)).toBe(true);
  });
});
