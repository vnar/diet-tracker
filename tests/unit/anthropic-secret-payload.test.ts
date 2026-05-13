import { describe, expect, it } from "vitest";
import { normalizeAnthropicSecretPayload } from "@/lib/anthropic/secretPayload";

describe("normalizeAnthropicSecretPayload", () => {
  it("returns plain key unchanged", () => {
    expect(normalizeAnthropicSecretPayload("  sk-ant-api03-abc  ")).toBe("sk-ant-api03-abc");
  });

  it("unwraps JSON apiKey", () => {
    expect(normalizeAnthropicSecretPayload('{"apiKey":"sk-ant-test"}')).toBe("sk-ant-test");
  });
});
