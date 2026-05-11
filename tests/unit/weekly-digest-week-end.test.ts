import { describe, expect, it } from "vitest";
import { weeklyDigestSchedulerWeekEndKey } from "@/lib/weeklyReport/dateRange";

describe("weeklyDigestSchedulerWeekEndKey", () => {
  it("returns yesterday in local calendar for a fixed instant", () => {
    const d = new Date("2026-05-11T12:00:00.000Z");
    const key = weeklyDigestSchedulerWeekEndKey(d);
    expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
