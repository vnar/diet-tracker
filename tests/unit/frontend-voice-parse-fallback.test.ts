import { describe, expect, it } from "vitest";
import { voiceParseAwsFailureMayRetryWithNext } from "@/lib/frontend-api-client";

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
