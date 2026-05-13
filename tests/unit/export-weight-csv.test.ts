import { describe, expect, it } from "vitest";
import { dailyEntriesToWeightCsv } from "@/lib/exportWeightCsv";
import type { DailyEntry } from "@/lib/types";

function baseEntry(overrides: Partial<DailyEntry> = {}): DailyEntry {
  return {
    id: "1",
    date: "2026-01-10",
    morningWeight: 80,
    lateSnack: false,
    highSodium: false,
    workout: false,
    alcohol: false,
    ...overrides,
  };
}

describe("dailyEntriesToWeightCsv", () => {
  it("sorts by date ascending and includes UTF-8 BOM", () => {
    const csv = dailyEntriesToWeightCsv(
      [baseEntry({ id: "b", date: "2026-01-12", morningWeight: 79 }), baseEntry({ morningWeight: 81 })],
      "kg",
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const rows = csv.slice(1).split("\r\n");
    expect(rows[0]).toBe("date,morning_weight_kg,night_weight_kg,notes");
    expect(rows[1]).toContain("2026-01-10");
    expect(rows[2]).toContain("2026-01-12");
  });

  it("escapes commas and quotes in notes", () => {
    const csv = dailyEntriesToWeightCsv(
      [baseEntry({ notes: 'Said "hello", team", fasted' })],
      "kg",
    );
    expect(csv).toContain('"Said ""hello"", team"", fasted"');
  });

  it("converts to lbs column headers when unit is lbs", () => {
    const csv = dailyEntriesToWeightCsv([baseEntry({ morningWeight: 100 })], "lbs");
    expect(csv).toContain("morning_weight_lbs");
    expect(csv).toContain("220.5");
  });

  it("leaves night column empty when night weight is absent", () => {
    const csv = dailyEntriesToWeightCsv([baseEntry({ nightWeight: undefined })], "kg");
    const line = csv.split("\r\n")[1];
    expect(line).toMatch(/^2026-01-10,80\.0,,/);
  });
});
