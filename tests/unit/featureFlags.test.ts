import { beforeEach, describe, expect, it } from "vitest";
import {
  clearUserFlagOverrides,
  isEnabled,
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

  it("returns false for missing flag by default", () => {
    expect(isEnabled("FF_DOES_NOT_EXIST", "u1")).toBe(false);
  });
});
