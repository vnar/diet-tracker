/** Inclusive local-calendar window of seven days ending on `weekEnd` (YYYY-MM-DD). */
export declare function weekWindowInclusive(weekEnd: string): {
    weekStart: string;
    weekEnd: string;
};
/** Default report window: last 7 local days ending yesterday (avoids partial “today”). */
export declare function defaultWeeklyReportEndDate(now?: Date): string;
/**
 * Week-end date key for the scheduled Monday digest (Lambda uses UTC calendar).
 * Same as {@link defaultWeeklyReportEndDate}: “yesterday” relative to the cron run so a Monday
 * schedule covers the completed window ending Sunday UTC.
 */
export declare function weeklyDigestSchedulerWeekEndKey(now?: Date): string;
export declare function isDateInInclusiveRange(date: string, start: string, end: string): boolean;
