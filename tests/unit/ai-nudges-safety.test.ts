import { describe, expect, it } from "vitest";
import { applySafetyGuardrails, sanitizeHealthCoachingCopy } from "@/lib/aiNudges/safety";
import type { AiNudge } from "@/lib/aiNudges/types";

describe("sanitizeHealthCoachingCopy", () => {
  it("replaces diagnosis wording", () => {
    expect(sanitizeHealthCoachingCopy("We diagnose prediabetes from your log")).not.toMatch(/diagnos/i);
  });
});

describe("applySafetyGuardrails", () => {
  it("adds safety notice when missing", () => {
    const n: AiNudge = {
      id: "1",
      title: "Trend",
      message: "Based on your weights.",
      confidence: 0.8,
      supportingEvidence: ["5 days logged"],
      category: "weight_trend",
      createdAt: "2026-01-01T00:00:00.000Z",
      source: "rules",
    };
    const out = applySafetyGuardrails(n);
    expect(out.safetyNotice?.length).toBeGreaterThan(20);
  });
});
