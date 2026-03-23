"use client";

import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { sortEntriesByDateAsc } from "@/lib/calculations";
import {
  getEntries,
  isAwsBackendEnabled,
  patchSettings,
  putEntry,
} from "@/lib/frontend-api-client";
import { useHealthStore } from "@/lib/store";
import type { DailyEntry, UserSettings } from "@/lib/types";

function revertEntries(prev: DailyEntry[]) {
  useHealthStore.setState({ entries: prev });
}

function revertSettings(prev: UserSettings) {
  useHealthStore.setState({ settings: prev });
}

export function useSaveEntry() {
  const { status, getAccessToken } = useCognitoAuth();
  const addEntry = useHealthStore((s) => s.addEntry);

  return async (entry: DailyEntry): Promise<{ ok: boolean; error?: string }> => {
    const prev = useHealthStore.getState().entries;
    addEntry(entry);

    if (!isAwsBackendEnabled()) {
      return { ok: true };
    }

    if (status !== "authenticated") {
      revertEntries(prev);
      return { ok: false, error: "Please sign in to sync cloud data." };
    }

    const accessToken = getAccessToken();
    if (!accessToken) {
      revertEntries(prev);
      return { ok: false, error: "Session expired. Please sign in again." };
    }

    try {
      const result = await putEntry(entry, accessToken);
      if (!result.ok) {
        revertEntries(prev);
        return {
          ok: false,
          error: result.error || "Save failed",
        };
      }

      const data = result.data as { entry: DailyEntry };
      const verify = await getEntries(accessToken);
      if (!verify.ok) {
        revertEntries(prev);
        return {
          ok: false,
          error: "Saved request sent, but cloud verification failed.",
        };
      }

      const persistedEntry = verify.data.entries.find((e) => e.date === data.entry.date);
      if (!persistedEntry) {
        revertEntries(prev);
        return {
          ok: false,
          error: "Cloud did not return your saved entry yet. Please retry.",
        };
      }

      useHealthStore.setState({
        entries: sortEntriesByDateAsc(verify.data.entries),
      });
      return { ok: true };
    } catch {
      revertEntries(prev);
      return { ok: false, error: "Network error" };
    }
  };
}

export function usePatchSettings() {
  const { status, getAccessToken } = useCognitoAuth();
  const updateSettings = useHealthStore((s) => s.updateSettings);

  return async (
    partial: Partial<UserSettings>
  ): Promise<{ ok: boolean; error?: string }> => {
    const state = useHealthStore.getState();
    const prev = state.settings;
    const next: UserSettings = { ...prev, ...partial };

    updateSettings(partial);

    if (!isAwsBackendEnabled()) {
      return { ok: true };
    }

    if (status !== "authenticated") {
      revertSettings(prev);
      return { ok: false, error: "Please sign in to sync cloud data." };
    }

    const accessToken = getAccessToken();
    if (!accessToken) {
      revertSettings(prev);
      return { ok: false, error: "Session expired. Please sign in again." };
    }

    try {
      const result = await patchSettings(next, accessToken);
      if (!result.ok) {
        revertSettings(prev);
        return {
          ok: false,
          error: result.error || "Update failed",
        };
      }

      const data = result.data as { settings: UserSettings };
      useHealthStore.setState({ settings: data.settings });
      return { ok: true };
    } catch {
      revertSettings(prev);
      return { ok: false, error: "Network error" };
    }
  };
}
