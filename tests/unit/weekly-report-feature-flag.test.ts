import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearUserFlagOverrides,
  isWeeklyReportEmailSendEnabled,
  isWeeklyReportEnabled,
  setUserFlagOverrides,
} from "@/lib/featureFlags";

describe("isWeeklyReportEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearUserFlagOverrides();
  });

  it("defaults false when env unset", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_WEEKLY_REPORT", "");
    expect(isWeeklyReportEnabled()).toBe(false);
  });

  it("reads NEXT_PUBLIC_FF_WEEKLY_REPORT=true", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_WEEKLY_REPORT", "true");
    expect(isWeeklyReportEnabled()).toBe(true);
  });

  it("respects per-user override", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_WEEKLY_REPORT", "");
    setUserFlagOverrides("user-1", { FF_WEEKLY_REPORT: true });
    expect(isWeeklyReportEnabled("user-1")).toBe(true);
    expect(isWeeklyReportEnabled("user-2")).toBe(false);
  });
});

describe("isWeeklyReportEmailSendEnabled", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    clearUserFlagOverrides();
  });

  it("defaults false when env unset", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_WEEKLY_REPORT_EMAIL", "");
    expect(isWeeklyReportEmailSendEnabled()).toBe(false);
  });

  it("reads NEXT_PUBLIC_FF_WEEKLY_REPORT_EMAIL=true", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_WEEKLY_REPORT_EMAIL", "true");
    expect(isWeeklyReportEmailSendEnabled()).toBe(true);
  });

  it("respects per-user override", () => {
    vi.stubEnv("NEXT_PUBLIC_FF_WEEKLY_REPORT_EMAIL", "");
    setUserFlagOverrides("u1", { FF_WEEKLY_REPORT_EMAIL: true });
    expect(isWeeklyReportEmailSendEnabled("u1")).toBe(true);
  });
});
