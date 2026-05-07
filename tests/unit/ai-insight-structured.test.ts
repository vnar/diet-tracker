import { describe, expect, it } from "vitest";
import { parseAiInsightStructured } from "@/lib/insights/aiInsightStructured";

const minimalJson = `{
  "verdict": {
    "status": "at_risk",
    "headline": "Pace is half of goal 0.2 kg per week",
    "detail": "Need faster loss by July 7 deadline."
  },
  "working": { "body": "May 6 you logged 1800 kcal and dropped weight." },
  "stalling": {
    "body": "May 7 only 800 kcal stalled the scale.",
    "metrics": [
      { "value": "5", "label": "days no workout" },
      { "value": "5h", "label": "sleep" },
      { "value": "40g", "label": "protein" }
    ]
  },
  "actions": [
    { "icon": "walk", "action": "Walk 20 minutes", "reason": "Breaks the gap" },
    { "icon": "food", "action": "Eat 1800 kcal", "reason": "Sustainable deficit" },
    { "icon": "moon", "action": "Sleep 7h", "reason": "Recovery" }
  ],
  "prediction": {
    "headline": "Hit all three by May 10",
    "basis": "After workout plus sleep days"
  }
}`;

describe("parseAiInsightStructured", () => {
  it("parses fenced JSON", () => {
    const raw = "```json\n" + minimalJson + "\n```";
    const r = parseAiInsightStructured(raw);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.verdict.status).toBe("at_risk");
      expect(r.data.stalling.metrics).toHaveLength(3);
      expect(r.data.actions).toHaveLength(3);
    }
  });

  it("pads short metric and action arrays", () => {
    const oneMetric = minimalJson.replace(
      `"metrics": [
      { "value": "5", "label": "days no workout" },
      { "value": "5h", "label": "sleep" },
      { "value": "40g", "label": "protein" }
    ]`,
      `"metrics": [ { "value": "1", "label": "a" } ]`,
    );
    const oneAction = oneMetric.replace(
      `"actions": [
    { "icon": "walk", "action": "Walk 20 minutes", "reason": "Breaks the gap" },
    { "icon": "food", "action": "Eat 1800 kcal", "reason": "Sustainable deficit" },
    { "icon": "moon", "action": "Sleep 7h", "reason": "Recovery" }
  ]`,
      `"actions": [ { "icon": "run", "action": "Run", "reason": "Go" } ]`,
    );
    const r = parseAiInsightStructured(oneAction);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.stalling.metrics).toHaveLength(3);
      expect(r.data.actions).toHaveLength(3);
    }
  });

  it("rejects when all actions have invalid icons", () => {
    const bad = minimalJson.replace(
      `"actions": [
    { "icon": "walk", "action": "Walk 20 minutes", "reason": "Breaks the gap" },
    { "icon": "food", "action": "Eat 1800 kcal", "reason": "Sustainable deficit" },
    { "icon": "moon", "action": "Sleep 7h", "reason": "Recovery" }
  ]`,
      `"actions": [
    { "icon": "nope", "action": "Walk 20 minutes", "reason": "Breaks the gap" }
  ]`,
    );
    expect(parseAiInsightStructured(bad).ok).toBe(false);
  });
});
