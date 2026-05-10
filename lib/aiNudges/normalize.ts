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

const WINDOW = 90;

function parseYmd(s: string): number {
  const t = Date.parse(`${s}T12:00:00Z`);
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Build a sorted, de-duplicated 90-day window of daily rows (last row per date wins).
 */
export function buildNormalizedHealthSnapshot(input: {
  asOfDate: string;
  entriesRaw: RawEntryForNudges[];
  goalWeight: number;
  startWeight: number;
  targetDate: string;
  recentAvgDailyCalories?: number | null;
}): NormalizedUserHealthSnapshot {
  const asOf = input.asOfDate.slice(0, 10);
  const asOfMs = parseYmd(asOf);
  const minMs = asOfMs - (WINDOW - 1) * 86400000;

  const byDate = new Map<string, NormalizedDailyRow>();
  for (const e of input.entriesRaw) {
    const d = e.date.slice(0, 10);
    if (!d || e.morningWeight <= 0) continue;
    const ms = parseYmd(d);
    if (ms < minMs || ms > asOfMs) continue;
    byDate.set(d, {
      date: d,
      morningWeight: e.morningWeight,
      nightWeight: e.nightWeight,
      calories: e.calories,
      protein: e.protein,
      steps: e.steps,
      sleep: e.sleep,
      lateSnack: e.lateSnack,
      highSodium: e.highSodium,
      workout: e.workout,
      alcohol: e.alcohol,
    });
  }

  const days = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  return {
    asOfDate: asOf,
    windowDays: WINDOW,
    days,
    goalWeight: input.goalWeight,
    startWeight: input.startWeight,
    targetDate: input.targetDate.slice(0, 10),
    recentAvgDailyCalories: input.recentAvgDailyCalories ?? null,
  };
}

export function countValidWeightDays(snapshot: NormalizedUserHealthSnapshot): number {
  return snapshot.days.filter((d) => d.morningWeight > 0).length;
}

export function meanCaloriesLastNDays(days: NormalizedDailyRow[], n: number): number | null {
  const slice = days.slice(-n).filter((d) => d.calories != null && d.calories > 0);
  if (slice.length < 2) return null;
  const sum = slice.reduce((s, d) => s + (d.calories ?? 0), 0);
  return sum / slice.length;
}
