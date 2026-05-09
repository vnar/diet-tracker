import type { DailyEntry } from "@/src/contracts/types";

export function parseDateKey(dateStr: string): number {
  return new Date(dateStr + "T12:00:00").getTime();
}

export function sortEntriesByDateAsc(entries: DailyEntry[]): DailyEntry[] {
  return [...entries].sort((a, b) => parseDateKey(a.date) - parseDateKey(b.date));
}

export function formatDateKeyLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function getTodayKey(): string {
  return formatDateKeyLocal(new Date());
}

export function getEntryForDate(entries: DailyEntry[], date: string): DailyEntry | undefined {
  return entries.find((e) => e.date === date);
}
