import { describe, expect, it } from "vitest";
import { compactWeeklyBulletLines } from "@/lib/weeklyReport/compactBullets";
import type { WeeklyReportDocument } from "@/lib/weeklyReport/types";

describe("compactWeeklyBulletLines", () => {
  it("merges sections, caps length, and appends try-next when there is room", () => {
    const doc = {
      generatedAt: "2026-01-01T00:00:00Z",
      generationSource: "rules",
      aggregate: {} as WeeklyReportDocument["aggregate"],
      sections: {
        title: "Week",
        subtitle: "sub",
        whatChanged: ["One", "Two", "Three", "Four"],
        whatHelped: ["Five"],
        whatHarder: ["Six"],
        nextExperiment: {
          kind: "daily_logging",
          title: "Keep logging",
          description: "desc",
        },
        disclaimers: [],
      },
    } satisfies WeeklyReportDocument;

    expect(compactWeeklyBulletLines(doc, 3)).toEqual(["One", "Two", "Three"]);
    expect(compactWeeklyBulletLines(doc, 7)).toContain("Try next: Keep logging");
  });
});
