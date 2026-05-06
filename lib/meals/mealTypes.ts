export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack", "dessert"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export function isMealType(v: string): v is MealType {
  return (MEAL_TYPES as readonly string[]).includes(v);
}

/** Local wall-clock time in `timeZone` (IANA) → meal type when model returns null. */
export function inferMealTypeFromLocalTime(
  now: Date,
  timeZone: string,
): MealType {
  let hour = 12;
  let minute = 0;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(now);
    const h = parts.find((p) => p.type === "hour")?.value;
    const m = parts.find((p) => p.type === "minute")?.value;
    hour = h ? Number.parseInt(h, 10) : 12;
    minute = m ? Number.parseInt(m, 10) : 0;
    if (!Number.isFinite(hour) || hour < 0 || hour > 23) hour = 12;
    if (!Number.isFinite(minute) || minute < 0 || minute > 59) minute = 0;
  } catch {
    hour = now.getUTCHours();
    minute = now.getUTCMinutes();
  }

  const t = hour + minute / 60;
  if (t >= 4 && t < 10.5) return "breakfast";
  if (t >= 10.5 && t < 14.5) return "lunch";
  if (t >= 14.5 && t < 17.5) return "snack";
  if (t >= 17.5 && t < 22) return "dinner";
  return "snack";
}
