/**
 * Coach communication tone — templates when LLM is off. Factual lines stay in
 * `why` / `supportingEvidence`; we only restyle title/message (and insight action where noted).
 *
 * API + DynamoDB field: `tone` — friendly | clinical | tough-love | ayurvedic.
 */
import type { AiNudge, AiNudgeCategory } from "@/lib/aiNudges/types";
import type { Insight, InsightTone } from "@/lib/insights/types";

export type CoachTone = InsightTone;

export const COACH_TONE_OPTIONS: { value: CoachTone; label: string; hint: string }[] = [
  { value: "friendly", label: "Friendly", hint: "Warm, conversational coaching." },
  { value: "clinical", label: "Clinical", hint: "Factual, concise; no hype." },
  {
    value: "tough-love",
    label: "Tough love",
    hint: "Direct and motivating — never shaming.",
  },
  {
    value: "ayurvedic",
    label: "Ayurvedic-inspired",
    hint: "Rhythm and balance language — not a medical or dosha diagnosis.",
  },
];

export function normalizeCoachTone(value: string | undefined): CoachTone {
  if (value === "clinical" || value === "tough-love" || value === "ayurvedic") return value;
  return "friendly";
}

/** Map product / snake_case aliases to stored API values. */
export function parseCoachToneInput(raw: string | undefined): CoachTone | null {
  if (!raw) return null;
  const v = raw.trim().toLowerCase().replace(/_/g, "-");
  if (v === "toughlove" || v === "tough-love") return "tough-love";
  if (v === "clinical") return "clinical";
  if (v === "ayurvedic") return "ayurvedic";
  if (v === "friendly") return "friendly";
  return null;
}

type Row = { title: string; message: string };

const PLATEAU: Record<CoachTone, { headline: string; detail: string; action: string }> = {
  friendly: {
    headline: "Your weight trend has been fairly steady lately.",
    detail:
      "Over the stretch we looked at, your rolling average barely shifted compared with earlier. That happens often while a body settles—it's a pattern in your logs, not a medical read. If you want to nudge things, small, sustainable tweaks beat big swings.",
    action: "Consider one gentle change this week—or keep your routine and check back after a few more logs.",
  },
  clinical: {
    headline: "Rolling average weight change is small versus the prior window.",
    detail:
      "Compared rolling averages from your logged morning weights, the difference falls below your configured movement threshold. This is a descriptive statistic from your entries, not a diagnosis.",
    action: "If desired, adjust one logged variable (intake, activity, or sleep) and reassess after additional data.",
  },
  "tough-love": {
    headline: "Flat isn't failure — it's information.",
    detail:
      "Your averages barely moved across the window we checked. That can mean consistency—or that one lever needs a deliberate tweak. Pick one change you can repeat for two weeks.",
    action: "Choose one lever (sleep, steps, or calories), adjust modestly, and log daily so the next read is cleaner.",
  },
  ayurvedic: {
    headline: "A steady chapter in your weight rhythm.",
    detail:
      "Your rolling averages stayed close together—like a calm season in the body rather than a sharp swing. Gentle, sustainable shifts still tend to land better than abrupt ones.",
    action: "Honor steady routines; if you seek movement, shift one habit with patience and keep logging.",
  },
};

const STREAK: Record<CoachTone, { headline: string; detail: string; action: string }> = {
  friendly: {
    headline: "", // filled with milestone
    detail:
      "Consistency is one of your strongest predictors of progress. Keep the streak alive tomorrow.",
    action: "Lock in tomorrow’s weigh-in to keep streak momentum.",
  },
  clinical: {
    headline: "",
    detail:
      "Consecutive-day logging improves signal quality for trend analysis. Continue daily entries when feasible.",
    action: "Maintain daily logging to preserve data continuity.",
  },
  "tough-love": {
    headline: "",
    detail:
      "Streaks are built in boring moments. Show up again tomorrow and the graph stays on your side.",
    action: "Log tomorrow before the day ends — protect the chain.",
  },
  ayurvedic: {
    headline: "",
    detail:
      "Daily logging creates a trustworthy rhythm—like steady beats in a practice. That continuity supports clearer self-awareness over time.",
    action: "Continue your gentle daily check-in with the scale when it fits your day.",
  },
};

const BASELINE: Record<CoachTone, { headline: string; detail: string; action: string }> = {
  friendly: {
    headline: "Great consistency so far — keep logging daily for sharper insights.",
    detail: "We need a bit more signal to detect strong personal patterns, but your data flow is active.",
    action: "Keep tracking daily habits and weight to unlock stronger personalized insights.",
  },
  clinical: {
    headline: "Insufficient signal for high-confidence personalized rules.",
    detail:
      "Current log volume or pattern diversity is below thresholds used for stronger inferences. Continue structured logging.",
    action: "Maintain daily entries across weight and key habit fields to improve model inputs.",
  },
  "tough-love": {
    headline: "Keep stacking logs — the coach gets smarter when you do.",
    detail:
      "Not enough pattern yet for bold callouts. That is normal early on. Consistency beats intensity here.",
    action: "Hit another week of daily logs, then revisit insights.",
  },
  ayurvedic: {
    headline: "Your practice is forming — a little more time will deepen the picture.",
    detail:
      "Patterns emerge as your logs accumulate. Steady, kind attention to the basics matters more than perfect weeks.",
    action: "Continue your daily rhythm of logging; insights will sharpen naturally.",
  },
};

const NUDGE_BY_CAT: Record<
  Exclude<AiNudgeCategory, "goal_progress">,
  Record<CoachTone, Row> & { weightTrendUp?: Record<CoachTone, Row> }
> = {
  plateau: {
    friendly: {
      title: "Weight has been unusually flat",
      message:
        "Morning weight stayed within a tight band recently. That can happen during steady phases or when logging timing is very consistent.",
    },
    clinical: {
      title: "Plateau pattern in morning weights",
      message:
        "Recent morning weights show limited variation over the sampled window. This describes logged weights only, not a clinical plateau diagnosis.",
    },
    "tough-love": {
      title: "Your scale is whispering: hold steady",
      message:
        "Numbers barely budged — that can mean your routine is locked in. If you want more movement, pick one lever (sleep, steps, or calories) and adjust with intention, not guilt.",
    },
    ayurvedic: {
      title: "A steady season in your logs",
      message:
        "Your morning weights show a calm, stable rhythm lately — like a steady season rather than a sharp swing. Small, sustainable shifts still land better than abrupt ones.",
    },
  },
  weight_trend: {
    friendly: {
      title: "Recent week skews lighter",
      message:
        "Your average morning weight over the last 7 days is lower than the prior 7 — nice directional signal from your own logs.",
    },
    clinical: {
      title: "Seven-day mean weight decreased vs prior week",
      message:
        "Compared using only dated morning weights: the recent 7-day average is lower than the previous 7-day average.",
    },
    "tough-love": {
      title: "Down week — credit the work you already logged",
      message:
        "Seven-day average dipped versus the week before. That is momentum you earned in the data — keep showing up.",
    },
    ayurvedic: {
      title: "A lighter rhythm this week",
      message:
        "Your recent mornings lean a touch lighter than the week before — a gentle shift in the pattern your logs are drawing.",
    },
    weightTrendUp: {
      friendly: {
        title: "Recent week skews heavier",
        message:
          "Your average morning weight over the last 7 days is higher than the prior 7 — worth noticing as a pattern, not a verdict.",
      },
      clinical: {
        title: "Seven-day mean weight increased vs prior week",
        message:
          "Compared using only dated morning weights: the recent 7-day average is higher than the previous 7-day average.",
      },
      "tough-love": {
        title: "Up week — notice it, no spiral",
        message:
          "Seven-day average rose versus the week before. Treat it as signal from your logs, not a score on you — one steady week of basics can turn the curve.",
      },
      ayurvedic: {
        title: "A slightly heavier cadence this week",
        message:
          "Your logs show a modest upward shift week over week in morning weight — a pattern to observe with patience, not alarm.",
      },
    },
  },
  sleep_recovery: {
    friendly: {
      title: "Sleep looks a bit short in your logs",
      message:
        "Short sleep can line up with noisier hunger and energy — we are only describing what you logged, not diagnosing a condition.",
    },
    clinical: {
      title: "Below-average sleep duration in logs",
      message:
        "Mean self-reported sleep over the sampled window is under common healthy-sleep ranges. This reflects your entries only.",
    },
    "tough-love": {
      title: "Sleep is leaving money on the table",
      message:
        "Your logs show short nights stacking up. Protecting sleep is one of the highest-leverage habits for hunger and training — not a lecture, just the data you entered.",
    },
    ayurvedic: {
      title: "Evenings may be asking for more rest",
      message:
        "Your sleep entries suggest a shorter nightly rhythm lately. Honoring rest can support steadier energy and appetite — as reflected in your own logs.",
    },
    weightTrendUp: {
      friendly: {
        title: "Sleep is on the high side in your logs",
        message:
          "You logged more sleep than typical — could reflect recovery or different logging times.",
      },
      clinical: {
        title: "Above-average sleep duration in logs",
        message:
          "Mean self-reported sleep over the sampled window exceeds typical ranges. Interpretation depends on how and when you log.",
      },
      "tough-love": {
        title: "Big sleep numbers — use them if you trained hard",
        message:
          "You logged generous sleep. If training load was high, that can be appropriate; if not, check whether logging times shifted.",
      },
      ayurvedic: {
        title: "A spacious night rhythm in your entries",
        message:
          "Your logs show more sleep than usual — sometimes the body asks for extra recovery; sometimes logging shifts. Either way, it is your pattern to read gently.",
      },
    },
  },
  habit_pattern: {
    friendly: {
      title: "Late-snack pattern showing up",
      message:
        "You marked several late-snack evenings recently. If mornings feel harder on those days, consider a simple wind-down routine — still your choice.",
    },
    clinical: {
      title: "Frequent late-snack flags",
      message:
        "Multiple late-snack indicators in the recent window. This is derived from boolean flags you saved, not from meals or photos.",
    },
    "tough-love": {
      title: "Late snacks are showing up in the scoreboard",
      message:
        "You flagged late snacks often. If energy or hunger feels off, try moving calories earlier once or twice this week — small experiment, no shame.",
    },
    ayurvedic: {
      title: "Evening nourishment showing often in your flags",
      message:
        "Your logs note several late-snack evenings. If that rhythm feels heavy, a lighter, earlier evening pattern might balance your day — your call.",
    },
  },
  nutrition_pattern: {
    friendly: {
      title: "Calorie logging jumped between weeks",
      message:
        "Your average logged calories moved week-over-week. Big swings can make weight trends harder to read — not a judgment of “good” or “bad.”",
    },
    clinical: {
      title: "Material week-over-week change in mean logged calories",
      message:
        "Seven-day average calorie entries differ materially from the prior week. Uses daily entry calories when present.",
    },
    "tough-love": {
      title: "Calories swung hard week to week",
      message:
        "Your logged intake moved a lot between weeks. If the scale feels noisy, tightening consistency (even roughly) can make cause-and-effect easier to read.",
    },
    ayurvedic: {
      title: "Calorie rhythm shifted between weeks",
      message:
        "Your logged intake shows a noticeable swing week over week. Steadier fueling often reads as steadier signals on the scale — still your journey to pace.",
    },
  },
};

function weightTrendIsUp(nudge: AiNudge): boolean {
  return (
    nudge.title.includes("heavier") ||
    nudge.message.includes("higher than the prior") ||
    nudge.message.includes("higher than the prior 7")
  );
}

function sleepIsHigh(nudge: AiNudge): boolean {
  return nudge.title.includes("high side") || nudge.message.includes("more sleep than typical");
}

const GOAL_TITLES: Record<CoachTone, string> = {
  friendly: "Goal progress from your start weight",
  clinical: "Progress toward logged goal weight",
  "tough-love": "Goal distance — you have chipped away at it",
  ayurvedic: "Movement along the goal path you set",
};

export function applyCoachToneToAiNudge(nudge: AiNudge, tone: CoachTone): AiNudge {
  const t = normalizeCoachTone(tone);
  if (t === "friendly") return nudge;

  /** Goal nudge message includes computed % — never replace body copy. */
  if (nudge.category === "goal_progress") {
    return { ...nudge, title: GOAL_TITLES[t] ?? nudge.title };
  }

  let row: Row | undefined;
  const cat = nudge.category;
  const block = NUDGE_BY_CAT[cat];
  if (!block) return nudge;

  if (cat === "weight_trend" && weightTrendIsUp(nudge)) {
    row = block.weightTrendUp?.[t];
  } else if (cat === "sleep_recovery" && sleepIsHigh(nudge)) {
    row = block.weightTrendUp?.[t];
  } else {
    row = block[t] as Row;
  }

  if (!row) return nudge;
  return {
    ...nudge,
    title: row.title,
    message: row.message,
  };
}

export function applyCoachToneToAiNudges(nudges: AiNudge[], tone: CoachTone | undefined): AiNudge[] {
  const t = normalizeCoachTone(tone);
  return nudges.map((n) => applyCoachToneToAiNudge(n, t));
}

function streakMilestoneFromInsight(ins: Insight): number | null {
  const m = ins.id.match(/^streak-(\d+)-/);
  if (m) return Number(m[1]);
  const line = ins.why.find((w) => w.includes("Milestone reached:"));
  if (line) {
    const mm = line.match(/(\d+)\s*days/);
    if (mm) return Number(mm[1]);
  }
  return null;
}

export function applyCoachToneToInsight(ins: Insight, tone: CoachTone): Insight {
  const t = normalizeCoachTone(tone);
  if (t === "friendly") return ins;

  if (ins.category === "plateau") {
    const p = PLATEAU[t];
    return { ...ins, headline: p.headline, detail: p.detail, action: p.action, why: ins.why };
  }

  if (ins.category === "streak") {
    const m = streakMilestoneFromInsight(ins) ?? 7;
    const s = STREAK[t];
    const headline =
      t === "clinical"
        ? `${m}-day consecutive logging streak.`
        : t === "tough-love"
          ? `${m}-day streak — keep the chain.`
          : t === "ayurvedic"
            ? `${m} days of steady logging — a grounded rhythm.`
            : `${m}-day logging streak. Nice work.`;
    return {
      ...ins,
      headline,
      detail: s.detail,
      action: s.action,
      why: ins.why,
    };
  }

  if (ins.ruleId === "baseline") {
    const b = BASELINE[t];
    return { ...ins, headline: b.headline, detail: b.detail, action: b.action, why: ins.why };
  }

  return ins;
}

export function weeklyEnergyCoachLine(
  trend: "deficit" | "surplus" | "near_maintenance",
  avgNetKcal: number,
  tone: CoachTone,
): string {
  const t = normalizeCoachTone(tone);
  const net = Math.round(avgNetKcal);
  const base = `Trailing 7-day average net energy (logged intake minus estimated burn) is about ${net} kcal/day; trend class: ${trend}.`;

  if (t === "clinical") return base;

  if (trend === "deficit") {
    if (t === "friendly")
      return `Your last week averaged about ${net} kcal/day below estimated burn — a deficit pattern in your logs. Keep fueling enough for training and recovery.`;
    if (t === "tough-love")
      return `Last week you averaged roughly ${net} kcal/day under burn — that is real deficit territory in the data. Make sure strength and sleep stay protected while you run it.`;
    return `Your week leaned into a gentle deficit rhythm (~${net} kcal/day net). Steady nourishment and rest still matter alongside the trend your entries show.`;
  }
  if (trend === "surplus") {
    if (t === "friendly")
      return `Your last week averaged about ${net} kcal/day above estimated burn — a surplus pattern in your logs.`;
    if (t === "tough-love")
      return `Roughly ${net} kcal/day over burn last week — call it what it is in the numbers, then decide if that matches your intent.`;
    return `The past week shows a surplus cadence (~${net} kcal/day net). If that aligns with your goals, fine; if not, small pacing shifts can rebalance.`;
  }
  if (t === "friendly")
    return `Net energy last week hovered near balance (~${net} kcal/day vs burn estimates) — maintenance-ish in your logs.`;
  if (t === "tough-love")
    return `You basically ran even last week (~${net} kcal/day net). Maintenance is a valid target — just name it so expectations match the scale.`;
  return `Your week sat near equilibrium (~${net} kcal/day net) — a balanced rhythm in the entries you saved.`;
}
