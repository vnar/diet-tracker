import type { DailyEntry, UserSettings } from "@/src/contracts/types";

function newEntryId(): string {
  return `m${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Merge photo (or full patch) into today’s entry. If there is no entry yet, use last logged weight or settings.startWeight (API requires positive morningWeight).
 */
export function buildTodayEntryBase(
  today: string,
  existing: DailyEntry | undefined,
  allEntries: DailyEntry[],
  settings: UserSettings | null,
): { entry: DailyEntry } | { error: string } {
  const last = [...allEntries].sort((a, b) => b.date.localeCompare(a.date))[0];
  const morningWeight =
    existing?.morningWeight ?? last?.morningWeight ?? settings?.startWeight;
  if (morningWeight == null || morningWeight <= 0) {
    return {
      error:
        "Log your weight on the web first (or wait for today’s entry to sync), then you can add a photo.",
    };
  }
  const entry: DailyEntry = {
    id: existing?.id ?? newEntryId(),
    date: today,
    morningWeight,
    nightWeight: existing?.nightWeight,
    calories: existing?.calories,
    protein: existing?.protein,
    steps: existing?.steps,
    sleep: existing?.sleep,
    lateSnack: existing?.lateSnack ?? false,
    highSodium: existing?.highSodium ?? false,
    workout: existing?.workout ?? false,
    alcohol: existing?.alcohol ?? false,
    photoUrl: existing?.photoUrl,
    notes: existing?.notes,
  };
  return { entry };
}
