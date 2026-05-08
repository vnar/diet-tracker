import { describe, expect, it } from "vitest";
import {
  metricTilesFromHighlights,
  splitHighlights,
  verdictLabels,
  verdictToneFromConfidence,
  workingBodyFromHighlights,
} from "@/lib/photos/bodyCompareAssessmentCardModel";

describe("bodyCompareAssessmentCardModel", () => {
  it("maps confidence to tones", () => {
    expect(verdictToneFromConfidence(80)).toBe("on_track");
    expect(verdictToneFromConfidence(50)).toBe("at_risk");
    expect(verdictToneFromConfidence(20)).toBe("off_track");
  });

  it("splits leaner vs other", () => {
    const { leaner, other } = splitHighlights([
      { area: "Waist", assessment: "Looks tighter", direction: "leaner" },
      { area: "Face", assessment: "Unclear angle", direction: "uncertain" },
    ]);
    expect(leaner).toHaveLength(1);
    expect(other).toHaveLength(1);
  });

  it("verdictLabels for off_track", () => {
    expect(verdictLabels("off_track").badge).toContain("Low");
  });

  it("pads metric tiles", () => {
    const tiles = metricTilesFromHighlights([], 55, "Jan 1", "May 1");
    expect(tiles).toHaveLength(3);
    expect(tiles[0]?.value).toBe("55%");
  });

  it("workingBody fallback when empty leaner", () => {
    expect(workingBodyFromHighlights([]).length).toBeGreaterThan(20);
  });
});
