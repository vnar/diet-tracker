import type { WeeklyReportDocument } from "@/lib/weeklyReport/types";

function dateFromKey(ymd: string): Date {
  return new Date(`${ymd}T12:00:00`);
}

/** e.g. May 4–10, 2026 when same month/year */
export function formatWeekRangePretty(weekStart: string, weekEnd: string): string {
  const a = dateFromKey(weekStart);
  const b = dateFromKey(weekEnd);
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
    const month = a.toLocaleDateString("en-US", { month: "long" });
    return `${month} ${a.getDate()}–${b.getDate()}, ${b.getFullYear()}`;
  }
  const left = a.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const right = b.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${left} – ${right}`;
}

export function formatGeneratedStamp(iso: string): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  return new Date(t).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Warm headline + tagline for email only (ignores clinical in-app title). */
export function humanEmailLead(doc: WeeklyReportDocument): { title: string; tagline: string } {
  const range = formatWeekRangePretty(doc.aggregate.weekStart, doc.aggregate.weekEnd);
  return {
    title: "Your week, in plain language",
    tagline: `${range} · Pulled from what you logged in Ojas—no score, just a snapshot you can actually use.`,
  };
}

/**
 * Human sentences for email (not the clinical/friendly split used in-app).
 * Built from aggregate so clinical tone in settings does not make the email feel like a lab report.
 */
export function buildHumanEmailWeeklyBullets(doc: WeeklyReportDocument, max: number = 6): string[] {
  const agg = doc.aggregate;
  const u = agg.unit === "lbs" ? "lb" : "kg";
  const lines: string[] = [];

  lines.push(
    `Between ${formatWeekRangePretty(agg.weekStart, agg.weekEnd)}, here's what your trail of check-ins suggests.`,
  );

  if (agg.weighInDays >= 2 && agg.weightDelta != null && agg.weightFirst != null && agg.weightLast != null) {
    const dir = agg.weightDelta < 0 ? "down" : agg.weightDelta > 0 ? "up" : "flat";
    lines.push(
      `Morning scale: about ${Math.abs(agg.weightDelta)} ${u} ${dir} from your first to last logged weigh-in (${agg.weighInDays} mornings). One chapter—not a final word.`,
    );
  } else if (agg.weighInDays === 1) {
    lines.push(
      `Only one morning weight this week—totally fine. A couple more weigh-ins next week will sketch a clearer curve.`,
    );
  } else {
    lines.push(`No morning weights logged—when you want weight in the story, a light routine of weigh-ins helps.`);
  }

  lines.push(
    `You showed up on ${agg.checkInDays} of 7 days with at least one signal (weight, movement, sleep, meals, habits, or notes). That steadiness matters.`,
  );

  const kcalTotal = agg.sumCaloriesManual + agg.sumMealKcal;
  if (kcalTotal > 0 || agg.sumMealKcal > 0) {
    lines.push(
      `Food energy in your log: roughly ${Math.round(agg.sumMealKcal).toLocaleString()} kcal from meals, plus ${agg.sumCaloriesManual.toLocaleString()} kcal from manual day lines.`,
    );
  }

  const pTot = agg.sumProteinManualG + agg.sumMealProteinG;
  if (pTot > 0 && lines.length < max) {
    lines.push(`Protein stacked to about ${Math.round(pTot)} g across meals and manual fields—fuel you actually recorded.`);
  }

  if (agg.avgSteps != null && lines.length < max) {
    lines.push(`Steps, where you logged them: about ${agg.avgSteps.toLocaleString()} on average—small movement adds up.`);
  }

  if (agg.avgSleep != null && lines.length < max) {
    lines.push(`Sleep, where you noted it: ~${agg.avgSleep} hours on average—recovery quietly shapes the rest of the week.`);
  }

  if (agg.habitCounts.workout >= 3 && lines.length < max) {
    lines.push(`Movement flagged on ${agg.habitCounts.workout} days—that kind of repeat is worth noticing.`);
  }

  if (agg.checkInDays >= 6 && lines.length < max) {
    lines.push(`Almost-daily logging is a gift to “future you”—trends get easier to trust when the trail is full.`);
  }

  if (agg.progressPhotosInWeek > 0 && lines.length < max) {
    lines.push(`${agg.progressPhotosInWeek} progress photo(s) in this window—nice context next to the numbers.`);
  }

  return lines.slice(0, max);
}

export function humanEmailFooterNote(doc: WeeklyReportDocument): string {
  const stamp = formatGeneratedStamp(doc.generatedAt);
  if (doc.aiInsightsForEmail?.length) {
    return `Prepared ${stamp} · Ojas Health · your entries + ${doc.aiInsightsForEmail.length} insight card(s)`;
  }
  return `Prepared ${stamp} · Ojas Health · from your entries`;
}
