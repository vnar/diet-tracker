import type { PlateauUserSettings } from "../types";

function roundTo(value: number, decimals: number): number {
  const p = 10 ** decimals;
  return Math.round(value * p) / p;
}

/** Resolved plateau algorithm parameters (after clamping user/settings input). */
export type PlateauDetectionParams = {
  rollingWindowDays: number;
  comparisonSpanDays: number;
  maxAvgMovementKg: number;
};

export const DEFAULT_PLATEAU_DETECTION: PlateauDetectionParams = {
  rollingWindowDays: 7,
  comparisonSpanDays: 14,
  maxAvgMovementKg: 0.2,
};

export type PlateauLogRow = { date: string; morningWeight: number };

export type PlateauEvaluation = {
  asOfDate: string;
  currentRollingAvgKg: number;
  priorRollingAvgKg: number;
  movementKg: number;
  resolvedConfig: PlateauDetectionParams;
  minLogsRequired: number;
};

function clampInt(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  const x = Math.round(n);
  if (x < min || x > max) return fallback;
  return x;
}

function clampPositiveFloat(n: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(n)) return fallback;
  if (n < min || n > max) return fallback;
  return n;
}

/**
 * Merge optional user/settings overrides with defaults and enforce safe bounds.
 * Rolling window: 3–21 days. Span between compared averages: 7–60 days. Movement threshold: 0.05–2 kg.
 */
export function resolvePlateauConfig(partial?: PlateauUserSettings): PlateauDetectionParams {
  const rollingWindowDays = clampInt(
    partial?.rollingWindowDays ?? DEFAULT_PLATEAU_DETECTION.rollingWindowDays,
    3,
    21,
    DEFAULT_PLATEAU_DETECTION.rollingWindowDays,
  );
  let comparisonSpanDays = clampInt(
    partial?.comparisonSpanDays ?? DEFAULT_PLATEAU_DETECTION.comparisonSpanDays,
    7,
    60,
    DEFAULT_PLATEAU_DETECTION.comparisonSpanDays,
  );
  if (comparisonSpanDays < rollingWindowDays) {
    comparisonSpanDays = rollingWindowDays;
  }
  const maxAvgMovementKg = clampPositiveFloat(
    partial?.maxAvgMovementKg ?? DEFAULT_PLATEAU_DETECTION.maxAvgMovementKg,
    0.05,
    2,
    DEFAULT_PLATEAU_DETECTION.maxAvgMovementKg,
  );
  return { rollingWindowDays, comparisonSpanDays, maxAvgMovementKg };
}

/** Minimum daily logs needed so both rolling averages use full windows. */
export function minLogsRequiredForPlateau(cfg: PlateauDetectionParams): number {
  return cfg.rollingWindowDays + cfg.comparisonSpanDays - 1;
}

function rollingAverageKg(logs: PlateauLogRow[], idx: number, windowSize: number): number {
  const start = Math.max(0, idx - windowSize + 1);
  const chunk = logs.slice(start, idx + 1);
  return chunk.reduce((acc, log) => acc + log.morningWeight, 0) / chunk.length;
}

/**
 * Detects a weight plateau: two rolling averages, separated by roughly `comparisonSpanDays`,
 * differ by less than `maxAvgMovementKg`. Returns null if there is not enough data or no plateau.
 */
export function evaluatePlateau(
  logs: PlateauLogRow[],
  partialConfig?: PlateauUserSettings,
): PlateauEvaluation | null {
  const cfg = resolvePlateauConfig(partialConfig);
  const minLogs = minLogsRequiredForPlateau(cfg);
  if (logs.length < minLogs) return null;

  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const latestIdx = sorted.length - 1;
  const offset = cfg.comparisonSpanDays - 1;
  const priorIdx = latestIdx - offset;
  if (priorIdx < cfg.rollingWindowDays - 1) return null;

  const currentRollingAvgKg = rollingAverageKg(sorted, latestIdx, cfg.rollingWindowDays);
  const priorRollingAvgKg = rollingAverageKg(sorted, priorIdx, cfg.rollingWindowDays);
  const movementKg = Math.abs(currentRollingAvgKg - priorRollingAvgKg);
  if (movementKg >= cfg.maxAvgMovementKg) return null;

  return {
    asOfDate: sorted[latestIdx]!.date,
    currentRollingAvgKg,
    priorRollingAvgKg,
    movementKg,
    resolvedConfig: cfg,
    minLogsRequired: minLogs,
  };
}

/** User-facing insight card from a plateau evaluation — calm, non-medical, avoids false precision. */
export function plateauInsightFromEvaluation(ev: PlateauEvaluation): {
  id: string;
  ruleId: "plateau";
  priority: number;
  headline: string;
  detail?: string;
  why: string[];
  action: string;
  category: "plateau";
} {
  const cfg = ev.resolvedConfig;
  return {
    id: `plateau-${ev.asOfDate}`,
    ruleId: "plateau",
    priority: 93,
    headline: "Your weight trend has been fairly steady lately.",
    detail:
      "Over the stretch we looked at, your rolling average barely shifted compared with earlier. That happens often while a body settles—it's a pattern in your logs, not a medical read. If you want to nudge things, small, sustainable tweaks beat big swings.",
    why: [
      `Recent ${cfg.rollingWindowDays}-day average is about ${roundTo(ev.currentRollingAvgKg, 1)} kg.`,
      `Roughly ${cfg.comparisonSpanDays} days earlier, a similar average was about ${roundTo(ev.priorRollingAvgKg, 1)} kg.`,
      `The gap between those averages is small (about ${roundTo(ev.movementKg, 2)} kg, under your ${cfg.maxAvgMovementKg} kg setting).`,
    ],
    action: "Consider one gentle change this week—or keep your routine and check back after a few more logs.",
    category: "plateau",
  };
}
