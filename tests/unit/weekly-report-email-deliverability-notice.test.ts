import { describe, expect, it } from "vitest";
import { buildWeeklyReportEmailHtml, buildWeeklyReportEmailPlainText } from "@/lib/weeklyReport/emailFormat";
import type { WeeklyReportDocument } from "@/lib/weeklyReport/types";

/** Minimal doc for MIME builders (avoids pulling aggregate.js in Vitest). */
function minimalWeeklyDoc(): WeeklyReportDocument {
  return {
    generatedAt: "2026-05-11T12:00:00.000Z",
    generationSource: "rules",
    aggregate: {
      weekStart: "2026-05-04",
      weekEnd: "2026-05-10",
      unit: "kg",
      tone: "friendly",
      days: [],
      weighInDays: 1,
      checkInDays: 1,
      mealEntriesTotal: 0,
      sumCaloriesManual: 0,
      sumProteinManualG: 0,
      sumMealKcal: 0,
      sumMealProteinG: 0,
      avgSteps: null,
      avgSleep: null,
      habitCounts: { lateSnack: 0, highSodium: 0, workout: 0, alcohol: 0 },
      weightFirst: 70,
      weightLast: 69,
      weightDelta: -1,
      progressPhotosInWeek: 0,
      notesMedicationKeywordHits: 0,
    },
    sections: {
      title: "Weekly",
      subtitle: "Sub",
      whatChanged: ["Logged weight most days."],
      whatHelped: ["Consistent mornings."],
      whatHarder: ["Weekends busy."],
      nextExperiment: {
        kind: "daily_logging",
        title: "Keep logging",
        description: "One line you can try next week without pressure.",
      },
      disclaimers: [],
    },
  };
}

describe("weekly report email deliverability notice", () => {
  it("omits notice block when options unset (preview / tests)", () => {
    const doc = minimalWeeklyDoc();
    const html = buildWeeklyReportEmailHtml(doc);
    expect(html).not.toContain("Why you received this");
    const txt = buildWeeklyReportEmailPlainText(doc);
    expect(txt).not.toContain("Why you received this");
  });

  it("includes user-initiated notice in HTML and plain text", () => {
    const doc = minimalWeeklyDoc();
    const html = buildWeeklyReportEmailHtml(doc, { deliverabilityNotice: "userTapSend" });
    expect(html).toContain("Why you received this");
    expect(html).toContain("Send to my inbox");
    expect(html).toContain("https://ojas-health.com/");
    const txt = buildWeeklyReportEmailPlainText(doc, { deliverabilityNotice: "userTapSend" });
    expect(txt.startsWith("Why you received this")).toBe(true);
    expect(txt).toContain("Send to my inbox");
  });

  it("includes scheduled digest notice", () => {
    const doc = minimalWeeklyDoc();
    const html = buildWeeklyReportEmailHtml(doc, { deliverabilityNotice: "scheduledDigest" });
    expect(html).toContain("settings");
    const txt = buildWeeklyReportEmailPlainText(doc, { deliverabilityNotice: "scheduledDigest" });
    expect(txt).toContain("opted in");
  });
});
