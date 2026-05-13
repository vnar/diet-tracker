import { addDaysKey } from "@/lib/calculations";
import type { DailyEntry } from "@/lib/types";

/** Mean sleep hours over the last `dayCount` calendar days ending at `asOfDate` (only days with sleep &gt; 0). */
export function averageSleepLastDays(
  entries: DailyEntry[],
  asOfDate: string,
  dayCount: number,
): number | null {
  const byDate = new Map(entries.map((e) => [e.date, e]));
  let sum = 0;
  let n = 0;
  for (let i = 0; i < dayCount; i++) {
    const key = addDaysKey(asOfDate, -i);
    const e = byDate.get(key);
    if (e && typeof e.sleep === "number" && !Number.isNaN(e.sleep) && e.sleep > 0) {
      sum += e.sleep;
      n += 1;
    }
  }
  if (n === 0) return null;
  return sum / n;
}
