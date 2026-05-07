export type InsightEntryRow = {
    date: string;
    morningWeight: number;
    nightWeight?: number | null;
    calories?: number;
    protein?: number;
    steps?: number;
    sleep?: number;
    lateSnack: boolean;
    highSodium: boolean;
    workout: boolean;
    alcohol: boolean;
};
export type MealDayTotal = {
    day: string;
    kcal: number;
    protein: number;
};
export declare function sortEntriesAsc(entries: InsightEntryRow[]): InsightEntryRow[];
export declare function addDaysIso(dateStr: string, delta: number): string;
export declare function round2(n: number): string;
/** Last N calendar days ending at `endDate` (inclusive). */
export declare function lastNDates(endDate: string, n: number): string[];
export declare function entryByDateMap(entries: InsightEntryRow[]): Map<string, InsightEntryRow>;
export declare function buildWeightLogTable(entriesAsc: InsightEntryRow[], maxRows: number): string;
export declare function buildHabitLogTable(entriesAsc: InsightEntryRow[], maxRows: number): string;
export declare function buildMealLogTable(mealTotals: MealDayTotal[], entryMap: Map<string, InsightEntryRow>): string;
export declare function buildStepsLogTable(dates: string[], entryMap: Map<string, InsightEntryRow>): string;
export declare function buildSleepLogTable(dates: string[], entryMap: Map<string, InsightEntryRow>): string;
export declare function countLateSnackInWindow(windowDates: string[], entryMap: Map<string, InsightEntryRow>): number;
export declare function countWorkoutInWindow(windowDates: string[], entryMap: Map<string, InsightEntryRow>): number;
/** Average next-morning weight after days with late_snack on day D (morning on D+1). */
export declare function avgMorningAfterLateSnack(entriesAsc: InsightEntryRow[]): number | null;
export declare function avgMorningAfterNoLateSnack(entriesAsc: InsightEntryRow[]): number | null;
/** Morning(D+1) - Morning(D) when workout on D. */
export declare function avgDeltaMorningAfterWorkout(entriesAsc: InsightEntryRow[]): number | null;
export declare function currentSevenDayLossRateKgPerWeek(entriesAsc: InsightEntryRow[]): number | null;
export declare function daysFromTo(fromDate: string, toDate: string): number;
export declare function requiredWeeklyLossRate(currentKg: number, targetKg: number, today: string, goalDate: string): number | null;
export declare function requiredDailyLoss(currentKg: number, targetKg: number, today: string, goalDate: string): string;
export declare function sevenDayMorningAverage(entriesAsc: InsightEntryRow[]): number | null;
export declare function avgKcalOnWeightRiseDays(entriesAsc: InsightEntryRow[], mealByDay: Map<string, MealDayTotal>): number | null;
export declare function avgKcalOnWeightFallDays(entriesAsc: InsightEntryRow[], mealByDay: Map<string, MealDayTotal>): number | null;
export declare function avgSleepBeforeWeightDrop(entriesAsc: InsightEntryRow[]): number | null;
export declare function avgSleepBeforeWeightRise(entriesAsc: InsightEntryRow[]): number | null;
export declare function loggingStreaks(entriesAsc: InsightEntryRow[], today: string): {
    longest: number;
    current: number;
};
export declare function buildAiInsightUserMessage(input: {
    today: string;
    currentWeight: string;
    sevenDayAvg: string;
    startWeight: string;
    targetWeight: string;
    daysToGoal: string;
    goalDate: string;
    dailyLossNeeded: string;
    weightLogTable: string;
    habitLogTable: string;
    mealLogTable: string;
    stepsLogTable: string;
    sleepLogTable: string;
    lateSnackCount14: string;
    avgWeightAfterSnack: string;
    avgWeightNoSnack: string;
    workoutCount14: string;
    avgDeltaAfterWorkout: string;
    weeklyLossRate: string;
    requiredWeeklyRate: string;
    longestStreak: string;
    currentStreak: string;
    avgKcalRise: string;
    avgKcalFall: string;
    avgSleepDrop: string;
    avgSleepRise: string;
}): string;
export declare function buildAiInsightFingerprint(input: {
    userId: string;
    latestDate: string;
    latestMorning: number;
    goalWeight: number;
    targetDate: string;
    mealDigest: string;
    habitTail: string;
}): string;
