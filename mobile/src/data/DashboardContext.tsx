import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/src/auth/AuthContext";
import { getEntries, getSettings, putEntry } from "@/src/api/ojasApi";
import type { DailyEntry, UserSettings } from "@/src/contracts/types";
import { sortEntriesByDateAsc } from "@/src/lib/entries";
import { isAwsBackendEnabled } from "@/src/config/env";
import { trackMobile } from "@/src/analytics/bridge";
import { captureMobileException } from "@/src/telemetry/sentry";

type DashboardContextValue = {
  entries: DailyEntry[];
  settings: UserSettings | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  saveEntry: (entry: DailyEntry) => Promise<{ ok: true } | { ok: false; error: string }>;
};

const DashboardContext = createContext<DashboardContextValue | undefined>(undefined);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const { status, getAccessToken } = useAuth();
  const [entries, setEntries] = useState<DailyEntry[]>([]);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isAwsBackendEnabled()) {
      setError(null);
      setEntries([]);
      setSettings(null);
      trackMobile("mobile_error", { where: "dashboard_refresh", reason: "backend_disabled" });
      return;
    }
    if (status !== "authenticated") return;
    const token = getAccessToken();
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const entriesResult = await getEntries(token);
      if (entriesResult.ok) {
        setEntries(sortEntriesByDateAsc(entriesResult.data.entries));
      } else {
        const retry = await getEntries(token);
        if (retry.ok) {
          setEntries(sortEntriesByDateAsc(retry.data.entries));
        } else {
          setError(retry.error);
          trackMobile("mobile_error", { where: "getEntries", message: retry.error });
          captureMobileException(new Error(retry.error), { where: "getEntries" });
        }
      }

      const settingsResult = await getSettings(token);
      if (settingsResult.ok) {
        setSettings(settingsResult.data.settings);
      } else {
        const retry = await getSettings(token);
        if (retry.ok) {
          setSettings(retry.data.settings);
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      trackMobile("mobile_error", { where: "dashboard_refresh", message });
      captureMobileException(e, { where: "dashboard_refresh" });
    } finally {
      setLoading(false);
    }
  }, [getAccessToken, status]);

  const saveEntry = useCallback(
    async (entry: DailyEntry): Promise<{ ok: true } | { ok: false; error: string }> => {
      if (!isAwsBackendEnabled()) {
        return { ok: false, error: "Couldn’t sync your data right now." };
      }
      const token = getAccessToken();
      if (!token) {
        return { ok: false, error: "Session expired. Sign in again." };
      }
      const res = await putEntry(entry, token);
      if (!res.ok) {
        return { ok: false, error: res.error };
      }
      const saved = res.data.entry;
      setEntries((prev) => {
        const idx = prev.findIndex((e) => e.date === saved.date);
        const next =
          idx >= 0 ? prev.map((e, i) => (i === idx ? saved : e)) : [...prev, saved];
        return sortEntriesByDateAsc(next);
      });
      return { ok: true };
    },
    [getAccessToken],
  );

  useEffect(() => {
    if (status === "authenticated") {
      void refresh();
    } else {
      setEntries([]);
      setSettings(null);
      setError(null);
    }
  }, [refresh, status]);

  const value = useMemo<DashboardContextValue>(
    () => ({
      entries,
      settings,
      loading,
      error,
      refresh,
      saveEntry,
    }),
    [entries, settings, loading, error, refresh, saveEntry],
  );

  return <DashboardContext.Provider value={value}>{children}</DashboardContext.Provider>;
}

export function useDashboard(): DashboardContextValue {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be used within DashboardProvider");
  return ctx;
}
