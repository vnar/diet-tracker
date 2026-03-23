import type { DailyEntry as DbDailyEntry } from "@prisma/client";
import type { DailyEntry } from "@/lib/types";
import type { UserSettings } from "@/lib/types";
import type { UserSettings as DbUserSettings } from "@prisma/client";

export function mapDbEntry(row: DbDailyEntry): DailyEntry {
  return {
    id: row.id,
    date: row.date,
    morningWeight: row.morningWeight,
    nightWeight: row.nightWeight ?? undefined,
    calories: row.calories ?? undefined,
    protein: row.protein ?? undefined,
    steps: row.steps ?? undefined,
    sleep: row.sleep ?? undefined,
    lateSnack: row.lateSnack,
    highSodium: row.highSodium,
    workout: row.workout,
    alcohol: row.alcohol,
    photoUrl: row.photoUrl ?? undefined,
    notes: row.notes ?? undefined,
  };
}

export function mapDbSettings(row: DbUserSettings): UserSettings {
  return {
    goalWeight: row.goalWeight,
    startWeight: row.startWeight,
    targetDate: row.targetDate,
    unit: row.unit as UserSettings["unit"],
  };
}
