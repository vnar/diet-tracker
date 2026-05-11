import { afterEach, describe, expect, it } from "vitest";
import { getAnthropicApiKeyForServer } from "@/lib/server/anthropic-api-key";

describe("getAnthropicApiKeyForServer", () => {
  const prev = process.env.ANTHROPIC_API_KEY;
  const prevNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    if (prev === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prev;
    process.env.NODE_ENV = prevNodeEnv;
  });

  it("returns trimmed ANTHROPIC_API_KEY when set", () => {
    process.env.ANTHROPIC_API_KEY = "  sk-test  ";
    expect(getAnthropicApiKeyForServer()).toBe("sk-test");
  });

  it("returns undefined when env empty in production", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ANTHROPIC_API_KEY;
    expect(getAnthropicApiKeyForServer()).toBeUndefined();
  });
});
