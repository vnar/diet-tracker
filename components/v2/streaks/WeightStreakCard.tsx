"use client";

import { useMemo } from "react";
import { Flame } from "lucide-react";
import { useHealthStore } from "@/lib/store";
import { computeWeightLogStreak } from "@/lib/streaks/weightLogStreak";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";
import { track } from "@/lib/analytics";

export function WeightStreakCard() {
  const entries = useHealthStore((s) => s.entries);
  const todayKey = useClientTodayKey();

  const streak = useMemo(() => {
    if (!todayKey) return 0;
    return computeWeightLogStreak(entries, todayKey);
  }, [entries, todayKey]);

  const label = streak === 1 ? "1 day" : `${streak} days`;

  return (
    <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/20">
          <Flame className="h-5 w-5 text-amber-400" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-amber-100">Morning weigh-in streak</p>
          <p className="mt-0.5 text-2xl font-bold tabular-nums text-amber-50">{label}</p>
          <p className="mt-1 text-xs text-amber-200/80">
            Consecutive days with a morning weight logged. One tap each morning builds the habit.
          </p>
          <button
            type="button"
            className="mt-2 text-xs font-medium text-amber-300 underline-offset-2 hover:underline"
            onClick={() => track("weight_streak_card_viewed", { streak })}
          >
            Why streaks help
          </button>
        </div>
      </div>
    </div>
  );
}
