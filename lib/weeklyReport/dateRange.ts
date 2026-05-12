import { addDaysKey, formatDateKeyLocal, parseDateKey } from "../calculations";

/** Inclusive local-calendar window of seven days ending on `weekEnd` (YYYY-MM-DD). */
export function weekWindowInclusive(weekEnd: string): { weekStart: string; weekEnd: string } {
  return { weekStart: addDaysKey(weekEnd, -6), weekEnd };
}

/** Default report window: last 7 local days ending yesterday (avoids partial “today”). */
export function defaultWeeklyReportEndDate(now: Date = new Date()): string {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return formatDateKeyLocal(y);
}

/**
 * Week-end date key for the scheduled Monday digest (Lambda uses UTC calendar).
 * Same as {@link defaultWeeklyReportEndDate}: “yesterday” relative to the cron run so a Monday
 * schedule covers the completed window ending Sunday UTC.
 */
export function weeklyDigestSchedulerWeekEndKey(now: Date = new Date()): string {
  return defaultWeeklyReportEndDate(now);
}

export function isDateInInclusiveRange(date: string, start: string, end: string): boolean {
  const t = parseDateKey(date);
  return t >= parseDateKey(start) && t <= parseDateKey(end);
}
