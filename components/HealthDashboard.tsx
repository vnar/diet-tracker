"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { DailyInput } from "@/components/DailyInput";
import { FoodPhotoCaloriesAccessory } from "@/components/v2/food/FoodPhotoCaloriesAccessory";
import { AddFromLibrarySheet } from "@/components/v2/meals/AddFromLibrarySheet";
import { FrequentMealsCarousel } from "@/components/v2/meals/FrequentMealsCarousel";
import { MealsTodayPanel } from "@/components/v2/meals/MealsTodayPanel";
import { DashboardKpiRow } from "@/components/DashboardKpiRow";
import { WeightChart } from "@/components/WeightChart";
import { AIInsights } from "@/components/AIInsights";
import { PhotoTracker } from "@/components/PhotoTracker";
import { WeightHistoryTable } from "@/components/WeightHistoryTable";
import { PastDayGrid } from "@/components/PastDayGrid";
import { TodayActivityCard } from "@/components/TodayActivityCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthBar } from "@/components/AuthBar";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { getDayMealEntries, getSettings, isAwsBackendEnabled, type DayMealEntryRow } from "@/lib/frontend-api-client";
import { useHealthStore } from "@/lib/store";
import { usePatchSettings } from "@/hooks/useHealthActions";
import { Settings, Users } from "lucide-react";
import { AdminUsersPanel } from "@/components/AdminUsersPanel";
import { isAppAdminViewer } from "@/lib/admin";
import { isMealLibraryEnabled, isPhotoFoodLogEnabled } from "@/lib/featureFlags";
import { useFeatureFlagOverridesEpoch } from "@/hooks/useFeatureFlagOverridesEpoch";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";
import { getEntryForDate } from "@/lib/calculations";
import { getDayTotals } from "@/lib/meals/dayTotals";
import { track } from "@/lib/analytics";
import { goalEditedFieldNames } from "@/lib/weightTrendAnalytics";

const fadeInUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

export function HealthDashboard() {
  useFeatureFlagOverridesEpoch();
  const todayKey = useClientTodayKey();
  const entries = useHealthStore((s) => s.entries);
  const settings = useHealthStore((s) => s.settings);
  const unit = settings.unit;
  const entryCount = useHealthStore((s) => s.entries.length);
  const patchSettings = usePatchSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [startWeight, setStartWeight] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(false);
  const { status, getAccessToken, user } = useCognitoAuth();
  const [adminUsersOpen, setAdminUsersOpen] = useState(false);
  const showAdminUsers = isAppAdminViewer(user?.email);
  const [mealEntries, setMealEntries] = useState<DayMealEntryRow[]>([]);
  const [mealRefreshEpoch, setMealRefreshEpoch] = useState(0);

  const refreshMeals = useCallback(() => {
    setMealRefreshEpoch((n) => n + 1);
  }, []);

  const todayEntry = todayKey ? getEntryForDate(entries, todayKey) : undefined;

  useEffect(() => {
    if (
      status !== "authenticated" ||
      !todayKey ||
      !isAwsBackendEnabled() ||
      !user?.id ||
      !isMealLibraryEnabled(user.id)
    ) {
      setMealEntries([]);
      return;
    }
    const token = getAccessToken();
    if (!token) return;
    void getDayMealEntries(todayKey, token).then((r) => {
      if (r.ok) setMealEntries(r.data.items);
    });
  }, [status, todayKey, user?.id, mealRefreshEpoch]);

  const caloriesProteinAggregate = useMemo(() => {
    if (!user?.id || !isMealLibraryEnabled(user.id) || !todayKey) return null;
    const totals = getDayTotals({
      mealLibraryEnabled: true,
      mealEntries: mealEntries.map((e) => ({
        kcal: e.kcal != null ? Number(e.kcal) : null,
        proteinG: e.proteinG != null ? Number(e.proteinG) : null,
        deletedAt: undefined,
      })),
      manualCalories: todayEntry?.calories,
      manualProtein: todayEntry?.protein,
    });
    if (!totals.fromMeals) return null;
    return {
      calories: totals.caloriesDisplay,
      protein: totals.proteinDisplay,
      readOnly: true as const,
      caption:
        "Totals reflect what you've logged today — edit or remove any meal above.",
    };
  }, [user?.id, todayKey, mealEntries, todayEntry?.calories, todayEntry?.protein]);

  useEffect(() => {
    setStartWeight(String(settings.startWeight));
    setGoalWeight(String(settings.goalWeight));
    setTargetDate(settings.targetDate);
  }, [settings]);

  async function refreshSettingsFromCloud(options?: {
    applyToForm?: boolean;
  }): Promise<{
    ok: boolean;
    settings?: {
      goalWeight: number;
      startWeight: number;
      targetDate: string;
      unit: "kg" | "lbs";
    };
    error?: string;
  }> {
    if (!isAwsBackendEnabled() || status !== "authenticated") return { ok: false };
    const accessToken = getAccessToken();
    if (!accessToken) return { ok: false, error: "Session expired. Please sign in again." };

    setLoadingSettings(true);
    const result = await getSettings(accessToken);
    setLoadingSettings(false);
    if (!result.ok) return { ok: false, error: result.error };

    useHealthStore.setState({ settings: result.data.settings });
    if (options?.applyToForm !== false) {
      setStartWeight(String(result.data.settings.startWeight));
      setGoalWeight(String(result.data.settings.goalWeight));
      setTargetDate(result.data.settings.targetDate);
    }
    return { ok: true, settings: result.data.settings };
  }

  async function handleSaveSettings() {
    const start = Number.parseFloat(startWeight);
    const goal = Number.parseFloat(goalWeight);
    if (!Number.isFinite(start) || start <= 0) {
      setSettingsError("Starting weight must be a positive number.");
      return;
    }
    if (!Number.isFinite(goal) || goal <= 0) {
      setSettingsError("Target weight must be a positive number.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
      setSettingsError("Target date is required.");
      return;
    }

    const prevSettings = useHealthStore.getState().settings;

    setSettingsError(null);
    setSavingSettings(true);
    const result = await patchSettings({
      startWeight: start,
      goalWeight: goal,
      targetDate,
    });
    setSavingSettings(false);

    if (!result.ok) {
      setSettingsError(result.error ?? "Could not update settings.");
      return;
    }
    const refreshed = await refreshSettingsFromCloud({ applyToForm: false });
    if (!refreshed.ok || !refreshed.settings) {
      setSettingsError(
        refreshed.error ?? "Saved, but could not verify cloud state. Refresh and retry."
      );
      return;
    }

    const matchesCloud =
      refreshed.settings.startWeight === start &&
      refreshed.settings.goalWeight === goal &&
      refreshed.settings.targetDate === targetDate;

    if (!matchesCloud) {
      setSettingsError(
        "Cloud settings did not match your latest save. Please try once more."
      );
      return;
    }

    const editedFields = goalEditedFieldNames(prevSettings, {
      startWeight: start,
      goalWeight: goal,
      targetDate,
    });
    if (editedFields.length > 0) {
      track("goal_edited", {
        fields: editedFields,
        source: "settings_modal",
      });
    }

    setSettingsOpen(false);
  }

  return (
    <main className="p-2">
      <div className="ojas-shell">
        <header className="ojas-topnav">
          <div className="ojas-brand">
            <span className="ojas-logo">Ojas</span>
            <span className="ojas-brand-sub">Health · by Vihar Nar</span>
          </div>
          <nav className="ojas-nav-pills">
            <Link href="/" className="ojas-nav-pill active">Dashboard</Link>
            <button className="ojas-nav-pill" type="button">History</button>
            <Link href="/meals" className="ojas-nav-pill">Meals</Link>
            {showAdminUsers ? (
              <button className="ojas-nav-pill" type="button" onClick={() => setAdminUsersOpen(true)}>Users</button>
            ) : (
              <button className="ojas-nav-pill" type="button">Users</button>
            )}
            <button
              className="ojas-nav-pill"
              type="button"
              onClick={() => {
                setSettingsOpen(true);
                void refreshSettingsFromCloud();
              }}
            >
              Settings
            </button>
          </nav>
          <div className="flex items-center gap-2">
            <span className="ojas-status-pill"><span className="ojas-pulse-dot" /> AWS live</span>
            <button
              type="button"
              onClick={() => void patchSettings({ unit: unit === "kg" ? "lbs" : "kg" })}
              className="text-[11px]"
              style={{ color: "var(--mu2)" }}
            >
              {unit}
            </button>
            <div className="ojas-nav-aux">
              {showAdminUsers ? (
                <button className="ojas-nav-pill" type="button" onClick={() => setAdminUsersOpen(true)}>
                  Admin
                </button>
              ) : null}
            </div>
            <ThemeToggle />
            <AuthBar compact />
          </div>
        </header>

        <div className="ojas-body-grid">
          <section className="ojas-col ojas-left">
            <motion.div {...fadeInUp}>
              <DashboardKpiRow />
            </motion.div>
            <motion.div {...fadeInUp} className="ojas-card">
              <DailyInput
                caloriesProteinAggregate={caloriesProteinAggregate}
                renderCaloriesAccessory={
                  status === "authenticated" &&
                  isAwsBackendEnabled() &&
                  user?.id &&
                  isPhotoFoodLogEnabled(user.id)
                    ? (ctx) => (
                        <div className="flex shrink-0 items-center gap-1">
                          {isMealLibraryEnabled(user.id) ? (
                            <AddFromLibrarySheet
                              day={ctx.todayKey}
                              getAccessToken={getAccessToken}
                              onAdded={refreshMeals}
                            />
                          ) : null}
                          <FoodPhotoCaloriesAccessory
                            {...ctx}
                            getAccessToken={getAccessToken}
                            mealLibraryEnabled={isMealLibraryEnabled(user.id)}
                            onMealsChanged={refreshMeals}
                          />
                        </div>
                      )
                    : undefined
                }
              />
            </motion.div>
            {status === "authenticated" &&
            isAwsBackendEnabled() &&
            user?.id &&
            isMealLibraryEnabled(user.id) &&
            todayKey ? (
              <motion.div {...fadeInUp}>
                <FrequentMealsCarousel day={todayKey} getAccessToken={getAccessToken} onLogged={refreshMeals} />
              </motion.div>
            ) : null}
          </section>

          <section className="ojas-col ojas-center">
            <motion.div {...fadeInUp}>
              <WeightChart />
            </motion.div>
            {status === "authenticated" &&
            isAwsBackendEnabled() &&
            user?.id &&
            isMealLibraryEnabled(user.id) &&
            todayKey ? (
              <motion.div {...fadeInUp}>
                <MealsTodayPanel
                  day={todayKey}
                  entries={mealEntries}
                  getAccessToken={getAccessToken}
                  onChanged={refreshMeals}
                />
              </motion.div>
            ) : null}
            <motion.div {...fadeInUp}>
              <PastDayGrid />
            </motion.div>
            {entryCount > 0 ? (
              <motion.div {...fadeInUp}>
                <WeightHistoryTable />
              </motion.div>
            ) : null}
          </section>

          <section className="ojas-col ojas-right">
            <motion.div {...fadeInUp}>
              <AIInsights />
            </motion.div>
            <motion.div {...fadeInUp}>
              <TodayActivityCard />
            </motion.div>
            <motion.div {...fadeInUp}>
              <PhotoTracker />
            </motion.div>
          </section>
        </div>
      </div>

      <AdminUsersPanel open={adminUsersOpen} onClose={() => setAdminUsersOpen(false)} />

      {settingsOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-lg rounded-2xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl sm:p-6">
            <div className="mb-4 flex items-center justify-between border-b border-zinc-800 pb-3">
              <h2 className="text-base font-semibold tracking-tight text-zinc-100">
                Personal settings
              </h2>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="rounded-md px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              {loadingSettings ? (
                <p className="text-[11px] text-zinc-500">Loading latest saved settings...</p>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-[11px] text-zinc-400">
                    Starting weight ({unit})
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                  disabled={loadingSettings || savingSettings}
                    value={startWeight}
                    onChange={(e) => setStartWeight(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none transition-all focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/30"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[11px] text-zinc-400">
                    Target weight ({unit})
                  </span>
                  <input
                    type="number"
                    step="0.1"
                    inputMode="decimal"
                  disabled={loadingSettings || savingSettings}
                    value={goalWeight}
                    onChange={(e) => setGoalWeight(e.target.value)}
                    className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none transition-all focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/30"
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-[11px] text-zinc-400">Target date</span>
                <input
                  type="date"
                  disabled={loadingSettings || savingSettings}
                  value={targetDate}
                  onChange={(e) => setTargetDate(e.target.value)}
                  className="w-full rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none transition-all focus:border-emerald-600 focus:ring-2 focus:ring-emerald-500/30"
                />
              </label>
            </div>

            {settingsError ? (
              <p className="mt-3 text-xs text-rose-400">{settingsError}</p>
            ) : (
              <p className="mt-3 text-xs text-zinc-500">
                Settings are saved to your account and are unique per user.
              </p>
            )}

            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                className="w-full rounded-xl border border-zinc-700 bg-zinc-800 py-2.5 text-sm font-medium text-zinc-200 transition hover:bg-zinc-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveSettings()}
                disabled={savingSettings || loadingSettings}
                className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {savingSettings ? "Saving..." : "Save settings"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
