import type { DailyEntry } from "./types";

export function parseDateKey(dateStr: string): number {
  return new Date(dateStr + "T12:00:00").getTime();
}

export function sortEntriesByDateAsc(entries: DailyEntry[]): DailyEntry[] {
  return [...entries].sort((a, b) => parseDateKey(a.date) - parseDateKey(b.date));
}

/** Calendar YYYY-MM-DD in the given Date's local timezone (not UTC). */
export function formatDateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * @deprecated For UI use `useClientTodayKey()` so SSR/hydration match; this is only for non-React code.
 * Uses the runtime environment's local calendar (UTC on many servers).
 */
export function getTodayKey(): string {
  return formatDateKeyLocal(new Date());
}

export function addDaysKey(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return formatDateKeyLocal(d);
}

export function getEntryForDate(
  entries: DailyEntry[],
  date: string
): DailyEntry | undefined {
  return entries.find((e) => e.date === date);
}

export function getYesterdayKey(today: string): string {
  return addDaysKey(today, -1);
}

export function weightDeltaKg(
  today: DailyEntry,
  yesterday: DailyEntry | null
): number | null {
  if (!yesterday) return null;
  return today.morningWeight - yesterday.morningWeight;
}

export function rollingSevenDayAverage(
  entries: DailyEntry[],
  asOfDate: string
): number | null {
  const sorted = sortEntriesByDateAsc(entries);
  const end = parseDateKey(asOfDate);
  const windowEntries = sorted.filter((e) => {
    const t = parseDateKey(e.date);
    return t <= end && t >= end - 6 * 86400000;
  });
  if (windowEntries.length === 0) return null;
  const sum = windowEntries.reduce((acc, e) => acc + e.morningWeight, 0);
  return sum / windowEntries.length;
}

export interface MovingAveragePoint {
  date: string;
  avg: number;
}

export function sevenDayMovingAverageSeries(
  entries: DailyEntry[]
): MovingAveragePoint[] {
  const sorted = sortEntriesByDateAsc(entries);
  const result: MovingAveragePoint[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = Math.max(0, i - 6);
    const slice = sorted.slice(start, i + 1);
    const avg =
      slice.reduce((acc, e) => acc + e.morningWeight, 0) / slice.length;
    result.push({ date: sorted[i].date, avg });
  }
  return result;
}

export function consecutiveDownDays(
  entries: DailyEntry[],
  asOfDate: string
): number {
  const sorted = sortEntriesByDateAsc(entries).filter(
    (e) => parseDateKey(e.date) <= parseDateKey(asOfDate)
  );
  if (sorted.length < 2) return 0;
  let streak = 0;
  for (let i = sorted.length - 1; i > 0; i--) {
    if (sorted[i].morningWeight < sorted[i - 1].morningWeight) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}

export function daysUntilTarget(
  targetDateStr: string,
  asOfDateKey: string
): number {
  const target = new Date(targetDateStr + "T12:00:00").getTime();
  const today = new Date(asOfDateKey + "T12:00:00").getTime();
  return Math.ceil((target - today) / 86400000);
}

/** Positive = 7-day avg higher than a week earlier (often “heavier” trend). */
export function sevenDayAvgDeltaVsPriorWeek(
  entries: DailyEntry[],
  today: string
): number | null {
  const curr = rollingSevenDayAverage(entries, today);
  const prior = rollingSevenDayAverage(entries, addDaysKey(today, -7));
  if (curr === null || prior === null) return null;
  return curr - prior;
}
