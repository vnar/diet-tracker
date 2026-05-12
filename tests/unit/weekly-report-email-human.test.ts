import { describe, expect, it } from "vitest";
import { buildWeeklyAggregate } from "@/lib/weeklyReport/aggregate";
import { buildHumanEmailWeeklyBullets, formatWeekRangePretty, humanEmailLead } from "@/lib/weeklyReport/emailHumanCopy";
import { buildWeeklyReportEmailHtml } from "@/lib/weeklyReport/emailFormat";
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

describe("human weekly email copy", () => {
  it("formats same-month week range", () => {
    expect(formatWeekRangePretty("2026-05-04", "2026-05-10")).toMatch(/May 4–10, 2026/);
  });

  it("email HTML uses human headline and section titles even when tone is clinical", () => {
    const agg = buildWeeklyAggregate({
      weekEnd: "2026-05-10",
      entries: [
        e({ date: "2026-05-04", morningWeight: 80 }),
        e({ date: "2026-05-10", morningWeight: 78 }),
      ],
      settings: { unit: "kg", tone: "clinical" },
    });
    const doc = buildWeeklyReportFromRules(agg);
    const html = buildWeeklyReportEmailHtml(doc);
    expect(html).toContain("Your week, in plain language");
    expect(html).toContain("What stood out");
    expect(html).toContain("One thing to try next");
    expect(html).not.toContain("Weekly structured summary");
    expect(html).not.toContain("clinical tone");
    const lead = humanEmailLead(doc);
    expect(lead.tagline).toContain("2026");
    const bullets = buildHumanEmailWeeklyBullets(doc);
    expect(bullets.some((b) => /morning scale|Morning scale/i.test(b))).toBe(true);
  });
});
