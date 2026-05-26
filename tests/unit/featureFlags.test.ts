import { beforeEach, describe, expect, it } from "vitest";
import {
  clearUserFlagOverrides,
  isDailyReadinessScoreEnabled,
  isCareCircleTeaserEnabled,
  isEnabled,
  isInsightsSourceLabelEnabled,
  isPersonalizedAiCoachingEnabled,
  isProMonetizationEnabled,
  isVoiceDailyLoggingEnabled,
  isWeightCsvExportEnabled,
  isWeightLogStreakEnabled,
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

describe("voice daily logging flag", () => {
  beforeEach(() => {
    delete process.env.FF_VOICE_DAILY_LOGGING;
    delete process.env.NEXT_PUBLIC_FF_VOICE_DAILY_LOGGING;
    clearUserFlagOverrides();
  });

  it("defaults to true when env unset", () => {
    expect(isVoiceDailyLoggingEnabled()).toBe(true);
    expect(isVoiceDailyLoggingEnabled("u-voice")).toBe(true);
  });

  it("respects explicit env false (opt-out)", () => {
    process.env.FF_VOICE_DAILY_LOGGING = "false";
    expect(isVoiceDailyLoggingEnabled()).toBe(false);
  });

  it("allows per-user override off", () => {
    setUserFlagOverrides("u1", { FF_VOICE_DAILY_LOGGING: false });
    expect(isVoiceDailyLoggingEnabled("u1")).toBe(false);
  });
});

describe("roadmapEval: working vs teaser defaults", () => {
  beforeEach(() => {
    delete process.env.FF_WEIGHT_LOG_STREAK;
    delete process.env.NEXT_PUBLIC_FF_WEIGHT_LOG_STREAK;
    delete process.env.FF_CARE_CIRCLE_TEASER;
    delete process.env.NEXT_PUBLIC_FF_CARE_CIRCLE_TEASER;
    delete process.env.FF_DAILY_READINESS_SCORE;
    delete process.env.NEXT_PUBLIC_FF_DAILY_READINESS_SCORE;
    clearUserFlagOverrides();
  });

  it("enables working roadmap flags when env unset", () => {
    expect(isWeightLogStreakEnabled("u1")).toBe(true);
  });

  it("enables teaser roadmap flags when env unset", () => {
    expect(isCareCircleTeaserEnabled("u1")).toBe(true);
  });

  it("enables readiness score when env unset", () => {
    expect(isDailyReadinessScoreEnabled("u1")).toBe(true);
  });
});

describe("defaults on when unset (CSV export)", () => {
  beforeEach(() => {
    delete process.env.FF_WEIGHT_CSV_EXPORT;
    delete process.env.NEXT_PUBLIC_FF_WEIGHT_CSV_EXPORT;
    delete process.env.FF_PRO_MONETIZATION;
    delete process.env.NEXT_PUBLIC_FF_PRO_MONETIZATION;
    clearUserFlagOverrides();
  });

  it("enables CSV export and Pro monetization when env unset", () => {
    expect(isWeightCsvExportEnabled("u-road")).toBe(true);
    expect(isProMonetizationEnabled("u-road")).toBe(true);
  });

  it("respects explicit env false for CSV and Pro", () => {
    process.env.NEXT_PUBLIC_FF_WEIGHT_CSV_EXPORT = "false";
    process.env.FF_PRO_MONETIZATION = "false";
    expect(isWeightCsvExportEnabled()).toBe(false);
    expect(isProMonetizationEnabled()).toBe(false);
  });

  it("enables Pro monetization when env is explicitly true", () => {
    process.env.NEXT_PUBLIC_FF_PRO_MONETIZATION = "true";
    expect(isProMonetizationEnabled("u-road")).toBe(true);
  });
});
