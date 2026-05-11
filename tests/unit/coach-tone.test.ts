import { describe, expect, it } from "vitest";
import {
  applyCoachToneToAiNudge,
  applyCoachToneToInsight,
  normalizeCoachTone,
  parseCoachToneInput,
  weeklyEnergyCoachLine,
} from "@/lib/coachTone";
import type { AiNudge } from "@/lib/aiNudges/types";
import type { Insight } from "@/lib/insights/types";

describe("normalizeCoachTone / parseCoachToneInput", () => {
  it("normalizes unknown to friendly", () => {
    expect(normalizeCoachTone(undefined)).toBe("friendly");
    expect(normalizeCoachTone("weird")).toBe("friendly");
  });

  it("parses tough_love alias", () => {
    expect(parseCoachToneInput("tough_love")).toBe("tough-love");
  });
});

describe("applyCoachToneToAiNudge", () => {
  it("restyles plateau nudge for clinical without changing evidence", () => {
    const base: AiNudge = {
      id: "n1",
      title: "Weight has been unusually flat",
      message: "Friendly default body.",
      confidence: 0.8,
      supportingEvidence: ["Fact A", "Fact B"],
      category: "plateau",
      createdAt: "2026-01-01T00:00:00.000Z",
      source: "rules",
    };
    const out = applyCoachToneToAiNudge(base, "clinical");
    expect(out.title).toContain("Plateau");
    expect(out.supportingEvidence).toEqual(base.supportingEvidence);
  });

  it("preserves goal_progress message body when changing tone", () => {
    const base: AiNudge = {
      id: "g1",
      title: "Goal progress from your start weight",
      message: "You have logged roughly 42% of the weight change from your start toward your stated goal — computed only from weights you saved.",
      confidence: 0.9,
      supportingEvidence: ["Line 1"],
      category: "goal_progress",
      createdAt: "2026-01-01T00:00:00.000Z",
      source: "rules",
    };
    const out = applyCoachToneToAiNudge(base, "clinical");
    expect(out.message).toBe(base.message);
    expect(out.title).not.toBe(base.title);
  });
});

describe("applyCoachToneToInsight", () => {
  it("restyles plateau insight headline for clinical", () => {
    const ins: Insight = {
      id: "p1",
      ruleId: "plateau",
      priority: 90,
      headline: "Your weight trend has been fairly steady lately.",
      detail: "Original detail",
      why: ["w1", "w2"],
      action: "act",
      category: "plateau",
      generationSource: "rules",
    };
    const out = applyCoachToneToInsight(ins, "clinical");
    expect(out.headline).toContain("Rolling average");
    expect(out.why).toEqual(ins.why);
  });
});

describe("weeklyEnergyCoachLine", () => {
  it("includes factual net for clinical", () => {
    const s = weeklyEnergyCoachLine("deficit", -320, "clinical");
    expect(s).toContain("-320");
    expect(s).toContain("deficit");
  });
});
