import { sortEntriesByDateAsc } from "@/lib/calculations";
import type { DailyEntry } from "@/lib/types";
import { kgToInput } from "@/lib/units";

function escapeCsvField(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatWeightForUnit(kg: number, unit: "kg" | "lbs"): string {
  return kgToInput(kg, unit).toFixed(1);
}

/**
 * RFC 4180-style CSV of weight history for spreadsheets (UTF-8 with BOM for Excel).
 * Weights are in the user's display unit (same as the dashboard).
 */
export function dailyEntriesToWeightCsv(entries: DailyEntry[], unit: "kg" | "lbs"): string {
  const sorted = sortEntriesByDateAsc([...entries]);
  const morningCol = unit === "kg" ? "morning_weight_kg" : "morning_weight_lbs";
  const nightCol = unit === "kg" ? "night_weight_kg" : "night_weight_lbs";
  const header = ["date", morningCol, nightCol, "notes"].join(",");
  const lines = [header];
  for (const e of sorted) {
    const morning = formatWeightForUnit(e.morningWeight, unit);
    const night =
      e.nightWeight != null && typeof e.nightWeight === "number" && !Number.isNaN(e.nightWeight)
        ? formatWeightForUnit(e.nightWeight, unit)
        : "";
    const notes = (e.notes ?? "").replace(/\r?\n/g, " ").trim();
    lines.push(
      [
        escapeCsvField(e.date),
        escapeCsvField(morning),
        escapeCsvField(night),
        escapeCsvField(notes),
      ].join(","),
    );
  }
  const body = lines.join("\r\n");
  return `\ufeff${body}`;
}
