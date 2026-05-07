import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLATEAU_DETECTION,
  evaluatePlateau,
  minLogsRequiredForPlateau,
  plateauInsightFromEvaluation,
  resolvePlateauConfig,
} from "@/lib/insights/plateauDetection";

function row(date: string, kg: number) {
  return { date, morningWeight: kg };
}

describe("plateauDetection", () => {
  it("returns null when there are not enough logs for defaults", () => {
    const logs = Array.from({ length: 14 }).map((_, i) =>
      row(`2026-01-${String(i + 1).padStart(2, "0")}`, 80),
    );
    expect(evaluatePlateau(logs)).toBeNull();
    expect(minLogsRequiredForPlateau(DEFAULT_PLATEAU_DETECTION)).toBe(20);
  });

  it("detects plateau when rolling averages barely move", () => {
    const logs = Array.from({ length: 20 }).map((_, i) =>
      row(`2026-02-${String(i + 1).padStart(2, "0")}`, 80 + (i % 2) * 0.02),
    );
    const ev = evaluatePlateau(logs);
    expect(ev).not.toBeNull();
    expect(ev!.movementKg).toBeLessThan(DEFAULT_PLATEAU_DETECTION.maxAvgMovementKg);
  });

  it("returns null when trend is clearly down", () => {
    const logs = Array.from({ length: 20 }).map((_, i) =>
      row(`2026-03-${String(i + 1).padStart(2, "0")}`, 85 - i * 0.2),
    );
    expect(evaluatePlateau(logs)).toBeNull();
  });

  it("clamps invalid config to safe defaults", () => {
    const cfg = resolvePlateauConfig({
      rollingWindowDays: 999,
      comparisonSpanDays: 2,
      maxAvgMovementKg: -1,
    });
    expect(cfg.rollingWindowDays).toBe(DEFAULT_PLATEAU_DETECTION.rollingWindowDays);
    expect(cfg.comparisonSpanDays).toBeGreaterThanOrEqual(7);
    expect(cfg.maxAvgMovementKg).toBe(DEFAULT_PLATEAU_DETECTION.maxAvgMovementKg);
  });

  it("insight copy stays non-medical and avoids alarmist headline", () => {
    const ev = evaluatePlateau(
      Array.from({ length: 20 }).map((_, i) =>
        row(`2026-04-${String(i + 1).padStart(2, "0")}`, 80 + (i % 2) * 0.02),
      ),
    );
    expect(ev).not.toBeNull();
    const card = plateauInsightFromEvaluation(ev!);
    expect(card.headline.toLowerCase()).not.toContain("right now");
    expect(card.detail?.toLowerCase()).toMatch(/not a medical|pattern in your logs/);
    expect(card.why.join(" ")).toMatch(/about/);
  });
});
