import { beforeEach, describe, expect, it } from "vitest";
import { useHealthStore } from "@/lib/store";
import type { DailyEntry, UserSettings } from "@/lib/types";

const entryBase: Omit<DailyEntry, "id" | "date" | "morningWeight"> = {
  lateSnack: false,
  highSodium: false,
  workout: false,
  alcohol: false,
};

function makeEntry(date: string, morningWeight: number, id = date): DailyEntry {
  return {
    id,
    date,
    morningWeight,
    ...entryBase,
  };
}

const defaultSettings: UserSettings = {
  goalWeight: 72,
  startWeight: 85,
  targetDate: "2026-12-31",
  unit: "kg",
};

describe("health store", () => {
  beforeEach(() => {
    useHealthStore.setState({
      entries: [],
      settings: defaultSettings,
    });
  });

  it("upserts entries by date and keeps ascending date order", () => {
    const { addEntry } = useHealthStore.getState();
    addEntry(makeEntry("2026-03-20", 80));
    addEntry(makeEntry("2026-03-18", 81));
    addEntry(makeEntry("2026-03-19", 82));
    addEntry(makeEntry("2026-03-19", 79, "new-id"));

    const { entries } = useHealthStore.getState();
    expect(entries.map((e) => e.date)).toEqual([
      "2026-03-18",
      "2026-03-19",
      "2026-03-20",
    ]);
    expect(entries[1].id).toBe("new-id");
    expect(entries[1].morningWeight).toBe(79);
  });

  it("normalizes null fields to undefined on replacement", () => {
    const { replaceEntriesAndSettings } = useHealthStore.getState();
    replaceEntriesAndSettings(
      [
        {
          ...makeEntry("2026-03-21", 78),
          nightWeight: null,
          photoUrl: null,
          notes: null,
        },
      ],
      defaultSettings,
    );

    const entry = useHealthStore.getState().entries[0];
    expect(entry.nightWeight).toBeUndefined();
    expect(entry.photoUrl).toBeUndefined();
    expect(entry.notes).toBeUndefined();
  });
});
