import { addDaysKey, sortEntriesByDateAsc } from "@/lib/calculations";
import type { DailyEntry } from "@/lib/types";
import { kgToInput } from "@/lib/units";

/**
 * Plain-text summary of recent logged days for sharing with a coach or partner.
 * Client-only; nothing is uploaded.
 */
export function buildCareShareSummaryLines(args: {
  entries: DailyEntry[];
  asOfDate: string;
  unit: "kg" | "lbs";
  days?: number;
}): string[] {
  const days = args.days ?? 7;
  const sorted = sortEntriesByDateAsc(args.entries);
  const byDate = new Map(sorted.map((e) => [e.date, e]));
  const lines: string[] = [
    "Ojas Health — recent log summary (not medical advice)",
    "Generated on-device from your entries. Verify before sharing.",
    "",
  ];
  let rows = 0;
  for (let i = 0; i < days; i++) {
    const d = addDaysKey(args.asOfDate, -i);
    const e = byDate.get(d);
    if (!e) continue;
    rows += 1;
    const w = kgToInput(e.morningWeight, args.unit).toFixed(1);
    const parts: string[] = [`${d}: morning ${w} ${args.unit}`];
    if (e.calories != null && !Number.isNaN(e.calories)) parts.push(`cal ${e.calories}`);
    if (e.protein != null && !Number.isNaN(e.protein)) parts.push(`protein ${Math.round(e.protein)} g`);
    if (e.sleep != null && !Number.isNaN(e.sleep) && e.sleep > 0) parts.push(`sleep ${e.sleep} h`);
    lines.push(parts.join(" · "));
  }
  if (rows === 0) {
    lines.push("(No entries in this window — log a few days first.)");
  }
  return lines;
}

export function buildCareShareSummaryText(args: Parameters<typeof buildCareShareSummaryLines>[0]): string {
  return buildCareShareSummaryLines(args).join("\n");
}
