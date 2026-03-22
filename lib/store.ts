import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { DailyEntry, UserSettings } from "./types";
import { sortEntriesByDateAsc } from "./calculations";

export interface HealthStore {
  entries: DailyEntry[];
  settings: UserSettings;
  addEntry: (entry: DailyEntry) => void;
  updateEntry: (id: string, entry: Partial<DailyEntry>) => void;
  updateSettings: (s: Partial<UserSettings>) => void;
}

function defaultTargetDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 118);
  return d.toISOString().slice(0, 10);
}

const defaultSettings: UserSettings = {
  goalWeight: 72,
  startWeight: 85,
  targetDate: defaultTargetDate(),
  unit: "kg",
};

function upsertByDate(entries: DailyEntry[], entry: DailyEntry): DailyEntry[] {
  const rest = entries.filter((e) => e.date !== entry.date);
  return sortEntriesByDateAsc([...rest, entry]);
}

export const useHealthStore = create<HealthStore>()(
  persist(
    (set) => ({
      entries: [],
      settings: defaultSettings,
      addEntry: (entry) =>
        set((s) => ({
          entries: upsertByDate(s.entries, entry),
        })),
      updateEntry: (id, partial) =>
        set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id ? { ...e, ...partial } : e
          ),
        })),
      updateSettings: (partial) =>
        set((s) => ({
          settings: { ...s.settings, ...partial },
        })),
    }),
    {
      name: "healthos-data",
      storage: createJSONStorage(() => localStorage),
      skipHydration: true,
    }
  )
);
