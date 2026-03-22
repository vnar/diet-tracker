"use client";

import { motion } from "framer-motion";
import { DailyInput } from "@/components/DailyInput";
import { DashboardKpiRow } from "@/components/DashboardKpiRow";
import { WeightChart } from "@/components/WeightChart";
import { AIInsights } from "@/components/AIInsights";
import { PhotoTracker } from "@/components/PhotoTracker";
import { WeightHistoryTable } from "@/components/WeightHistoryTable";
import { PastDayGrid } from "@/components/PastDayGrid";
import { TodayActivityCard } from "@/components/TodayActivityCard";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AuthBar } from "@/components/AuthBar";
import { useHealthStore } from "@/lib/store";
import { usePatchSettings } from "@/hooks/useHealthActions";

const fadeInUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

export function HealthDashboard() {
  const unit = useHealthStore((s) => s.settings.unit);
  const entryCount = useHealthStore((s) => s.entries.length);
  const patchSettings = usePatchSettings();

  return (
    <main className="min-h-screen bg-slate-100 dark:bg-gradient-to-b dark:from-slate-950 dark:via-[#0c1422] dark:to-[#0a1628]">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-8 safe-pb">
        <header className="mb-8 flex flex-col gap-4 rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm dark:border-white/10 dark:bg-slate-900/75 dark:shadow-none">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                HealthOS
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Daily awareness dashboard
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AuthBar />
              <button
                type="button"
                onClick={() =>
                  void patchSettings({ unit: unit === "kg" ? "lbs" : "kg" })
                }
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 transition-all duration-200 hover:bg-slate-50 dark:border-white/20 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
              >
                Unit: {unit}
              </button>
              <ThemeToggle />
            </div>
          </div>
        </header>

        <div className="flex flex-col gap-6">
          <motion.section {...fadeInUp}>
            <DashboardKpiRow />
          </motion.section>

          <motion.section {...fadeInUp}>
            <WeightChart />
          </motion.section>

          <div className="grid gap-6 lg:grid-cols-3 lg:items-start">
            <motion.section {...fadeInUp} className="min-w-0">
              <DailyInput />
            </motion.section>
            <motion.section
              {...fadeInUp}
              className="flex min-w-0 flex-col gap-6"
            >
              <TodayActivityCard />
              <AIInsights />
            </motion.section>
            <motion.section {...fadeInUp} className="min-w-0">
              <PhotoTracker />
            </motion.section>
          </div>

          <motion.section {...fadeInUp}>
            <PastDayGrid />
          </motion.section>

          {entryCount > 0 ? (
            <motion.section {...fadeInUp}>
              <WeightHistoryTable />
            </motion.section>
          ) : null}
        </div>
      </div>
    </main>
  );
}
