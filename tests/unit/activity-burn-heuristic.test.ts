import { describe, expect, it } from "vitest";
import {
  estimateActivityBurnHeuristic,
  inferActivityMetFromText,
  parseActivityDurationMinutes,
} from "@/lib/activity/burnHeuristic";

describe("parseActivityDurationMinutes", () => {
  it("parses minutes", () => {
    expect(parseActivityDurationMinutes("biked for 11 mins around 2 miles")).toBe(11);
  });

  it("parses hours", () => {
    expect(parseActivityDurationMinutes("1 hour walk")).toBe(60);
  });

  it("returns null when no duration", () => {
    expect(parseActivityDurationMinutes("easy bike around the block")).toBeNull();
  });
});

describe("inferActivityMetFromText", () => {
  it("detects cycling", () => {
    expect(inferActivityMetFromText("Biking")).toBe(7);
  });
});

describe("estimateActivityBurnHeuristic", () => {
  it("matches MET formula for biking 11 min at 70 kg", () => {
    const r = estimateActivityBurnHeuristic("biked for 11 mins around 2 miles", 70);
    expect(r.minutes).toBe(11);
    expect(r.met).toBe(7);
    const expected = Math.round((7 * 3.5 * 70 * 11) / 200);
    expect(r.kcalBurn).toBe(expected);
    expect(r.activitySummary).toContain("Cycling");
    expect(r.confidence).toBe(60);
  });

  it("uses default duration when none given", () => {
    const r = estimateActivityBurnHeuristic("went for a bike ride", 70);
    expect(r.minutes).toBe(30);
    expect(r.confidence).toBe(45);
  });

  it("returns zeros for empty text", () => {
    const r = estimateActivityBurnHeuristic("  ", 70);
    expect(r.kcalBurn).toBe(0);
    expect(r.minutes).toBe(0);
  });
});
