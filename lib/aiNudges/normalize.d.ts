import type { NormalizedDailyRow, NormalizedUserHealthSnapshot } from "@/lib/aiNudges/types";
export type RawEntryForNudges = {
    date: string;
    morningWeight: number;
    nightWeight?: number;
    calories?: number;
    protein?: number;
    steps?: number;
    sleep?: number;
    lateSnack: boolean;
    highSodium: boolean;
    workout: boolean;
    alcohol: boolean;
};
/**
 * Build a sorted, de-duplicated 90-day window of daily rows (last row per date wins).
 */
export declare function buildNormalizedHealthSnapshot(input: {
    asOfDate: string;
    entriesRaw: RawEntryForNudges[];
    goalWeight: number;
    startWeight: number;
    targetDate: string;
    recentAvgDailyCalories?: number | null;
}): NormalizedUserHealthSnapshot;
export declare function countValidWeightDays(snapshot: NormalizedUserHealthSnapshot): number;
export declare function meanCaloriesLastNDays(days: NormalizedDailyRow[], n: number): number | null;
