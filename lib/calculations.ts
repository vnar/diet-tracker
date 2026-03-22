import type { DailyEntry } from "./types";

export function parseDateKey(dateStr: string): number {
  return new Date(dateStr + "T12:00:00").getTime();
}

export function sortEntriesByDateAsc(entries: DailyEntry[]): DailyEntry[] {
  return [...entries].sort((a, b) => parseDateKey(a.date) - parseDateKey(b.date));
}

export function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export function addDaysKey(dateStr: string, delta: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + delta);
  return d.toISOString().slice(0, 10);
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

export function daysUntilTarget(targetDateStr: string): number {
  const target = new Date(targetDateStr + "T12:00:00").getTime();
  const today = new Date(getTodayKey() + "T12:00:00").getTime();
  return Math.ceil((target - today) / 86400000);
}
