import type { CoachTone } from "@/lib/coachTone";
export type WeeklyReportGenerationSource = "rules" | "llm";
/** One row per calendar day in the inclusive window [weekStart, weekEnd]. */
export type WeeklyDayRollup = {
    date: string;
    hasMorningWeight: boolean;
    morningWeight: number | null;
    hasCaloriesManual: boolean;
    caloriesManual: number | null;
    proteinManualG: number | null;
    steps: number | null;
    sleepHours: number | null;
    lateSnack: boolean;
    highSodium: boolean;
    workout: boolean;
    alcohol: boolean;
    hasNotes: boolean;
    notesMayReferenceMedication: boolean;
    mealEntryCount: number;
    mealKcalSum: number;
    mealProteinGSum: number;
};
export type WeeklyReportAggregate = {
    weekStart: string;
    weekEnd: string;
    unit: "kg" | "lbs";
    tone: CoachTone;
    days: WeeklyDayRollup[];
    /** Days with morning weight logged. */
    weighInDays: number;
    /** Days with any substantive check-in (weight, manual macros, steps, sleep, meal, habit true, or notes). */
    checkInDays: number;
    /** Total meal rows attached to days in window (library / logged meals). */
    mealEntriesTotal: number;
    sumCaloriesManual: number;
    sumProteinManualG: number;
    sumMealKcal: number;
    sumMealProteinG: number;
    avgSteps: number | null;
    avgSleep: number | null;
    habitCounts: {
        lateSnack: number;
        highSodium: number;
        workout: number;
        alcohol: number;
    };
    weightFirst: number | null;
    weightLast: number | null;
    weightDelta: number | null;
    progressPhotosInWeek: number;
    /** True if any day's notes matched conservative medication-related keywords (not clinical interpretation). */
    notesMedicationKeywordHits: number;
};
export type WeeklyExperimentKind = "daily_logging" | "sleep_rhythm" | "steps_baseline" | "late_snack_window" | "protein_anchor" | "habit_steady";
export type WeeklyNextExperiment = {
    kind: WeeklyExperimentKind;
    title: string;
    description: string;
};
export type WeeklyReportSections = {
    title: string;
    subtitle: string;
    whatChanged: string[];
    whatHelped: string[];
    whatHarder: string[];
    nextExperiment: WeeklyNextExperiment;
    disclaimers: string[];
};
/** Snapshot from GET /v2/insights for richer weekly emails (optional). */
export type WeeklyReportEmailInsight = {
    headline: string;
    detail?: string;
    action: string;
    source?: "llm" | "rules";
};
export type WeeklyReportDocument = {
    generatedAt: string;
    generationSource: WeeklyReportGenerationSource;
    aggregate: WeeklyReportAggregate;
    sections: WeeklyReportSections;
    /** When set, email builders add an “AI insights” section (in-app card body unchanged). */
    aiInsightsForEmail?: WeeklyReportEmailInsight[];
};
