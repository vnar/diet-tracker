import type { DailyEntry, Insight } from "./types";
import { nanoid } from "nanoid";
import {
  getYesterdayKey,
  weightDeltaKg,
  consecutiveDownDays,
  sortEntriesByDateAsc,
} from "./calculations";

const SEVERITY_ORDER: Record<string, number> = {
  warning: 0,
  success: 1,
  info: 2,
  neutral: 3,
};

function make(
  severity: Insight["severity"],
  message: string
): Insight {
  return { id: nanoid(), severity, message };
}

export function generateInsights(
  today: DailyEntry,
  yesterday: DailyEntry | null,
  last7: DailyEntry[]
): Insight[] {
  const insights: Insight[] = [];

  const uniqueDays = new Set(last7.map((e) => e.date)).size;
  if (uniqueDays < 2) {
    insights.push(
      make(
        "neutral",
        "Log a few days to unlock insights."
      )
    );
    return insights.slice(0, 3);
  }

  const delta = weightDeltaKg(today, yesterday);
  if (
    delta !== null &&
    delta >= 0.7 &&
    (today.highSodium || (today.sleep !== undefined && today.sleep < 6))
  ) {
    insights.push(
      make(
        "warning",
        "Weight spike likely water retention — sodium or sleep quality."
      )
    );
  }

  const downStreak = consecutiveDownDays(last7, today.date);
  if (downStreak >= 3) {
    insights.push(
      make("success", "Solid downward trend. Stay consistent.")
    );
  }

  if (today.protein !== undefined && today.protein < 60) {
    insights.push(
      make(
        "info",
        "Protein is low. Aim for 1.6–2g per kg to protect muscle."
      )
    );
  }

  if (today.lateSnack) {
    insights.push(
      make(
        "info",
        "Late-night eating shifts hunger hormones the next morning."
      )
    );
  }

  if (today.workout) {
    insights.push(
      make("success", "Training logged — great for consistency and metabolism.")
    );
  }

  if (today.alcohol) {
    insights.push(
      make(
        "info",
        "Alcohol adds calories and can disrupt sleep — hydrate and plan lighter meals."
      )
    );
  }

  if (today.sleep !== undefined && today.sleep < 6) {
    insights.push(
      make(
        "warning",
        "Under 6h sleep raises cortisol and cravings. Prioritize rest."
      )
    );
  }

  if (today.steps !== undefined && today.steps < 4000) {
    insights.push(
      make(
        "info",
        "Low movement today. Even a 20-min walk makes a difference."
      )
    );
  }

  const sorted = [...insights].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );

  return sorted.slice(0, 3);
}

export function lastSevenEntries(entries: DailyEntry[]): DailyEntry[] {
  const sorted = sortEntriesByDateAsc(entries);
  return sorted.slice(-7);
}

export function getYesterdayEntry(
  entries: DailyEntry[],
  todayDate: string
): DailyEntry | null {
  const y = getYesterdayKey(todayDate);
  return entries.find((e) => e.date === y) ?? null;
}
