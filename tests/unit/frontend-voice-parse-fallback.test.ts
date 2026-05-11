import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isVoiceParseNextOriginFallbackAllowed,
  voiceParseAwsFailureMayRetryWithNext,
} from "@/lib/frontend-api-client";

describe("voiceParseAwsFailureMayRetryWithNext", () => {
  it("returns true for transport / missing-route style errors", () => {
    expect(voiceParseAwsFailureMayRetryWithNext("Couldn't reach the server. Check VPN.")).toBe(true);
    expect(voiceParseAwsFailureMayRetryWithNext("Couldn’t reach the server.")).toBe(true);
    expect(voiceParseAwsFailureMayRetryWithNext("Request timed out. Please try again.")).toBe(true);
    expect(voiceParseAwsFailureMayRetryWithNext("Request failed (404)")).toBe(true);
    expect(voiceParseAwsFailureMayRetryWithNext("Request failed (403)")).toBe(true);
    expect(voiceParseAwsFailureMayRetryWithNext("Request failed (502)")).toBe(true);
  });

  it("returns false for auth / parse body errors", () => {
    expect(voiceParseAwsFailureMayRetryWithNext("Unauthorized")).toBe(false);
    expect(voiceParseAwsFailureMayRetryWithNext("transcript required")).toBe(false);
    expect(voiceParseAwsFailureMayRetryWithNext("parse_failed")).toBe(false);
  });
});

describe("isVoiceParseNextOriginFallbackAllowed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is true on localhost and 127.0.0.1", () => {
    vi.stubGlobal("window", { location: { hostname: "localhost" } });
    expect(isVoiceParseNextOriginFallbackAllowed()).toBe(true);
    vi.stubGlobal("window", { location: { hostname: "127.0.0.1" } });
    expect(isVoiceParseNextOriginFallbackAllowed()).toBe(true);
  });

  it("is false on production-style hosts", () => {
    vi.stubGlobal("window", { location: { hostname: "main.d123abcdef.amplifyapp.com" } });
    expect(isVoiceParseNextOriginFallbackAllowed()).toBe(false);
    vi.stubGlobal("window", { location: { hostname: "ojas-health.com" } });
    expect(isVoiceParseNextOriginFallbackAllowed()).toBe(false);
  });
});
