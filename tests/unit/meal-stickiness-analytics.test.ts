import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __analyticsTestOnlyReset,
  __analyticsTestOnlySetAdapter,
  __analyticsTestOnlySetConfig,
  flushAnalyticsQueue,
} from "@/lib/analytics";
import { trackMealStickiness } from "@/lib/mealStickinessAnalytics";

const initMock = vi.fn();
const captureMock = vi.fn();

describe("mealStickinessAnalytics", () => {
  beforeEach(() => {
    __analyticsTestOnlyReset();
    __analyticsTestOnlySetAdapter({
      init: initMock,
      capture: captureMock,
    });
    initMock.mockReset();
    captureMock.mockReset();
  });

  it("does not capture when PostHog key is absent", async () => {
    trackMealStickiness({
      action: "reuse_logged",
      day: "2026-05-07",
      mealId: "m1",
      entryId: "e1",
      source: "sheet",
    });
    await flushAnalyticsQueue();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("captures meal_stickiness when PostHog key present", async () => {
    __analyticsTestOnlySetConfig({ apiKey: "ph_test", host: "https://h" });
    trackMealStickiness({
      action: "reuse_logged",
      day: "2026-05-07",
      mealId: "m1",
      entryId: "e1",
      source: "carousel",
    });
    await flushAnalyticsQueue();
    expect(captureMock).toHaveBeenCalledWith("meal_stickiness", {
      action: "reuse_logged",
      day: "2026-05-07",
      mealId: "m1",
      entryId: "e1",
      source: "carousel",
    });
  });
});
