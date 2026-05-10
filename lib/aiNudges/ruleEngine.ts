import type { AiNudge, AiNudgeCategory, NormalizedUserHealthSnapshot } from "@/lib/aiNudges/types";
import { countValidWeightDays, meanCaloriesLastNDays } from "@/lib/aiNudges/normalize";

const MIN_DAYS_FOR_NUDGES = 5;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function daysBetweenYmd(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.max(0, Math.round((b - a) / 86400000));
}

function confidenceFromSample(n: number, cap = 0.92): number {
  return Math.min(cap, 0.4 + Math.min(n, 30) * 0.018);
}

function lastNDays(days: NormalizedUserHealthSnapshot["days"], n: number) {
  return days.slice(-n);
}

function plateauNudge(snapshot: NormalizedUserHealthSnapshot, nowIso: string): AiNudge | null {
  const slice = lastNDays(snapshot.days, 14);
  if (slice.length < 10) return null;
  const wts = slice.map((d) => d.morningWeight);
  const min = Math.min(...wts);
  const max = Math.max(...wts);
  if (max - min > 0.45) return null;
  return {
    id: `nudge-plateau-${snapshot.asOfDate}`,
    title: "Weight has been unusually flat",
    message:
      "Morning weight stayed within a tight band recently. That can happen during steady phases or when logging timing is very consistent.",
    confidence: confidenceFromSample(slice.length, 0.88),
    supportingEvidence: [
      `Based on ${slice.length} morning weigh-ins between ${slice[0]?.date} and ${slice[slice.length - 1]?.date}`,
      `Range about ${round1(max - min)} kg — not medical interpretation, just your scale pattern`,
    ],
    category: "plateau",
    createdAt: nowIso,
    source: "rules",
  };
}

function meanMorning(slice: NormalizedUserHealthSnapshot["days"]): number | null {
  if (slice.length === 0) return null;
  return slice.reduce((s, x) => s + x.morningWeight, 0) / slice.length;
}

function weightTrendNudge(snapshot: NormalizedUserHealthSnapshot, nowIso: string): AiNudge | null {
  const d = snapshot.days;
  if (d.length < 14) return null;
  const prev7 = d.slice(-14, -7);
  const last7 = d.slice(-7);
  if (prev7.length < 7 || last7.length < 7) return null;
  const a = meanMorning(prev7);
  const b = meanMorning(last7);
  if (a == null || b == null) return null;
  const delta = b - a;
  if (Math.abs(delta) < 0.18) return null;
  const dir = delta < 0 ? "down" : "up";
  const cat: AiNudgeCategory = "weight_trend";
  return {
    id: `nudge-wtrend-${snapshot.asOfDate}`,
    title: dir === "down" ? "Recent week skews lighter" : "Recent week skews heavier",
    message:
      dir === "down"
        ? "Your average morning weight over the last 7 days is lower than the prior 7 — nice directional signal from your own logs."
        : "Your average morning weight over the last 7 days is higher than the prior 7 — worth noticing as a pattern, not a verdict.",
    confidence: confidenceFromSample(d.length),
    supportingEvidence: [
      `7-day average (most recent): ~${round1(b)} kg vs prior 7-day ~${round1(a)} kg`,
      `Compared using only your dated morning weights`,
    ],
    category: cat,
    createdAt: nowIso,
    source: "rules",
  };
}

function goalProgressNudge(snapshot: NormalizedUserHealthSnapshot, nowIso: string): AiNudge | null {
  const { startWeight, goalWeight, targetDate, days } = snapshot;
  if (days.length < MIN_DAYS_FOR_NUDGES) return null;
  const last = days[days.length - 1];
  if (!last) return null;
  const span = Math.abs(startWeight - goalWeight);
  if (span < 1) return null;
  const lossGoal = startWeight > goalWeight;
  const towardGoal = lossGoal
    ? startWeight - last.morningWeight
    : last.morningWeight - startWeight;
  const pct = Math.max(0, Math.min(1, towardGoal / span));
  const daysLeft = daysBetweenYmd(snapshot.asOfDate, targetDate);
  if (daysLeft <= 0) return null;
  const requiredPerWeek = ((1 - pct) * span) / Math.max(daysLeft / 7, 0.25);
  return {
    id: `nudge-goal-${snapshot.asOfDate}`,
    title: "Goal progress from your start weight",
    message: `You have logged roughly ${Math.round(pct * 100)}% of the weight change from your start toward your stated goal — computed only from weights you saved.`,
    confidence: confidenceFromSample(days.length, 0.9),
    supportingEvidence: [
      `Latest logged morning weight ~${round1(last.morningWeight)} kg on ${last.date}`,
      `Start ${round1(startWeight)} kg → goal ${round1(goalWeight)} kg; target date ${targetDate}`,
      `Rough implied average change needed if spread evenly: ~${round1(requiredPerWeek)} kg/week (informational)`,
    ],
    category: "goal_progress",
    createdAt: nowIso,
    source: "rules",
  };
}

function sleepNudge(snapshot: NormalizedUserHealthSnapshot, nowIso: string): AiNudge | null {
  const slice = lastNDays(snapshot.days, 14).filter((d) => d.sleep != null && d.sleep > 0);
  if (slice.length < 4) return null;
  const avg = slice.reduce((s, d) => s + (d.sleep ?? 0), 0) / slice.length;
  if (avg >= 6.5 && avg <= 8.2) return null;
  const low = avg < 6.5;
  return {
    id: `nudge-sleep-${snapshot.asOfDate}`,
    title: low ? "Sleep looks a bit short in your logs" : "Sleep is on the high side in your logs",
    message: low
      ? "Short sleep can line up with noisier hunger and energy — we are only describing what you logged, not diagnosing a condition."
      : "You logged more sleep than typical — could reflect recovery or different logging times.",
    confidence: confidenceFromSample(slice.length, 0.85),
    supportingEvidence: [
      `Average of ${slice.length} sleep entries in the last two weeks: ~${round1(avg)} h/night`,
      "Uses only the sleep hours you entered in Ojas",
    ],
    category: "sleep_recovery",
    createdAt: nowIso,
    source: "rules",
  };
}

function habitLateSnackNudge(snapshot: NormalizedUserHealthSnapshot, nowIso: string): AiNudge | null {
  const slice = lastNDays(snapshot.days, 14);
  const n = slice.filter((d) => d.lateSnack).length;
  if (n < 3) return null;
  return {
    id: `nudge-latesnack-${snapshot.asOfDate}`,
    title: "Late-snack pattern showing up",
    message:
      "You marked several late-snack evenings recently. If mornings feel harder on those days, consider a simple wind-down routine — still your choice.",
    confidence: confidenceFromSample(slice.length, 0.86),
    supportingEvidence: [
      `${n} evenings with “late snack” logged in the last 14 days`,
      "Counts only your boolean flags, not photos or meals",
    ],
    category: "habit_pattern",
    createdAt: nowIso,
    source: "rules",
  };
}

function nutritionCaloriesNudge(snapshot: NormalizedUserHealthSnapshot, nowIso: string): AiNudge | null {
  const avg7 = meanCaloriesLastNDays(snapshot.days, 7);
  const avgPrev = meanCaloriesLastNDays(snapshot.days.slice(0, -7), 7);
  if (avg7 == null || avgPrev == null) return null;
  const swing = Math.abs(avg7 - avgPrev) / Math.max(avgPrev, 1);
  if (swing < 0.18) return null;
  return {
    id: `nudge-kcal-${snapshot.asOfDate}`,
    title: "Calorie logging jumped between weeks",
    message:
      "Your average logged calories moved week-over-week. Big swings can make weight trends harder to read — not a judgment of “good” or “bad.”",
    confidence: 0.72,
    supportingEvidence: [
      `Approx 7-day average (recent) ~${Math.round(avg7)} kcal vs prior week ~${Math.round(avgPrev)} kcal`,
      "Uses calories on your daily entries when present",
    ],
    category: "nutrition_pattern",
    createdAt: nowIso,
    source: "rules",
  };
}

/**
 * Deterministic nudges from normalized logs. Returns [] if there is not enough weight signal.
 */
export function generateRuleBasedNudges(
  snapshot: NormalizedUserHealthSnapshot,
  nowIso: string = new Date().toISOString(),
): AiNudge[] {
  const n = countValidWeightDays(snapshot);
  if (n < MIN_DAYS_FOR_NUDGES) return [];

  const candidates: AiNudge[] = [];
  const p = plateauNudge(snapshot, nowIso);
  const w = weightTrendNudge(snapshot, nowIso);
  const g = goalProgressNudge(snapshot, nowIso);
  const s = sleepNudge(snapshot, nowIso);
  const h = habitLateSnackNudge(snapshot, nowIso);
  const k = nutritionCaloriesNudge(snapshot, nowIso);
  for (const x of [g, w, p, s, h, k]) {
    if (x) candidates.push(x);
  }

  const dedup = new Map<string, AiNudge>();
  for (const c of candidates) {
    dedup.set(c.category, c);
  }
  return [...dedup.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}
