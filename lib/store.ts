import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { DailyEntry, UserSettings } from "./types";
import { sortEntriesByDateAsc } from "./calculations";

export interface HealthStore {
  entries: DailyEntry[];
  settings: UserSettings;
  addEntry: (entry: DailyEntry) => void;
  updateEntry: (id: string, entry: Partial<DailyEntry>) => void;
  updateSettings: (s: Partial<UserSettings>) => void;
  replaceEntriesAndSettings: (
    entries: DailyEntry[],
    settings: UserSettings
  ) => void;
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

function normalizeEntry(e: DailyEntry): DailyEntry {
  return {
    ...e,
    nightWeight: e.nightWeight == null ? undefined : e.nightWeight,
  };
}

function upsertByDate(entries: DailyEntry[], entry: DailyEntry): DailyEntry[] {
  const rest = entries.filter((e) => e.date !== entry.date);
  return sortEntriesByDateAsc([...rest, normalizeEntry(entry)]);
}

/** When true, skip localStorage read/write (server is source of truth). */
let cloudMode = false;

export function setHealthStorageMode(cloud: boolean) {
  cloudMode = cloud;
}

const healthPersistStorage: StateStorage = {
  getItem: (name) => {
    if (typeof window === "undefined") return null;
    if (cloudMode) return null;
    return localStorage.getItem(name);
  },
  setItem: (name, value) => {
    if (typeof window === "undefined") return;
    if (cloudMode) return;
    localStorage.setItem(name, value);
  },
  removeItem: (name) => {
    if (typeof window === "undefined") return;
    if (cloudMode) return;
    localStorage.removeItem(name);
  },
};

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
            e.id === id ? normalizeEntry({ ...e, ...partial }) : e
          ),
        })),
      updateSettings: (partial) =>
        set((s) => ({
          settings: { ...s.settings, ...partial },
        })),
      replaceEntriesAndSettings: (entries, settings) =>
        set({
          entries: sortEntriesByDateAsc(entries.map(normalizeEntry)),
          settings,
        }),
    }),
    {
      name: "healthos-data",
      storage: createJSONStorage(() => healthPersistStorage),
      skipHydration: true,
    }
  )
);
