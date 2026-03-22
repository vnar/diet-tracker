"use client";

import { motion } from "framer-motion";
import { DailyInput } from "@/components/DailyInput";
import { DashboardCards } from "@/components/DashboardCards";
import { WeightChart } from "@/components/WeightChart";
import { AIInsights } from "@/components/AIInsights";
import { PhotoTracker } from "@/components/PhotoTracker";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useHealthStore } from "@/lib/store";

const fadeInUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3 },
};

export function HealthDashboard() {
  const unit = useHealthStore((s) => s.settings.unit);
  const updateSettings = useHealthStore((s) => s.updateSettings);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-12 pt-8 safe-pb">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            HealthOS
          </h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Daily awareness dashboard
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() =>
              updateSettings({ unit: unit === "kg" ? "lbs" : "kg" })
            }
            className="rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition-all duration-200 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            Unit: {unit}
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex flex-col gap-6">
        <motion.section {...fadeInUp}>
          <DailyInput />
        </motion.section>
        <motion.section {...fadeInUp}>
          <DashboardCards />
        </motion.section>
        <motion.section {...fadeInUp}>
          <WeightChart />
        </motion.section>
        <motion.section {...fadeInUp}>
          <AIInsights />
        </motion.section>
        <motion.section {...fadeInUp}>
          <PhotoTracker />
        </motion.section>
      </div>
    </main>
  );
}
