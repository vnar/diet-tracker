import { describe, expect, it } from "vitest";
import { buildWeeklyAggregate } from "@/lib/weeklyReport/aggregate";
import { buildWeeklyReportFromRules } from "@/lib/weeklyReport/ruleEngine";
import { buildWeeklyReportEmailHtml, buildWeeklyReportEmailPlainText } from "@/lib/weeklyReport/emailFormat";
import type { DailyEntry } from "@/lib/types";

function e(p: Partial<DailyEntry> & Pick<DailyEntry, "date" | "morningWeight">): DailyEntry {
  return {
    id: `id-${p.date}`,
    lateSnack: false,
    highSodium: false,
    workout: false,
    alcohol: false,
    ...p,
  };
}

describe("buildWeeklyReportFromRules", () => {
  it("includes next experiment and sections", () => {
    const agg = buildWeeklyAggregate({
      weekEnd: "2026-05-10",
      entries: [
        e({ date: "2026-05-04", morningWeight: 80 }),
        e({ date: "2026-05-05", morningWeight: 79.5, steps: 6000, sleep: 7 }),
        e({ date: "2026-05-06", morningWeight: 79, workout: true }),
        e({ date: "2026-05-07", morningWeight: 79, workout: true }),
        e({ date: "2026-05-08", morningWeight: 78.8, workout: true }),
        e({ date: "2026-05-09", morningWeight: 78.5 }),
        e({ date: "2026-05-10", morningWeight: 78.2 }),
      ],
      settings: { unit: "kg", tone: "clinical" },
    });
    const doc = buildWeeklyReportFromRules(agg, "2026-05-11T12:00:00.000Z");
    expect(doc.generationSource).toBe("rules");
    expect(doc.sections.nextExperiment.title.length).toBeGreaterThan(3);
    expect(doc.sections.nextExperiment.description.length).toBeGreaterThan(10);
    expect(doc.sections.disclaimers).toEqual([]);
    expect(doc.sections.whatChanged.length).toBeGreaterThan(0);
  });

  it("email HTML includes compact highlights and next week block", () => {
    const agg = buildWeeklyAggregate({
      weekEnd: "2026-05-10",
      entries: [e({ date: "2026-05-10", morningWeight: 70 })],
      settings: { unit: "kg", tone: "friendly" },
    });
    const doc = buildWeeklyReportFromRules(agg);
    const html = buildWeeklyReportEmailHtml(doc);
    expect(html).toMatch(/<!DOCTYPE html>/i);
    expect(html).toContain("This week");
    expect(html).toContain(doc.sections.nextExperiment.title);
    const txt = buildWeeklyReportEmailPlainText(doc);
    expect(txt).toContain("This week");
    expect(txt).toContain("Next week");
  });

  it("email HTML includes AI insights block when attached", () => {
    const agg = buildWeeklyAggregate({
      weekEnd: "2026-05-10",
      entries: [e({ date: "2026-05-10", morningWeight: 70 })],
      settings: { unit: "kg", tone: "friendly" },
    });
    const doc = buildWeeklyReportFromRules(agg);
    const withAi = {
      ...doc,
      aiInsightsForEmail: [
        {
          headline: "Protein anchor",
          detail: "You logged protein on most days.",
          action: "Aim for 25g at breakfast.",
          source: "llm" as const,
        },
      ],
    };
    const html = buildWeeklyReportEmailHtml(withAi);
    expect(html).toContain("AI insights for you");
    expect(html).toContain("Protein anchor");
    expect(html).toContain("AI refined");
    const txt = buildWeeklyReportEmailPlainText(withAi);
    expect(txt).toContain("AI insights for you");
    expect(txt).toContain("Protein anchor");
  });
});
