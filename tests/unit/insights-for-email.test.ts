import { describe, expect, it } from "vitest";
import type { Insight } from "@/lib/insights/types";
import { attachInsightsForEmail, insightsToEmailSnapshot } from "@/lib/weeklyReport/insightsForEmail";
import { buildWeeklyAggregate } from "@/lib/weeklyReport/aggregate";
import { buildWeeklyReportFromRules } from "@/lib/weeklyReport/ruleEngine";
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

describe("insightsToEmailSnapshot", () => {
  it("maps top insights and caps count", () => {
    const rows: Insight[] = Array.from({ length: 8 }, (_, i) => ({
      id: `i${i}`,
      ruleId: "r",
      priority: i,
      headline: `H${i}`,
      action: `A${i}`,
      category: "streak",
      generationSource: i % 2 === 0 ? "llm" : "rules",
    }));
    const snap = insightsToEmailSnapshot(rows, 3);
    expect(snap).toHaveLength(3);
    expect(snap[0]!.headline).toBe("H0");
    expect(snap[0]!.source).toBe("llm");
    expect(snap[1]!.source).toBe("rules");
  });
});

describe("attachInsightsForEmail", () => {
  it("no-ops when lines empty", () => {
    const agg = buildWeeklyAggregate({
      weekEnd: "2026-05-10",
      entries: [e({ date: "2026-05-10", morningWeight: 70 })],
      settings: { unit: "kg", tone: "friendly" },
    });
    const doc = buildWeeklyReportFromRules(agg);
    expect(attachInsightsForEmail(doc, undefined)).toBe(doc);
    expect(attachInsightsForEmail(doc, [])).toBe(doc);
  });
});
