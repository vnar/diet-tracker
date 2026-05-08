/** Map progress-photo assessment API payload → copy for the Insights-style photo card. */

export type BodyCompareHighlight = {
  area: string;
  assessment: string;
  direction: "leaner" | "unchanged" | "uncertain";
};

export type BodyCompareAssessment = {
  summary: string;
  confidence: number;
  disclaimer: string;
  highlights: BodyCompareHighlight[];
  timeframe: { from: string; to: string };
  generatedAt?: string;
};

export type PhotoInsightVerdictTone = "on_track" | "at_risk" | "off_track";

export function verdictToneFromConfidence(confidence: number): PhotoInsightVerdictTone {
  if (confidence >= 72) return "on_track";
  if (confidence >= 42) return "at_risk";
  return "off_track";
}

export function verdictLabels(tone: PhotoInsightVerdictTone): { badge: string; headline: string } {
  if (tone === "on_track") {
    return { badge: "Higher confidence", headline: "Visual estimate" };
  }
  if (tone === "at_risk") {
    return { badge: "Moderate confidence", headline: "Visual estimate" };
  }
  return { badge: "Low confidence", headline: "Rough visual guess" };
}

export function splitHighlights(highlights: BodyCompareHighlight[]): {
  leaner: BodyCompareHighlight[];
  other: BodyCompareHighlight[];
} {
  const leaner = highlights.filter((h) => h.direction === "leaner");
  const other = highlights.filter((h) => h.direction !== "leaner");
  return { leaner, other };
}

export function workingBodyFromHighlights(leaner: BodyCompareHighlight[]): string {
  if (leaner.length === 0) {
    return "No area was flagged as clearly leaner — lighting, clothing, or pose may be hiding change.";
  }
  return leaner.map((h) => `${h.area}: ${h.assessment}`).join(" ");
}

export function stallingBodyFromHighlights(other: BodyCompareHighlight[]): string {
  if (other.length === 0) {
    return "No extra caution areas — still treat this as an estimate, not a measurement.";
  }
  return other.map((h) => `${h.area}: ${h.assessment}`).join(" ");
}

export function metricTilesFromHighlights(
  highlights: BodyCompareHighlight[],
  confidence: number,
  fromLabel: string,
  toLabel: string,
): Array<{ value: string; label: string }> {
  const tiles = highlights.slice(0, 3).map((h) => ({
    value: h.area.length > 14 ? `${h.area.slice(0, 12)}…` : h.area,
    label: h.assessment.length > 52 ? `${h.assessment.slice(0, 50)}…` : h.assessment,
  }));
  const fillers: Array<{ value: string; label: string }> = [
    { value: `${confidence}%`, label: "Model confidence" },
    { value: fromLabel, label: "Range start" },
    { value: toLabel, label: "Range end" },
  ];
  let f = 0;
  while (tiles.length < 3 && f < fillers.length) {
    tiles.push(fillers[f]!);
    f += 1;
  }
  return tiles.slice(0, 3);
}
