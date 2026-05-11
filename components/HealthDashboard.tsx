"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { createPortal } from "react-dom";
import { DailyInput } from "@/components/DailyInput";
import { FoodPhotoCaloriesAccessory } from "@/components/v2/food/FoodPhotoCaloriesAccessory";
import { AddFromLibrarySheet } from "@/components/v2/meals/AddFromLibrarySheet";
import { FrequentMealsCarousel } from "@/components/v2/meals/FrequentMealsCarousel";
import { MealsTodayPanel } from "@/components/v2/meals/MealsTodayPanel";
import { NaturalMealSheet } from "@/components/v2/meals/NaturalMealSheet";
import { EnergyBalanceCard } from "@/components/v2/activity/EnergyBalanceCard";
import { DashboardKpiRow } from "@/components/DashboardKpiRow";
import { WeightChart } from "@/components/WeightChart";
import { ProgressPhotoTrackerProvider, PhotoTrackerGallery } from "@/components/PhotoTracker";
import { DashboardAiInsightsHub } from "@/components/v2/insights/DashboardAiInsightsHub";
import { WeightHistoryTable } from "@/components/WeightHistoryTable";
import { PastDayGrid } from "@/components/PastDayGrid";
import { TodayActivityCard } from "@/components/TodayActivityCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthBar } from "@/components/AuthBar";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { getDayMealEntries, getSettings, isAwsBackendEnabled, type DayMealEntryRow } from "@/lib/frontend-api-client";
import { useHealthStore } from "@/lib/store";
import { usePatchSettings } from "@/hooks/useHealthActions";
import { Settings, Users, Utensils } from "lucide-react";
import { AdminUsersPanel } from "@/components/AdminUsersPanel";
import { isAppAdminViewer } from "@/lib/admin";
import { isMealLibraryEnabled, isNlMealParseEnabled, isPhotoFoodLogEnabled } from "@/lib/featureFlags";
import { useFeatureFlagOverridesEpoch } from "@/hooks/useFeatureFlagOverridesEpoch";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";
import { formatDateKeyLocal, getEntryForDate } from "@/lib/calculations";
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
  const [mealsOpen, setMealsOpen] = useState(false);

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
    <main className="min-h-screen bg-zinc-950">
      <header className="sticky top-0 z-50 border-b border-zinc-800/50 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-5 py-2">
          <div className="flex items-center justify-between sm:hidden">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-emerald-500">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <span className="text-sm font-semibold tracking-tight text-zinc-100">
                Ojas-Health
              </span>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <AuthBar compact />
              {user?.id && isMealLibraryEnabled(user.id) ? (
                <Link
                  href="/meals"
                  className="rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-1 text-[10px] font-medium text-zinc-300 hover:bg-zinc-700"
                >
                  Meals
                </Link>
              ) : null}
              {showAdminUsers ? (
                <button
                  type="button"
                  onClick={() => setAdminUsersOpen(true)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 transition-all hover:bg-zinc-700"
                  aria-label="View registered users"
                  title="Users (admin)"
                >
                  <Users className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(true);
                  void refreshSettingsFromCloud();
                }}
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 transition-all hover:bg-zinc-700"
                aria-label="Open settings"
                title="Settings"
              >
                <Settings className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() =>
                  void patchSettings({ unit: unit === "kg" ? "lbs" : "kg" })
                }
                className="h-7 min-w-10 rounded-lg border border-zinc-700 bg-zinc-800 px-2 text-[11px] font-medium text-zinc-300 transition-all hover:bg-zinc-700"
              >
                {unit}
              </button>
              <ThemeToggle />
            </div>
          </div>

          <p className="mt-1 text-center text-[11px] text-zinc-500 sm:hidden">
            By{" "}
            <a
              href="https://www.linkedin.com/in/viharnar/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 transition-colors hover:text-zinc-300"
            >
              Vihar Nar
            </a>
          </p>

          <div className="hidden h-8 grid-cols-[auto_1fr_auto] items-center gap-3 sm:grid">
            <div className="flex items-center gap-2">
              <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-emerald-500">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
              </div>
              <span className="text-sm font-semibold tracking-tight text-zinc-100">
                Ojas-Health
              </span>
            </div>
            <nav className="mx-auto flex items-center gap-1 rounded-full border border-zinc-800 bg-zinc-900/60 p-1">
              <Link
                href="/"
                className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[10px] font-medium text-emerald-300"
              >
                Dashboard
              </Link>
              <button
                type="button"
                className="rounded-full px-2.5 py-1 text-[10px] font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                onClick={() =>
                  document
                    .getElementById("dashboard-history")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
              >
                History
              </button>
              <Link
                href="/meals"
                className="rounded-full px-2.5 py-1 text-[10px] font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
              >
                Meals
              </Link>
              {showAdminUsers ? (
                <button
                  type="button"
                  onClick={() => setAdminUsersOpen(true)}
                  className="rounded-full px-2.5 py-1 text-[10px] font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                >
                  Users
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(true);
                  void refreshSettingsFromCloud();
                }}
                className="rounded-full px-2.5 py-1 text-[10px] font-medium text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
              >
                Settings
              </button>
            </nav>
            <div className="flex flex-shrink-0 items-center gap-2">
              <AuthBar />
              <button
                type="button"
                onClick={() =>
                  void patchSettings({ unit: unit === "kg" ? "lbs" : "kg" })
                }
                className="h-7 rounded-lg border border-zinc-700 bg-zinc-800 px-2.5 text-[11px] font-medium text-zinc-300 transition-all hover:bg-zinc-700"
              >
                {unit}
              </button>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 pb-24 pt-4 sm:px-5">

        <div className="ui-dashboard-stack">
          <motion.section {...fadeInUp}>
            <DashboardKpiRow />
          </motion.section>

          <motion.section {...fadeInUp}>
            <WeightChart />
          </motion.section>

          <ProgressPhotoTrackerProvider>
            <div className="ui-dashboard-grid-3">
            <motion.section {...fadeInUp} className="flex min-h-0 min-w-0 flex-col gap-3">
              <p className="ui-label mb-0 min-h-[1.25rem]">Logging + meals</p>
              <DailyInput
                caloriesProteinAggregate={caloriesProteinAggregate}
                renderCaloriesAccessory={
                  status === "authenticated" &&
                  isAwsBackendEnabled() &&
                  user?.id &&
                  (isPhotoFoodLogEnabled(user.id) ||
                    (isMealLibraryEnabled(user.id) && isNlMealParseEnabled(user.id)) ||
                    isMealLibraryEnabled(user.id))
                    ? (ctx) => (
                        <div className="flex min-w-0 flex-wrap items-center gap-1">
                          {isMealLibraryEnabled(user.id) ? (
                            <button
                              type="button"
                              onClick={() => setMealsOpen(true)}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-600 bg-zinc-800 text-zinc-300 transition-colors hover:border-emerald-600/60 hover:text-emerald-400"
                              aria-label="Open daily meals"
                              title="Open daily meals"
                            >
                              <Utensils className="h-4 w-4" />
                            </button>
                          ) : null}
                          {isMealLibraryEnabled(user.id) && isNlMealParseEnabled(user.id) ? (
                            <NaturalMealSheet
                              day={ctx.todayKey}
                              getAccessToken={getAccessToken}
                              onLogged={refreshMeals}
                              compact
                            />
                          ) : null}
                          {isMealLibraryEnabled(user.id) ? (
                            <AddFromLibrarySheet
                              day={ctx.todayKey}
                              getAccessToken={getAccessToken}
                              onAdded={refreshMeals}
                            />
                          ) : null}
                          {isPhotoFoodLogEnabled(user.id) ? (
                            <FoodPhotoCaloriesAccessory
                              {...ctx}
                              getAccessToken={getAccessToken}
                              mealLibraryEnabled={isMealLibraryEnabled(user.id)}
                              onMealsChanged={refreshMeals}
                            />
                          ) : null}
                        </div>
                      )
                    : undefined
                }
              />
            </motion.section>
            <motion.section {...fadeInUp} className="flex min-h-0 min-w-0 flex-col gap-3">
              <p className="ui-label mb-0 min-h-[1.25rem]">Activity</p>
              <TodayActivityCard />
              <EnergyBalanceCard
                day={todayKey ?? formatDateKeyLocal(new Date())}
                todayEntry={todayEntry}
                mealEntries={mealEntries}
                getAccessToken={getAccessToken}
                initialCalibrationFactor={settings.activityCalibrationFactor}
              />
            </motion.section>
            <motion.section {...fadeInUp} className="flex min-h-0 min-w-0 flex-col gap-2">
              <div>
                <p className="ui-label mb-0 min-h-[1.25rem]">Photos</p>
                <p className="mt-0.5 max-w-[18rem] text-[10px] leading-snug text-zinc-500 sm:max-w-none">
                  Select two shots below, then Run AI comparison — or open AI insights for more tools.
                </p>
              </div>
              <div className="min-h-0 min-w-0 flex-1">
                <PhotoTrackerGallery />
              </div>
            </motion.section>
            </div>

            <motion.section {...fadeInUp}>
              <DashboardAiInsightsHub />
            </motion.section>
          </ProgressPhotoTrackerProvider>

          <motion.section {...fadeInUp} id="dashboard-history">
            <p className="ui-label mb-2">Review + history</p>
            <PastDayGrid />
          </motion.section>

          {entryCount > 0 ? (
            <motion.section {...fadeInUp}>
              <WeightHistoryTable />
            </motion.section>
          ) : null}
        </div>
      </div>

      <AdminUsersPanel open={adminUsersOpen} onClose={() => setAdminUsersOpen(false)} />

      {mealsOpen && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[170] flex items-end justify-center bg-black/70 p-4 sm:items-center"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setMealsOpen(false);
              }}
            >
              <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-3 shadow-2xl">
                <div className="mb-2 flex items-center justify-between border-b border-zinc-800 pb-2">
                  <p className="text-sm font-semibold text-zinc-100">Meals</p>
                  <button
                    type="button"
                    onClick={() => setMealsOpen(false)}
                    className="rounded-md px-2 py-1 text-xs text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
                  >
                    Close
                  </button>
                </div>
                {status === "authenticated" &&
                isAwsBackendEnabled() &&
                user?.id &&
                isMealLibraryEnabled(user.id) &&
                todayKey ? (
                  <>
                    <FrequentMealsCarousel
                      day={todayKey}
                      getAccessToken={getAccessToken}
                      onLogged={refreshMeals}
                    />
                    <MealsTodayPanel
                      day={todayKey}
                      entries={mealEntries}
                      getAccessToken={getAccessToken}
                      onChanged={refreshMeals}
                    />
                  </>
                ) : (
                  <p className="py-3 text-xs text-zinc-500">Meal tools are available when signed in with AWS backend.</p>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}

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
