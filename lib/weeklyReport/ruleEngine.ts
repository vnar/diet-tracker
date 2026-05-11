import type { CoachTone } from "@/lib/coachTone";
import type {
  WeeklyNextExperiment,
  WeeklyReportAggregate,
  WeeklyReportDocument,
  WeeklyReportSections,
} from "@/lib/weeklyReport/types";

function toneLead(tone: CoachTone, friendly: string, clinical: string, tough: string, ayur: string): string {
  switch (tone) {
    case "clinical":
      return clinical;
    case "tough-love":
      return tough;
    case "ayurvedic":
      return ayur;
    default:
      return friendly;
  }
}

function pickExperiment(agg: WeeklyReportAggregate): WeeklyNextExperiment {
  const { days, habitCounts, checkInDays, avgSleep, avgSteps, sumMealProteinG, sumProteinManualG } = agg;
  const proteinTotal = sumMealProteinG + sumProteinManualG;

  if (checkInDays <= 3) {
    return {
      kind: "daily_logging",
      title: "Seven-day logging streak",
      description:
        "For the next week, aim to leave at least one signal every day—morning weight, steps, or a single meal line. Consistency beats intensity for seeing trends.",
    };
  }

  if (avgSleep != null && avgSleep < 6.5) {
    return {
      kind: "sleep_rhythm",
      title: "Protect one sleep anchor",
      description:
        "Pick a fixed wind-down time for five nights and log sleep when you wake. You're not chasing perfection—just a steadier rhythm your appetite and training can lean on.",
    };
  }

  if (habitCounts.lateSnack >= 4) {
    return {
      kind: "late_snack_window",
      title: "Kitchen close experiment",
      description:
        "Choose three evenings with a firm “kitchen closed” time after dinner. Log whether late snack stayed off—small guardrails often show up in energy the next morning.",
    };
  }

  if (avgSteps != null && avgSteps < 5000 && days.some((d) => d.steps != null)) {
    return {
      kind: "steps_baseline",
      title: "Post-meal micro-walks",
      description:
        "After one meal each day, add a 8–12 minute easy walk and log steps. You're building a repeatable lever without overhauling your whole week.",
    };
  }

  if (proteinTotal > 0 && proteinTotal / Math.max(1, agg.mealEntriesTotal + agg.checkInDays) < 80) {
    return {
      kind: "protein_anchor",
      title: "Protein anchor meals",
      description:
        "Pick two meals per day where you anchor protein first (what you'd actually eat), log them, and repeat for seven days. The goal is pattern, not a perfect gram count.",
    };
  }

  return {
    kind: "habit_steady",
    title: "One habit, same time",
    description:
      "Choose one existing habit you already do sometimes (workout flag, steps, or sleep log) and tie it to a specific cue for seven days—same coffee mug, same alarm label. Repetition makes the next report easier to read.",
  };
}

function buildWhatChanged(agg: WeeklyReportAggregate, tone: CoachTone): string[] {
  const u = agg.unit === "lbs" ? "lb" : "kg";
  const lines: string[] = [];

  lines.push(
    toneLead(
      tone,
      `Here's the snapshot for ${agg.weekStart} through ${agg.weekEnd}—seven days in your own numbers.`,
      `Reporting window: ${agg.weekStart}–${agg.weekEnd} (local dates).`,
      `Week in review (${agg.weekStart} → ${agg.weekEnd}). No fluff—just what your logs say.`,
      `This week (${agg.weekStart} to ${agg.weekEnd}) read as a chapter in your rhythm—gentle facts from your entries.`,
    ),
  );

  if (agg.weighInDays >= 2 && agg.weightDelta != null && agg.weightFirst != null && agg.weightLast != null) {
    const dir = agg.weightDelta < 0 ? "down" : agg.weightDelta > 0 ? "up" : "flat";
    lines.push(
      toneLead(
        tone,
        `Morning weight moved ${dir}: about ${Math.abs(agg.weightDelta)} ${u} from the first to the last logged weigh-in this week (${agg.weighInDays} mornings on the books).`,
        `Morning weight delta (first to last logged weigh-in this week): ${agg.weightDelta} ${u} across ${agg.weighInDays} logged mornings.`,
        `Scale story: ${agg.weightDelta} ${u} net across ${agg.weighInDays} weigh-ins—trend, not verdict.`,
        `Your logged morning weights shifted by about ${agg.weightDelta} ${u} across ${agg.weighInDays} gentle check-ins—bodies drift; you're simply noting the breeze.`,
      ),
    );
  } else if (agg.weighInDays === 1) {
    lines.push(
      `Only one morning weight landed this week—enough to exist, not enough to call a trend. Another weigh-in or two will sharpen the picture.`,
    );
  } else {
    lines.push(
      toneLead(
        tone,
        `No morning weights this week, so we can't describe a weight trend from your logs.`,
        `Insufficient morning weight entries to summarize a trend.`,
        `No weigh-ins logged—if the scale matters to you, put it on the calendar for next week.`,
        `Morning weight was quiet this week—when you're ready, a few gentle weigh-ins will bring the rhythm back into view.`,
      ),
    );
  }

  lines.push(
    `Check-in coverage: ${agg.checkInDays}/7 days had at least one logged signal (weight, movement, sleep, meals, habits, or notes).`,
  );

  const kcalTotal = agg.sumCaloriesManual + agg.sumMealKcal;
  if (kcalTotal > 0 || agg.sumMealKcal > 0) {
    lines.push(
      `Calories: manual day totals summed to ${agg.sumCaloriesManual.toLocaleString()} kcal; meals you logged summed to about ${Math.round(agg.sumMealKcal).toLocaleString()} kcal (library/entries in range).`,
    );
  }
  const pTot = agg.sumProteinManualG + agg.sumMealProteinG;
  if (pTot > 0) {
    lines.push(`Protein: roughly ${Math.round(pTot)} g across manual fields plus meal rows in this window.`);
  }

  if (agg.avgSteps != null) {
    lines.push(`Steps (days logged): averaging about ${agg.avgSteps.toLocaleString()} steps on days with step entries.`);
  }
  if (agg.avgSleep != null) {
    lines.push(`Sleep (days logged): averaging about ${agg.avgSleep} hours where sleep was entered.`);
  }

  lines.push(
    `Habit toggles across the week — late snack: ${agg.habitCounts.lateSnack}, high sodium: ${agg.habitCounts.highSodium}, workout: ${agg.habitCounts.workout}, alcohol: ${agg.habitCounts.alcohol}.`,
  );

  if (agg.mealEntriesTotal > 0) {
    lines.push(`Meals logged (rows): ${agg.mealEntriesTotal} meal entries tied to these dates.`);
  }

  if (agg.progressPhotosInWeek > 0) {
    lines.push(
      `Progress photos: ${agg.progressPhotosInWeek} dated shot(s) in this week—nice context next to the numbers.`,
    );
  }

  if (agg.notesMedicationKeywordHits > 0) {
    lines.push(
      `Notes: on ${agg.notesMedicationKeywordHits} day(s) your text matched common medication-related keywords. We don't interpret that content—bring questions to your clinician.`,
    );
  }

  return lines;
}

function buildWhatHelped(agg: WeeklyReportAggregate, tone: CoachTone): string[] {
  const lines: string[] = [];
  if (agg.habitCounts.workout >= 3) {
    lines.push(
      toneLead(
        tone,
        `Movement showed up ${agg.habitCounts.workout} times—that kind of repeat effort supports energy and appetite regulation in real life, not just on paper.`,
        `Workout flag logged on ${agg.habitCounts.workout} days—sustained activity exposure in-window.`,
        `You punched the workout button ${agg.habitCounts.workout} times. That's discipline you can build on.`,
        `Workout days (${agg.habitCounts.workout}) added steadiness to your week—like keeping a small flame fed rather than chasing sparks.`,
      ),
    );
  }
  if (agg.avgSleep != null && agg.avgSleep >= 7) {
    lines.push(
      `Sleep averages looked solid where logged (~${agg.avgSleep} h)—recovery time often makes everything else easier to repeat.`,
    );
  }
  if (agg.checkInDays >= 6) {
    lines.push(
      toneLead(
        tone,
        `Logging almost every day is a quiet superpower—you're giving “future you” a clear trail to trust.`,
        `High logging cadence (${agg.checkInDays}/7) improves interpretability of trends.`,
        `Nearly daily logs? That's how adults win slow games.`,
        `Your consistency (${agg.checkInDays}/7) is the steady drum behind meaningful change.`,
      ),
    );
  }
  if (lines.length === 0) {
    lines.push(
      toneLead(
        tone,
        `Even a lighter week has wins—showing up to read this report is a nudge toward intention next week.`,
        `Limited positive signals in structured fields; next week's experiment can create clearer contrast.`,
        `No obvious “gold star” streaks this week—fine. Pick one lever and run it with intent.`,
        `Some weeks are sparse in the log—that's human. A small ritual next week can soften the noise.`,
      ),
    );
  }
  return lines;
}

function buildWhatHarder(agg: WeeklyReportAggregate, tone: CoachTone): string[] {
  const lines: string[] = [];
  if (agg.habitCounts.alcohol >= 3) {
    lines.push(
      `Alcohol was flagged on ${agg.habitCounts.alcohol} days—worth noticing how sleep and cravings felt on those nights (from your own notes, if you added any).`,
    );
  }
  if (agg.habitCounts.lateSnack >= 3) {
    lines.push(
      `Late snack showed up ${agg.habitCounts.lateSnack} times—if mornings felt sticky, this is one lever people often adjust gently.`,
    );
  }
  if (agg.checkInDays <= 4) {
    lines.push(
      toneLead(
        tone,
        `Coverage was patchy (${agg.checkInDays}/7 days)—not a moral issue, just harder for you (or a coach) to see what actually happened.`,
        `Sparse logging (${agg.checkInDays}/7) reduces confidence in inferred patterns.`,
        `Thin logs (${agg.checkInDays}/7). Next week: minimum viable check-in wins.`,
        `Gaps in the log (${agg.checkInDays}/7) can hide the story—invite a softer daily ritual, not a guilt trip.`,
      ),
    );
  }
  if (agg.avgSleep != null && agg.avgSleep < 6.5) {
    lines.push(
      `Sleep averages ran short where logged (~${agg.avgSleep} h)—short nights often stack with hunger and training quality; worth a humane experiment, not shame.`,
    );
  }
  if (lines.length === 0) {
    lines.push(
      toneLead(
        tone,
        `No strong “headwind” signals jumped out of the habit toggles—if it still felt hard, your notes (or energy) might hold the why; we only read structured fields here.`,
        `No dominant negative habit pattern detected from boolean fields; qualitative context may still matter.`,
        `Data didn't scream a villain this week—if it felt messy anyway, pick one variable to control next week.`,
        `The structured fields look mild—if the week felt heavy, trust that feeling; numbers are only one layer.`,
      ),
    );
  }
  return lines;
}

export function buildWeeklyReportFromRules(
  agg: WeeklyReportAggregate,
  generatedAtIso: string = new Date().toISOString(),
): WeeklyReportDocument {
  const tone: CoachTone = agg.tone;
  const nextExperiment = pickExperiment(agg);

  const sections: WeeklyReportSections = {
    title: toneLead(
      tone,
      "Your week, in coach mode",
      "Weekly structured summary",
      "Weekly debrief — data first",
      "Weekly reflection — steady and kind",
    ),
    subtitle: `${agg.weekStart} → ${agg.weekEnd} · ${tone.replace("-", " ")} tone`,
    whatChanged: buildWhatChanged(agg, tone),
    whatHelped: buildWhatHelped(agg, tone),
    whatHarder: buildWhatHarder(agg, tone),
    nextExperiment,
    disclaimers: [],
  };

  return {
    generatedAt: generatedAtIso,
    generationSource: "rules",
    aggregate: agg,
    sections,
  };
}
