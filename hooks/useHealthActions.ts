"use client";

import { useSession } from "next-auth/react";
import { sortEntriesByDateAsc } from "@/lib/calculations";
import { useHealthStore } from "@/lib/store";
import type { DailyEntry, UserSettings } from "@/lib/types";

function revertEntries(prev: DailyEntry[]) {
  useHealthStore.setState({ entries: prev });
}

function revertSettings(prev: UserSettings) {
  useHealthStore.setState({ settings: prev });
}

export function useSaveEntry() {
  const { status } = useSession();
  const addEntry = useHealthStore((s) => s.addEntry);

  return async (entry: DailyEntry): Promise<{ ok: boolean; error?: string }> => {
    const prev = useHealthStore.getState().entries;
    addEntry(entry);

    if (status !== "authenticated") {
      return { ok: true };
    }

    try {
      const res = await fetch("/api/entries", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });

      if (!res.ok) {
        revertEntries(prev);
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        return {
          ok: false,
          error: typeof err.error === "string" ? err.error : "Save failed",
        };
      }

      const data = (await res.json()) as { entry: DailyEntry };
      useHealthStore.setState((s) => ({
        entries: sortEntriesByDateAsc([
          ...s.entries.filter((e) => e.date !== data.entry.date),
          data.entry,
        ]),
      }));
      return { ok: true };
    } catch {
      revertEntries(prev);
      return { ok: false, error: "Network error" };
    }
  };
}

export function usePatchSettings() {
  const { status } = useSession();
  const updateSettings = useHealthStore((s) => s.updateSettings);

  return async (
    partial: Partial<UserSettings>
  ): Promise<{ ok: boolean; error?: string }> => {
    const state = useHealthStore.getState();
    const prev = state.settings;
    const next: UserSettings = { ...prev, ...partial };

    updateSettings(partial);

    if (status !== "authenticated") {
      return { ok: true };
    }

    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });

      if (!res.ok) {
        revertSettings(prev);
        const err = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        return {
          ok: false,
          error: typeof err.error === "string" ? err.error : "Update failed",
        };
      }

      const data = (await res.json()) as { settings: UserSettings };
      useHealthStore.setState({ settings: data.settings });
      return { ok: true };
    } catch {
      revertSettings(prev);
      return { ok: false, error: "Network error" };
    }
  };
}
