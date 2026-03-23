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
    <main className="min-h-screen bg-zinc-950">
      <header className="sticky top-0 z-50 border-b border-zinc-800/50 bg-zinc-950/90 backdrop-blur-md">
        <div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-5">
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
              HealthOS
            </span>
          </div>
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
      </header>

      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 pb-24 pt-4 sm:px-5">

        <div className="ui-dashboard-stack">
          <motion.section {...fadeInUp}>
            <DashboardKpiRow />
          </motion.section>

          <motion.section {...fadeInUp}>
            <WeightChart />
          </motion.section>

          <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-3">
            <motion.section {...fadeInUp} className="min-w-0">
              <DailyInput />
            </motion.section>
            <motion.section {...fadeInUp} className="flex min-w-0 flex-col gap-3">
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
