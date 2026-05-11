import type { DailyEntry, ProgressPhoto, UserSettings } from "@/lib/types";
import type { WeeklyReportAggregate } from "@/lib/weeklyReport/types";
/** Minimal meal row for aggregation (avoids importing client API types). */
export type WeeklyMealAggRow = {
    kcal: number | null;
    proteinG: number | null;
};
export type WeeklyAggregateInput = {
    weekEnd: string;
    entries: DailyEntry[];
    mealsByDay?: Record<string, WeeklyMealAggRow[] | undefined>;
    photos?: ProgressPhoto[];
    settings: Pick<UserSettings, "unit" | "tone">;
};
export declare function buildWeeklyAggregate(input: WeeklyAggregateInput): WeeklyReportAggregate;
