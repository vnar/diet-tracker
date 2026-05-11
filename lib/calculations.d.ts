import type { DailyEntry } from "./types";
export declare function parseDateKey(dateStr: string): number;
export declare function sortEntriesByDateAsc(entries: DailyEntry[]): DailyEntry[];
/** Calendar YYYY-MM-DD in the given Date's local timezone (not UTC). */
export declare function formatDateKeyLocal(d: Date): string;
/**
 * @deprecated For UI use `useClientTodayKey()` so SSR/hydration match; this is only for non-React code.
 * Uses the runtime environment's local calendar (UTC on many servers).
 */
export declare function getTodayKey(): string;
export declare function addDaysKey(dateStr: string, delta: number): string;
export declare function getEntryForDate(entries: DailyEntry[], date: string): DailyEntry | undefined;
export declare function getYesterdayKey(today: string): string;
export declare function weightDeltaKg(today: DailyEntry, yesterday: DailyEntry | null): number | null;
/** Latest entry with date strictly before `beforeKey` (handles irregular logging gaps). */
export declare function priorLoggedEntry(entries: DailyEntry[], beforeKey: string): DailyEntry | null;
export declare function calendarDaysBetween(earlierKey: string, laterKey: string): number;
export declare function rollingSevenDayAverage(entries: DailyEntry[], asOfDate: string): number | null;
export interface MovingAveragePoint {
    date: string;
    avg: number;
}
/**
 * Moving average over the last up to 7 **logged** points (not calendar days).
 * Gaps between weigh-ins do not break the series.
 */
export declare function sevenDayMovingAverageSeries(entries: DailyEntry[]): MovingAveragePoint[];
/**
 * Counts consecutive **logged** weigh-ins (by date order) where morning weight
 * dropped vs the previous log. Calendar gaps between logs are allowed.
 */
export declare function consecutiveDownDays(entries: DailyEntry[], asOfDate: string): number;
export declare function daysUntilTarget(targetDateStr: string, asOfDateKey: string): number;
/** Positive = 7-day avg higher than a week earlier (often “heavier” trend). */
export declare function sevenDayAvgDeltaVsPriorWeek(entries: DailyEntry[], today: string): number | null;
