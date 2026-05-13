import { addDaysKey } from "@/lib/calculations";
import type { DailyEntry } from "@/lib/types";

/**
 * Current morning-weight logging streak ending near `asOfDate` (local YYYY-MM-DD).
 * If `asOfDate` has no weigh-in, we still count backward from yesterday so same-day
 * loggers are not penalized before they open the app.
 */
export function computeWeightLogStreak(entries: DailyEntry[], asOfDate: string): number {
  const logged = new Set<string>();
  for (const e of entries) {
    if (typeof e.morningWeight === "number" && e.morningWeight > 0 && e.date) {
      logged.add(e.date);
    }
  }
  let cursor = asOfDate;
  if (!logged.has(cursor)) {
    cursor = addDaysKey(asOfDate, -1);
  }
  let streak = 0;
  while (logged.has(cursor)) {
    streak += 1;
    cursor = addDaysKey(cursor, -1);
  }
  return streak;
}
