import { afterEach, describe, expect, it } from "vitest";
import { assertAnthropicApiKeyForCdk } from "../../infra/cdk/lib/assertAnthropicApiKeyForCdk";

describe("assertAnthropicApiKeyForCdk", () => {
  const prevKey = process.env.ANTHROPIC_API_KEY;
  const prevAllow = process.env.CDK_ALLOW_MISSING_ANTHROPIC_API_KEY;

  afterEach(() => {
    if (prevKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = prevKey;
    if (prevAllow === undefined) delete process.env.CDK_ALLOW_MISSING_ANTHROPIC_API_KEY;
    else process.env.CDK_ALLOW_MISSING_ANTHROPIC_API_KEY = prevAllow;
  });

  it("throws when key is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.CDK_ALLOW_MISSING_ANTHROPIC_API_KEY;
    expect(() => assertAnthropicApiKeyForCdk()).toThrow(/ANTHROPIC_API_KEY is required/);
  });

  it("throws on placeholder", () => {
    process.env.ANTHROPIC_API_KEY = "your-anthropic-api-key-here";
    delete process.env.CDK_ALLOW_MISSING_ANTHROPIC_API_KEY;
    expect(() => assertAnthropicApiKeyForCdk()).toThrow(/placeholder/);
  });

  it("passes when key is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-test-key-for-unit-tests-only";
    delete process.env.CDK_ALLOW_MISSING_ANTHROPIC_API_KEY;
    expect(() => assertAnthropicApiKeyForCdk()).not.toThrow();
  });

  it("skips when CDK_ALLOW_MISSING_ANTHROPIC_API_KEY=true", () => {
    delete process.env.ANTHROPIC_API_KEY;
    process.env.CDK_ALLOW_MISSING_ANTHROPIC_API_KEY = "true";
    expect(() => assertAnthropicApiKeyForCdk()).not.toThrow();
  });
});
