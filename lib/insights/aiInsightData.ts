import { createHash } from "crypto";

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

export type MealDayTotal = { day: string; kcal: number; protein: number };

function dateToMs(dateKey: string): number {
  return new Date(`${dateKey}T12:00:00Z`).getTime();
}

export function sortEntriesAsc(entries: InsightEntryRow[]): InsightEntryRow[] {
  return [...entries].sort((a, b) => dateToMs(a.date) - dateToMs(b.date));
}

export function addDaysIso(dateStr: string, delta: number): string {
  const t = dateToMs(dateStr) + delta * 86400000;
  return new Date(t).toISOString().slice(0, 10);
}

export function round2(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Last N calendar days ending at `endDate` (inclusive). */
export function lastNDates(endDate: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) {
    out.push(addDaysIso(endDate, -i));
  }
  return out.reverse();
}

export function entryByDateMap(entries: InsightEntryRow[]): Map<string, InsightEntryRow> {
  const m = new Map<string, InsightEntryRow>();
  for (const e of entries) m.set(e.date, e);
  return m;
}

export function buildWeightLogTable(entriesAsc: InsightEntryRow[], maxRows: number): string {
  const tail = entriesAsc.slice(-maxRows).reverse();
  return tail
    .map((e) => {
      const night =
        e.nightWeight != null && Number.isFinite(e.nightWeight) ? round2(e.nightWeight) : "—";
      return `${e.date} · ${round2(e.morningWeight)} · ${night}`;
    })
    .join("\n");
}

export function buildHabitLogTable(entriesAsc: InsightEntryRow[], maxRows: number): string {
  const tail = entriesAsc.slice(-maxRows).reverse();
  return tail
    .map(
      (e) =>
        `${e.date} · workout=${e.workout ? 1 : 0} alcohol=${e.alcohol ? 1 : 0} late_snack=${e.lateSnack ? 1 : 0} high_sodium=${e.highSodium ? 1 : 0}`,
    )
    .join("\n");
}

export function buildMealLogTable(
  mealTotals: MealDayTotal[],
  entryMap: Map<string, InsightEntryRow>,
): string {
  const lines: string[] = [];
  for (const m of mealTotals) {
    const e = entryMap.get(m.day);
    const kcal = m.kcal > 0 ? m.kcal : e?.calories ?? 0;
    const prot = m.protein > 0 ? Math.round(m.protein * 10) / 10 : e?.protein ?? 0;
    lines.push(`${m.day} · ${kcal} · ${prot}`);
  }
  return lines.join("\n");
}

export function buildStepsLogTable(dates: string[], entryMap: Map<string, InsightEntryRow>): string {
  return dates
    .map((d) => {
      const e = entryMap.get(d);
      const s = e?.steps;
      return `${d} · ${s != null && Number.isFinite(s) ? s : "—"}`;
    })
    .join("\n");
}

export function buildSleepLogTable(dates: string[], entryMap: Map<string, InsightEntryRow>): string {
  return dates
    .map((d) => {
      const e = entryMap.get(d);
      const h = e?.sleep;
      return `${d} · ${h != null && Number.isFinite(h) ? round2(h) : "—"}`;
    })
    .join("\n");
}

export function countLateSnackInWindow(
  windowDates: string[],
  entryMap: Map<string, InsightEntryRow>,
): number {
  let c = 0;
  for (const d of windowDates) {
    if (entryMap.get(d)?.lateSnack) c += 1;
  }
  return c;
}

export function countWorkoutInWindow(
  windowDates: string[],
  entryMap: Map<string, InsightEntryRow>,
): number {
  let c = 0;
  for (const d of windowDates) {
    if (entryMap.get(d)?.workout) c += 1;
  }
  return c;
}

/** Average next-morning weight after days with late_snack on day D (morning on D+1). */
export function avgMorningAfterLateSnack(entriesAsc: InsightEntryRow[]): number | null {
  const byDate = entryByDateMap(entriesAsc);
  const vals: number[] = [];
  for (const e of entriesAsc) {
    if (!e.lateSnack) continue;
    const next = addDaysIso(e.date, 1);
    const nextE = byDate.get(next);
    if (nextE && nextE.morningWeight > 0) vals.push(nextE.morningWeight);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

export function avgMorningAfterNoLateSnack(entriesAsc: InsightEntryRow[]): number | null {
  const byDate = entryByDateMap(entriesAsc);
  const vals: number[] = [];
  for (const e of entriesAsc) {
    if (e.lateSnack) continue;
    const next = addDaysIso(e.date, 1);
    const nextE = byDate.get(next);
    if (nextE && nextE.morningWeight > 0) vals.push(nextE.morningWeight);
  }
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** Morning(D+1) - Morning(D) when workout on D. */
export function avgDeltaMorningAfterWorkout(entriesAsc: InsightEntryRow[]): number | null {
  const byDate = entryByDateMap(entriesAsc);
  const deltas: number[] = [];
  for (const e of entriesAsc) {
    if (!e.workout) continue;
    const next = addDaysIso(e.date, 1);
    const nextE = byDate.get(next);
    if (nextE && nextE.morningWeight > 0 && e.morningWeight > 0) {
      deltas.push(nextE.morningWeight - e.morningWeight);
    }
  }
  if (deltas.length === 0) return null;
  return deltas.reduce((a, b) => a + b, 0) / deltas.length;
}

export function currentSevenDayLossRateKgPerWeek(entriesAsc: InsightEntryRow[]): number | null {
  if (entriesAsc.length < 2) return null;
  const last = entriesAsc[entriesAsc.length - 1];
  const target = addDaysIso(last.date, -7);
  let best: InsightEntryRow | undefined;
  for (let i = entriesAsc.length - 1; i >= 0; i -= 1) {
    if (entriesAsc[i].date <= target) {
      best = entriesAsc[i];
      break;
    }
  }
  if (!best) best = entriesAsc[0];
  const delta = best.morningWeight - last.morningWeight;
  const days = Math.max(
    1,
    Math.round((dateToMs(last.date) - dateToMs(best.date)) / 86400000),
  );
  return (delta / days) * 7;
}

export function daysFromTo(fromDate: string, toDate: string): number {
  return Math.max(1, Math.round((dateToMs(toDate) - dateToMs(fromDate)) / 86400000));
}

export function requiredWeeklyLossRate(
  currentKg: number,
  targetKg: number,
  today: string,
  goalDate: string,
): number | null {
  if (currentKg <= targetKg) return 0;
  const weeks = daysFromTo(today, goalDate) / 7;
  if (!Number.isFinite(weeks) || weeks <= 0) return null;
  return (currentKg - targetKg) / weeks;
}

export function requiredDailyLoss(currentKg: number, targetKg: number, today: string, goalDate: string): string {
  if (currentKg <= targetKg) return round2(0);
  const days = daysFromTo(today, goalDate);
  return round2((currentKg - targetKg) / days);
}

export function sevenDayMorningAverage(entriesAsc: InsightEntryRow[]): number | null {
  if (entriesAsc.length === 0) return null;
  const last = entriesAsc[entriesAsc.length - 1];
  const windowStart = addDaysIso(last.date, -6);
  const inWin = entriesAsc.filter((e) => e.date >= windowStart && e.date <= last.date);
  if (inWin.length === 0) return null;
  const sum = inWin.reduce((a, e) => a + e.morningWeight, 0);
  return sum / inWin.length;
}

export function avgKcalOnWeightRiseDays(entriesAsc: InsightEntryRow[], mealByDay: Map<string, MealDayTotal>): number | null {
  const kcals: number[] = [];
  for (let i = 0; i < entriesAsc.length - 1; i += 1) {
    const d = entriesAsc[i];
    const next = entriesAsc[i + 1];
    if (next.morningWeight > d.morningWeight) {
      const meal = mealByDay.get(d.date);
      const manual = d.calories;
      const k = meal && meal.kcal > 0 ? meal.kcal : manual;
      if (k != null && Number.isFinite(k) && k > 0) kcals.push(k);
    }
  }
  if (kcals.length === 0) return null;
  return kcals.reduce((a, b) => a + b, 0) / kcals.length;
}

export function avgKcalOnWeightFallDays(entriesAsc: InsightEntryRow[], mealByDay: Map<string, MealDayTotal>): number | null {
  const kcals: number[] = [];
  for (let i = 0; i < entriesAsc.length - 1; i += 1) {
    const d = entriesAsc[i];
    const next = entriesAsc[i + 1];
    if (next.morningWeight < d.morningWeight) {
      const meal = mealByDay.get(d.date);
      const manual = d.calories;
      const k = meal && meal.kcal > 0 ? meal.kcal : manual;
      if (k != null && Number.isFinite(k) && k > 0) kcals.push(k);
    }
  }
  if (kcals.length === 0) return null;
  return kcals.reduce((a, b) => a + b, 0) / kcals.length;
}

export function avgSleepBeforeWeightDrop(entriesAsc: InsightEntryRow[]): number | null {
  const sleeps: number[] = [];
  for (let i = 0; i < entriesAsc.length - 1; i += 1) {
    const d = entriesAsc[i];
    const next = entriesAsc[i + 1];
    if (next.morningWeight < d.morningWeight && d.sleep != null && Number.isFinite(d.sleep)) {
      sleeps.push(d.sleep);
    }
  }
  if (sleeps.length === 0) return null;
  return sleeps.reduce((a, b) => a + b, 0) / sleeps.length;
}

export function avgSleepBeforeWeightRise(entriesAsc: InsightEntryRow[]): number | null {
  const sleeps: number[] = [];
  for (let i = 0; i < entriesAsc.length - 1; i += 1) {
    const d = entriesAsc[i];
    const next = entriesAsc[i + 1];
    if (next.morningWeight > d.morningWeight && d.sleep != null && Number.isFinite(d.sleep)) {
      sleeps.push(d.sleep);
    }
  }
  if (sleeps.length === 0) return null;
  return sleeps.reduce((a, b) => a + b, 0) / sleeps.length;
}

export function loggingStreaks(entriesAsc: InsightEntryRow[], today: string): {
  longest: number;
  current: number;
} {
  const set = new Set(entriesAsc.map((e) => e.date));
  let longest = 0;
  let run = 0;
  const sortedDates = [...set].sort((a, b) => dateToMs(a) - dateToMs(b));
  for (let i = 0; i < sortedDates.length; i += 1) {
    if (i === 0) {
      run = 1;
    } else {
      const prev = sortedDates[i - 1];
      const cur = sortedDates[i];
      if (addDaysIso(prev, 1) === cur) run += 1;
      else run = 1;
    }
    longest = Math.max(longest, run);
  }
  let current = 0;
  let d = today;
  while (set.has(d)) {
    current += 1;
    d = addDaysIso(d, -1);
  }
  return { longest, current };
}

export function buildAiInsightUserMessage(input: {
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
}): string {
  return `Analyze this person's health data and produce the insight card.

TODAY: ${input.today}
CURRENT WEIGHT: ${input.currentWeight} kg
7-DAY AVERAGE: ${input.sevenDayAvg} kg
STARTING WEIGHT: ${input.startWeight} kg
TARGET WEIGHT: ${input.targetWeight} kg
DAYS TO GOAL DATE: ${input.daysToGoal}
GOAL DATE: ${input.goalDate}
REQUIRED DAILY LOSS TO HIT GOAL: ${input.dailyLossNeeded} kg/day

WEIGHT LOG (most recent 30 entries, date · morning_kg · night_kg):
${input.weightLogTable}

HABIT LOG (most recent 30 days, date · habits checked):
${input.habitLogTable}

MEAL LOG (last 7 days, date · total_kcal · protein_g):
${input.mealLogTable}

STEPS LOG (last 14 days, date · steps or —):
${input.stepsLogTable}

SLEEP LOG (last 14 days, date · hours or —):
${input.sleepLogTable}

COMPUTED STATS (pre-calculate these in your handler):
- Days with late_snack logged ON in last 14 days: ${input.lateSnackCount14}
- Avg weight on mornings AFTER late snack: ${input.avgWeightAfterSnack} kg
- Avg weight on mornings WITHOUT late snack: ${input.avgWeightNoSnack} kg
- Days with workout logged in last 14 days: ${input.workoutCount14}
- Avg weight change on day AFTER workout: ${input.avgDeltaAfterWorkout} kg
- Current 7-day loss rate: ${input.weeklyLossRate} kg/week
- Required weekly loss rate to hit goal: ${input.requiredWeeklyRate} kg/week
- Longest logging streak: ${input.longestStreak} days
- Current logging streak: ${input.currentStreak} days
- Avg kcal on days where weight rose next morning: ${input.avgKcalRise} kcal
- Avg kcal on days where weight fell next morning: ${input.avgKcalFall} kcal
- Avg sleep on nights before weight dropped: ${input.avgSleepDrop} hrs
- Avg sleep on nights before weight rose: ${input.avgSleepRise} hrs

Now write the insight card. Be specific. Be brief. Be useful.`;
}

export function buildAiInsightFingerprint(input: {
  userId: string;
  latestDate: string;
  latestMorning: number;
  goalWeight: number;
  targetDate: string;
  mealDigest: string;
  habitTail: string;
}): string {
  const raw = [
    input.userId,
    input.latestDate,
    String(input.latestMorning),
    String(input.goalWeight),
    input.targetDate,
    input.mealDigest,
    input.habitTail,
  ].join("|");
  const h = createHash("sha256").update(raw).digest("hex").slice(0, 24);
  return `ai_insight_v1#${input.userId}#${h}`;
}
