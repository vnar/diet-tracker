import { describe, expect, it } from "vitest";
import { buildNormalizedHealthSnapshot } from "@/lib/aiNudges/normalize";
import { generateRuleBasedNudges } from "@/lib/aiNudges/ruleEngine";
import { buildPersonalizedCoachingPayload } from "@/lib/aiNudges/index";

function day(d: string, w: number, extras?: Partial<{ sleep: number; lateSnack: boolean; calories: number }>) {
  return {
    date: d,
    morningWeight: w,
    lateSnack: extras?.lateSnack ?? false,
    highSodium: false,
    workout: false,
    alcohol: false,
    sleep: extras?.sleep,
    calories: extras?.calories,
  };
}

describe("generateRuleBasedNudges", () => {
  it("returns empty when fewer than 5 valid weight days", () => {
    const snap = buildNormalizedHealthSnapshot({
      asOfDate: "2026-05-01",
      entriesRaw: [day("2026-04-28", 80), day("2026-04-29", 79.9)],
      goalWeight: 70,
      startWeight: 85,
      targetDate: "2026-08-01",
    });
    expect(generateRuleBasedNudges(snap, "2026-05-01T12:00:00.000Z")).toEqual([]);
  });

  it("emits plateau-style nudge when weight is flat for two weeks", () => {
    const start = new Date("2026-04-18T12:00:00Z");
    const weights = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(start);
      d.setUTCDate(d.getUTCDate() + i);
      return day(d.toISOString().slice(0, 10), 80.05);
    });
    const snap = buildNormalizedHealthSnapshot({
      asOfDate: "2026-05-01",
      entriesRaw: weights,
      goalWeight: 70,
      startWeight: 85,
      targetDate: "2026-08-01",
    });
    const nudges = generateRuleBasedNudges(snap, "2026-05-01T12:00:00.000Z");
    expect(nudges.some((n) => n.category === "plateau")).toBe(true);
  });
});

describe("buildPersonalizedCoachingPayload", () => {
  it("gates nudges when subscription is not active paid", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      day(`2026-04-${String(22 + i).padStart(2, "0")}`, 84 - i * 0.15),
    );
    const out = buildPersonalizedCoachingPayload({
      entriesRaw: entries,
      goalWeight: 70,
      startWeight: 90,
      targetDate: "2026-09-01",
      asOfDate: "2026-05-01",
      plan: "free",
      subscriptionStatus: "inactive",
    });
    expect(out.gated).toBe(true);
    expect(out.nudges).toHaveLength(0);
    expect(out.coachTone).toBe("friendly");
  });

  it("returns nudges for active paid plan with enough data", () => {
    const entries = Array.from({ length: 10 }, (_, i) =>
      day(`2026-04-${String(22 + i).padStart(2, "0")}`, 84 - i * 0.15),
    );
    const out = buildPersonalizedCoachingPayload({
      entriesRaw: entries,
      goalWeight: 70,
      startWeight: 90,
      targetDate: "2026-09-01",
      asOfDate: "2026-05-01",
      plan: "pro_monthly",
      subscriptionStatus: "active",
    });
    expect(out.gated).toBe(false);
    expect(out.nudges.length).toBeGreaterThan(0);
    expect(out.coachTone).toBe("friendly");
  });

  it("applies clinical templates to plateau nudge title", () => {
    const weights = Array.from({ length: 14 }, (_, i) =>
      day(`2026-04-${String(18 + i).padStart(2, "0")}`, 80.05),
    );
    const out = buildPersonalizedCoachingPayload({
      entriesRaw: weights,
      goalWeight: 70,
      startWeight: 85,
      targetDate: "2026-08-01",
      asOfDate: "2026-05-01",
      plan: "pro_monthly",
      subscriptionStatus: "active",
      coachTone: "clinical",
    });
    const plateau = out.nudges.find((n) => n.category === "plateau");
    expect(plateau?.title).toContain("Plateau");
  });
});
