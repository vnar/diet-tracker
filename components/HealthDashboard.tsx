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
    <main className="min-h-screen bg-[#030711] bg-gradient-to-b from-slate-950 via-[#0a1224] to-[#050a14]">
      <div className="ui-dashboard-shell safe-pb flex flex-col gap-8">
        <header className="ui-dashboard-header">
          <div className="grid gap-6 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-8">
            <div className="min-w-0">
              <h1 className="ui-page-title">HealthOS</h1>
              <p className="ui-page-subtitle">
                Daily awareness dashboard
              </p>
            </div>
            <div className="flex flex-shrink-0 flex-wrap items-center justify-start gap-2 sm:justify-end sm:gap-3">
              <AuthBar />
              <button
                type="button"
                onClick={() =>
                  void patchSettings({ unit: unit === "kg" ? "lbs" : "kg" })
                }
                className="inline-flex h-10 shrink-0 items-center rounded-xl border border-slate-600/80 bg-slate-800/90 px-4 text-sm font-semibold tracking-wide text-slate-100 shadow-sm transition-all duration-200 hover:border-slate-500 hover:bg-slate-700/90"
              >
                Unit: {unit}
              </button>
              <div className="flex h-10 shrink-0 items-center">
                <ThemeToggle />
              </div>
            </div>
          </div>
        </header>

        <div className="ui-dashboard-stack">
          <motion.section {...fadeInUp}>
            <DashboardKpiRow />
          </motion.section>

          <motion.section {...fadeInUp}>
            <WeightChart />
          </motion.section>

          <div className="ui-dashboard-grid-3">
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
