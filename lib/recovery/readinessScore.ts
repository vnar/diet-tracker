import { addDaysKey } from "@/lib/calculations";
import type { DailyEntry } from "@/lib/types";

export type ReadinessZone = "green" | "yellow" | "red";

export type ReadinessSignal = {
  key: "sleep" | "activity" | "habits" | "consistency";
  label: string;
  impact: number;
};

export type DailyReadiness = {
  score: number;
  zone: ReadinessZone;
  recommendation: string;
  trend7d: number | null;
  yesterdayScore: number | null;
  signals: ReadinessSignal[];
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function scoreZone(score: number): ReadinessZone {
  if (score >= 70) return "green";
  if (score >= 45) return "yellow";
  return "red";
}

function recommendationFor(zone: ReadinessZone): string {
  if (zone === "green") return "Push day: train hard and keep routines tight.";
  if (zone === "yellow") return "Steady day: train moderate and prioritize recovery tonight.";
  return "Recover day: lighter load, hydrate, and sleep earlier.";
}

function scoreForEntry(entry: DailyEntry, baseline: { sleep: number | null; steps: number | null }): number {
  let score = 55;

  const sleep = asNumber(entry.sleep);
  if (sleep != null && sleep > 0) {
    if (sleep >= 8) score += 18;
    else if (sleep >= 7) score += 12;
    else if (sleep >= 6) score += 5;
    else score -= 10;
    if (baseline.sleep != null) {
      score += clamp((sleep - baseline.sleep) * 3, -8, 8);
    }
  }

  const steps = asNumber(entry.steps);
  if (steps != null && steps > 0) {
    if (steps >= 10000) score += 8;
    else if (steps >= 7000) score += 5;
    else if (steps < 3000) score -= 5;
    if (baseline.steps != null) {
      const ratio = baseline.steps > 0 ? steps / baseline.steps : 1;
      if (ratio < 0.6) score -= 4;
      if (ratio > 1.25) score += 3;
    }
  }

  if (entry.workout) score += 4;
  if (entry.lateSnack) score -= 5;
  if (entry.highSodium) score -= 4;
  if (entry.alcohol) score -= 8;

  return clamp(Math.round(score), 0, 100);
}

/**
 * Daily readiness from "one day before" (yesterday) plus 7-day trend context.
 * Trend window excludes yesterday: baseline uses days -8..-2.
 */
export function computeDailyReadiness(entries: DailyEntry[], asOfDate: string): DailyReadiness {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  const yesterdayKey = addDaysKey(asOfDate, -1);
  const yesterday = byDate.get(yesterdayKey);

  if (!yesterday) {
    return {
      score: 50,
      zone: "yellow",
      recommendation: "Log yesterday's check-in to get a personalized readiness score.",
      trend7d: null,
      yesterdayScore: null,
      signals: [],
    };
  }

  const baselineSleep: number[] = [];
  const baselineSteps: number[] = [];
  const priorScores: number[] = [];

  for (let offset = 2; offset <= 8; offset += 1) {
    const key = addDaysKey(asOfDate, -offset);
    const e = byDate.get(key);
    if (!e) continue;
    const sleep = asNumber(e.sleep);
    const steps = asNumber(e.steps);
    if (sleep != null && sleep > 0) baselineSleep.push(sleep);
    if (steps != null && steps > 0) baselineSteps.push(steps);
  }

  const baseline = {
    sleep: average(baselineSleep),
    steps: average(baselineSteps),
  };

  for (let offset = 2; offset <= 8; offset += 1) {
    const key = addDaysKey(asOfDate, -offset);
    const e = byDate.get(key);
    if (!e) continue;
    priorScores.push(scoreForEntry(e, baseline));
  }

  const yesterdayScore = scoreForEntry(yesterday, baseline);
  const trend7d = average(priorScores);
  const score = trend7d == null ? yesterdayScore : Math.round(yesterdayScore * 0.65 + trend7d * 0.35);
  const zone = scoreZone(score);

  const signals: ReadinessSignal[] = [];
  const ySleep = asNumber(yesterday.sleep);
  if (ySleep != null && ySleep > 0) {
    const delta = baseline.sleep == null ? 0 : ySleep - baseline.sleep;
    signals.push({
      key: "sleep",
      label: delta >= 0 ? "Sleep above baseline" : "Sleep below baseline",
      impact: clamp(Math.round(delta * 4), -12, 12),
    });
  }
  const ySteps = asNumber(yesterday.steps);
  if (ySteps != null && ySteps > 0 && baseline.steps != null && baseline.steps > 0) {
    const ratio = ySteps / baseline.steps;
    signals.push({
      key: "activity",
      label: ratio >= 1 ? "Activity held strong" : "Activity below usual",
      impact: clamp(Math.round((ratio - 1) * 18), -10, 8),
    });
  }
  const habitImpact = (yesterday.alcohol ? -8 : 0) + (yesterday.lateSnack ? -5 : 0) + (yesterday.highSodium ? -4 : 0);
  signals.push({
    key: "habits",
    label: habitImpact < 0 ? "Recovery habits dragged readiness" : "Recovery habits held steady",
    impact: habitImpact,
  });
  if (trend7d != null) {
    signals.push({
      key: "consistency",
      label: "7-day consistency",
      impact: clamp(Math.round((yesterdayScore - trend7d) * 0.35), -8, 8),
    });
  }

  return {
    score,
    zone,
    recommendation: recommendationFor(zone),
    trend7d: trend7d == null ? null : Math.round(trend7d),
    yesterdayScore,
    signals: signals.filter((s) => s.impact !== 0).slice(0, 4),
  };
}
