import type { InsightLog } from "@/lib/insights/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function dateToMs(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00`).getTime();
}

export function sortLogsAsc(logs: InsightLog[]): InsightLog[] {
  return [...logs].sort((a, b) => dateToMs(a.date) - dateToMs(b.date));
}

export function limitToLast90Days(logs: InsightLog[]): InsightLog[] {
  const sorted = sortLogsAsc(logs);
  if (sorted.length === 0) return [];
  const latest = dateToMs(sorted[sorted.length - 1].date);
  const minTs = latest - 89 * DAY_MS;
  return sorted.filter((log) => dateToMs(log.date) >= minTs);
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((acc, value) => acc + value, 0) / values.length;
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function buildNextMorningDeltas(
  logs: InsightLog[],
  predicate: (log: InsightLog) => boolean,
): { flagged: number[]; baseline: number[] } {
  const sorted = sortLogsAsc(logs);
  const flagged: number[] = [];
  const baseline: number[] = [];
  for (let idx = 0; idx < sorted.length - 1; idx += 1) {
    const current = sorted[idx];
    const next = sorted[idx + 1];
    const delta = next.morningWeight - current.morningWeight;
    if (predicate(current)) {
      flagged.push(delta);
    } else {
      baseline.push(delta);
    }
  }
  return { flagged, baseline };
}

export function daysBetween(startDate: string, endDate: string): number {
  return Math.ceil((dateToMs(endDate) - dateToMs(startDate)) / DAY_MS);
}
