import { beforeEach, describe, expect, it } from "vitest";
import {
  clearUserFlagOverrides,
  isEnabled,
  isInsightsSourceLabelEnabled,
  isPersonalizedAiCoachingEnabled,
  setUserFlagOverrides,
} from "@/lib/featureFlags";

describe("feature flag evaluation", () => {
  beforeEach(() => {
    delete process.env.FF_INSIGHTS_V2;
    delete process.env.NEXT_PUBLIC_FF_INSIGHTS_V2;
    clearUserFlagOverrides();
  });

  it("returns env-driven value when no user override exists", () => {
    process.env.FF_INSIGHTS_V2 = "true";
    expect(isEnabled("FF_INSIGHTS_V2")).toBe(true);
    expect(isEnabled("INSIGHTS_V2")).toBe(true);
  });

  it("uses override-on for a specific user", () => {
    process.env.FF_INSIGHTS_V2 = "false";
    setUserFlagOverrides("u1", { FF_INSIGHTS_V2: true });
    expect(isEnabled("FF_INSIGHTS_V2", "u1")).toBe(true);
  });

  it("uses override-off for a specific user", () => {
    process.env.FF_INSIGHTS_V2 = "true";
    setUserFlagOverrides("u1", { FF_INSIGHTS_V2: false });
    expect(isEnabled("FF_INSIGHTS_V2", "u1")).toBe(false);
  });

  it("returns true for missing flag when no env (test-portal default)", () => {
    expect(isEnabled("FF_DOES_NOT_EXIST", "u1")).toBe(true);
  });
});

describe("insights source label flag", () => {
  beforeEach(() => {
    delete process.env.FF_INSIGHTS_SOURCE_LABEL;
    delete process.env.NEXT_PUBLIC_FF_INSIGHTS_SOURCE_LABEL;
    delete process.env.NEXT_PUBLIC_INSIGHTS_SOURCE_LABEL;
    clearUserFlagOverrides();
  });

  it("defaults to true when unset", () => {
    expect(isInsightsSourceLabelEnabled()).toBe(true);
  });

  it("respects explicit false", () => {
    process.env.FF_INSIGHTS_SOURCE_LABEL = "false";
    expect(isInsightsSourceLabelEnabled()).toBe(false);
  });
});

describe("personalized AI coaching flag", () => {
  beforeEach(() => {
    delete process.env.FF_PERSONALIZED_AI_COACHING;
    delete process.env.NEXT_PUBLIC_FF_PERSONALIZED_AI_COACHING;
    clearUserFlagOverrides();
  });

  it("defaults to true when unset (opt-out)", () => {
    expect(isPersonalizedAiCoachingEnabled()).toBe(true);
  });

  it("respects explicit false", () => {
    process.env.FF_PERSONALIZED_AI_COACHING = "false";
    expect(isPersonalizedAiCoachingEnabled()).toBe(false);
  });
});
