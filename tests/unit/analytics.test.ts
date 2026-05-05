import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  __analyticsTestOnlyReset,
  __analyticsTestOnlySetAdapter,
  __analyticsTestOnlySetConfig,
  flushAnalyticsQueue,
  track,
} from "@/lib/analytics";

const initMock = vi.fn();
const captureMock = vi.fn();

describe("analytics", () => {
  beforeEach(() => {
    __analyticsTestOnlyReset();
    __analyticsTestOnlySetAdapter({
      init: initMock,
      capture: captureMock,
    });
    initMock.mockReset();
    captureMock.mockReset();
  });

  it("no-ops cleanly when no api key is present", async () => {
    track("dashboard_viewed", { path: "/" });
    await flushAnalyticsQueue();
    expect(initMock).not.toHaveBeenCalled();
    expect(captureMock).not.toHaveBeenCalled();
  });

  it("queues and flushes events when key exists", async () => {
    __analyticsTestOnlySetConfig({
      apiKey: "ph_test_key",
      host: "https://example-host",
    });
    track("dashboard_viewed", { path: "/" });
    track("day_saved", { source: "test" });
    await flushAnalyticsQueue();
    expect(initMock).toHaveBeenCalledTimes(1);
    expect(captureMock).toHaveBeenCalledTimes(2);
    expect(captureMock).toHaveBeenNthCalledWith(1, "dashboard_viewed", { path: "/" });
  });
});
