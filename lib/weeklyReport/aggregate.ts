import type { DailyEntry, ProgressPhoto, UserSettings } from "../types";
import { addDaysKey, parseDateKey, sortEntriesByDateAsc } from "../calculations";
import { normalizeCoachTone } from "../coachTone";
import { isDateInInclusiveRange, weekWindowInclusive } from "./dateRange";
import type { WeeklyDayRollup, WeeklyReportAggregate } from "./types";

const MED_NOTE_RE =
  /\b(med|meds|medication|medicines?|pill|pills|tablet|dose|dosage|\bmg\b|\bmcg\b|prescription|\brx\b|side effect|side-effect|taper|insulin|ssri|snri|antibiotic|steroid)\b/i;

function notesMedicationHint(notes: string | null | undefined): boolean {
  if (!notes || !notes.trim()) return false;
  return MED_NOTE_RE.test(notes);
}

function hasAnyCheckIn(r: WeeklyDayRollup): boolean {
  return (
    r.hasMorningWeight ||
    r.hasCaloriesManual ||
    r.steps != null ||
    r.sleepHours != null ||
    r.mealEntryCount > 0 ||
    r.lateSnack ||
    r.highSodium ||
    r.workout ||
    r.alcohol ||
    r.hasNotes
  );
}

function enumerateDaysInclusive(start: string, end: string): string[] {
  const out: string[] = [];
  let d = start;
  const endT = parseDateKey(end);
  for (let i = 0; i < 14; i++) {
    out.push(d);
    if (parseDateKey(d) >= endT) break;
    d = addDaysKey(d, 1);
  }
  return out;
}

/** Minimal meal row for aggregation (avoids importing client API types). */
export type WeeklyMealAggRow = { kcal: number | null; proteinG: number | null };

export type WeeklyAggregateInput = {
  weekEnd: string;
  entries: DailyEntry[];
  mealsByDay?: Record<string, WeeklyMealAggRow[] | undefined>;
  photos?: ProgressPhoto[];
  settings: Pick<UserSettings, "unit" | "tone">;
};

export function buildWeeklyAggregate(input: WeeklyAggregateInput): WeeklyReportAggregate {
  const { weekStart, weekEnd } = weekWindowInclusive(input.weekEnd);
  const unit = input.settings.unit === "lbs" ? "lbs" : "kg";
  const tone = normalizeCoachTone(input.settings.tone);

  const entryByDate = new Map<string, DailyEntry>();
  for (const e of sortEntriesByDateAsc(input.entries)) {
    if (isDateInInclusiveRange(e.date, weekStart, weekEnd)) {
      entryByDate.set(e.date, e);
    }
  }

  const days: WeeklyDayRollup[] = [];
  let notesMedicationKeywordHits = 0;

  for (const date of enumerateDaysInclusive(weekStart, weekEnd)) {
    const e = entryByDate.get(date);
    const meals = input.mealsByDay?.[date] ?? [];
    let mealKcalSum = 0;
    let mealProteinGSum = 0;
    for (const m of meals) {
      if (m.kcal != null && Number.isFinite(m.kcal)) mealKcalSum += m.kcal;
      if (m.proteinG != null && Number.isFinite(m.proteinG)) mealProteinGSum += m.proteinG;
    }
    const notes = e?.notes;
    const medHint = notesMedicationHint(notes ?? undefined);
    if (medHint) notesMedicationKeywordHits += 1;

    const row: WeeklyDayRollup = {
      date,
      hasMorningWeight: e != null && Number.isFinite(e.morningWeight) && e.morningWeight > 0,
      morningWeight: e != null && Number.isFinite(e.morningWeight) ? e.morningWeight : null,
      hasCaloriesManual: e != null && e.calories != null && Number.isFinite(e.calories) && e.calories > 0,
      caloriesManual: e != null && e.calories != null ? e.calories : null,
      proteinManualG: e != null && e.protein != null ? e.protein : null,
      steps: e?.steps != null && Number.isFinite(e.steps) ? e.steps : null,
      sleepHours: e?.sleep != null && Number.isFinite(e.sleep) ? e.sleep : null,
      lateSnack: Boolean(e?.lateSnack),
      highSodium: Boolean(e?.highSodium),
      workout: Boolean(e?.workout),
      alcohol: Boolean(e?.alcohol),
      hasNotes: Boolean(notes && notes.trim().length > 0),
      notesMayReferenceMedication: medHint,
      mealEntryCount: meals.length,
      mealKcalSum,
      mealProteinGSum,
    };
    days.push(row);
  }

  const weighInDays = days.filter((d) => d.hasMorningWeight).length;
  const checkInDays = days.filter(hasAnyCheckIn).length;
  const mealEntriesTotal = days.reduce((s, d) => s + d.mealEntryCount, 0);

  let sumCaloriesManual = 0;
  let sumProteinManualG = 0;
  let sumMealKcal = 0;
  let sumMealProteinG = 0;
  const habitCounts = { lateSnack: 0, highSodium: 0, workout: 0, alcohol: 0 };
  const weightsSeq: number[] = [];

  for (const d of days) {
    if (d.caloriesManual != null) sumCaloriesManual += d.caloriesManual;
    if (d.proteinManualG != null) sumProteinManualG += d.proteinManualG;
    sumMealKcal += d.mealKcalSum;
    sumMealProteinG += d.mealProteinGSum;
    if (d.lateSnack) habitCounts.lateSnack += 1;
    if (d.highSodium) habitCounts.highSodium += 1;
    if (d.workout) habitCounts.workout += 1;
    if (d.alcohol) habitCounts.alcohol += 1;
    if (d.hasMorningWeight && d.morningWeight != null) weightsSeq.push(d.morningWeight);
  }

  const stepsVals = days.map((d) => d.steps).filter((v): v is number => v != null && v > 0);
  const sleepVals = days.map((d) => d.sleepHours).filter((v): v is number => v != null && v > 0);
  const avgSteps =
    stepsVals.length > 0 ? Math.round(stepsVals.reduce((a, b) => a + b, 0) / stepsVals.length) : null;
  const avgSleep =
    sleepVals.length > 0
      ? Math.round((sleepVals.reduce((a, b) => a + b, 0) / sleepVals.length) * 10) / 10
      : null;

  const weightFirst = weightsSeq.length ? weightsSeq[0]! : null;
  const weightLast = weightsSeq.length ? weightsSeq[weightsSeq.length - 1]! : null;
  const weightDelta =
    weightFirst != null && weightLast != null ? Math.round((weightLast - weightFirst) * 10) / 10 : null;

  let progressPhotosInWeek = 0;
  if (input.photos?.length) {
    for (const p of input.photos) {
      if (p.date && isDateInInclusiveRange(p.date, weekStart, weekEnd)) progressPhotosInWeek += 1;
    }
  }

  return {
    weekStart,
    weekEnd,
    unit,
    tone,
    days,
    weighInDays,
    checkInDays,
    mealEntriesTotal,
    sumCaloriesManual,
    sumProteinManualG,
    sumMealKcal,
    sumMealProteinG,
    avgSteps,
    avgSleep,
    habitCounts,
    weightFirst,
    weightLast,
    weightDelta,
    progressPhotosInWeek,
    notesMedicationKeywordHits,
  };
}
