/**
 * Opt-in: writes public/email-previews/weekly-report-sample-vihar-nar.html
 * Run: GEN_EMAIL_PREVIEW=1 npm run gen:weekly-email-preview
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { buildWeeklyAggregate } from "@/lib/weeklyReport/aggregate";
import { buildWeeklyReportEmailHtml } from "@/lib/weeklyReport/emailFormat";
import { buildWeeklyReportFromRules } from "@/lib/weeklyReport/ruleEngine";
import type { DailyEntry } from "@/lib/types";

function e(p: Partial<DailyEntry> & Pick<DailyEntry, "date" | "morningWeight">): DailyEntry {
  return {
    id: `id-${p.date}`,
    lateSnack: p.lateSnack ?? false,
    highSodium: p.highSodium ?? false,
    workout: p.workout ?? false,
    alcohol: p.alcohol ?? false,
    ...p,
  };
}

describe("weekly report email preview generator", () => {
  it.skipIf(process.env.GEN_EMAIL_PREVIEW !== "1")(
    "writes public/email-previews/weekly-report-sample-vihar-nar.html",
    () => {
      const sampleEntries: DailyEntry[] = [
        e({
          date: "2026-05-04",
          morningWeight: 82.2,
          steps: 7200,
          sleep: 6.5,
          workout: true,
          calories: 2100,
          protein: 120,
        }),
        e({ date: "2026-05-05", morningWeight: 82.0, steps: 8100, sleep: 7.0 }),
        e({ date: "2026-05-06", morningWeight: 81.8, steps: 6500, sleep: 7.2, lateSnack: true, workout: true }),
        e({ date: "2026-05-07", morningWeight: 81.9, steps: 5400, sleep: 6.2, alcohol: true }),
        e({
          date: "2026-05-08",
          morningWeight: 81.5,
          steps: 9000,
          sleep: 7.5,
          workout: true,
          notes: "Felt tired; adjusting prescription timing with doctor next week.",
        }),
        e({ date: "2026-05-09", morningWeight: 81.4, steps: 7800, sleep: 7.0 }),
        e({ date: "2026-05-10", morningWeight: 81.2, steps: 6200, sleep: 6.8, workout: true }),
      ];

      const agg = buildWeeklyAggregate({
        weekEnd: "2026-05-10",
        entries: sampleEntries,
        mealsByDay: {
          "2026-05-04": [
            { kcal: 420, proteinG: 28 },
            { kcal: 380, proteinG: 22 },
          ],
          "2026-05-06": [{ kcal: 510, proteinG: 18 }],
        },
        photos: [{ photoId: "p1", userId: "u", date: "2026-05-08", createdAt: "2026-05-08T10:00:00Z" }],
        settings: { unit: "kg", tone: "friendly" },
      });

      const doc = buildWeeklyReportFromRules(agg, "2026-05-11T16:30:00.000Z");
      const inner = buildWeeklyReportEmailHtml(doc);
      const banner = `
  <div style="max-width:560px;margin:0 auto 16px;padding:12px 16px;background:#ecfdf5;border:1px solid #a7f3d0;border-radius:10px;font-size:13px;color:#065f46;">
    <strong>Sample email preview</strong> for <strong>Vihar Nar</strong> (viharnar@gmail.com) — not sent from Ojas-Health.
    Open in a browser; in production use the app&apos;s <strong>Email-ready export</strong> for your own logs.
  </div>
`;
      const patched = inner.replace(/<body([^>]*)>/, `<body$1>${banner}`);

      const root = join(dirname(fileURLToPath(import.meta.url)), "..");
      const outDir = join(root, "public", "email-previews");
      const outFile = join(outDir, "weekly-report-sample-vihar-nar.html");
      mkdirSync(outDir, { recursive: true });
      writeFileSync(outFile, patched, "utf-8");
      expect(patched).toContain("What changed");
    },
  );
});
