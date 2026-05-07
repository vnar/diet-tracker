import type { PlateauUserSettings } from "../types";
/** Resolved plateau algorithm parameters (after clamping user/settings input). */
export type PlateauDetectionParams = {
    rollingWindowDays: number;
    comparisonSpanDays: number;
    maxAvgMovementKg: number;
};
export declare const DEFAULT_PLATEAU_DETECTION: PlateauDetectionParams;
export type PlateauLogRow = {
    date: string;
    morningWeight: number;
};
export type PlateauEvaluation = {
    asOfDate: string;
    currentRollingAvgKg: number;
    priorRollingAvgKg: number;
    movementKg: number;
    resolvedConfig: PlateauDetectionParams;
    minLogsRequired: number;
};
/**
 * Merge optional user/settings overrides with defaults and enforce safe bounds.
 * Rolling window: 3–21 days. Span between compared averages: 7–60 days. Movement threshold: 0.05–2 kg.
 */
export declare function resolvePlateauConfig(partial?: PlateauUserSettings): PlateauDetectionParams;
/** Minimum daily logs needed so both rolling averages use full windows. */
export declare function minLogsRequiredForPlateau(cfg: PlateauDetectionParams): number;
/**
 * Detects a weight plateau: two rolling averages, separated by roughly `comparisonSpanDays`,
 * differ by less than `maxAvgMovementKg`. Returns null if there is not enough data or no plateau.
 */
export declare function evaluatePlateau(logs: PlateauLogRow[], partialConfig?: PlateauUserSettings): PlateauEvaluation | null;
/** User-facing insight card from a plateau evaluation — calm, non-medical, avoids false precision. */
export declare function plateauInsightFromEvaluation(ev: PlateauEvaluation): {
    id: string;
    ruleId: "plateau";
    priority: number;
    headline: string;
    detail?: string;
    why: string[];
    action: string;
    category: "plateau";
};
