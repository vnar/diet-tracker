"use client";

import { useMemo } from "react";
import { ActivitySquare, MoonStar } from "lucide-react";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";
import { useHealthStore } from "@/lib/store";
import { computeDailyReadiness } from "@/lib/recovery/readinessScore";

function zoneStyles(zone: "green" | "yellow" | "red"): { chip: string; tone: string; title: string } {
  if (zone === "green") {
    return {
      chip: "border-emerald-400/45 bg-emerald-500/20 text-emerald-100",
      tone: "text-emerald-200/85",
      title: "Green day",
    };
  }
  if (zone === "yellow") {
    return {
      chip: "border-amber-400/45 bg-amber-500/20 text-amber-100",
      tone: "text-amber-200/85",
      title: "Yellow day",
    };
  }
  return {
    chip: "border-rose-400/45 bg-rose-500/20 text-rose-100",
    tone: "text-rose-200/85",
    title: "Red day",
  };
}

export function DailyReadinessCard() {
  const entries = useHealthStore((s) => s.entries);
  const todayKey = useClientTodayKey();

  const readiness = useMemo(() => {
    if (!todayKey) return null;
    return computeDailyReadiness(entries, todayKey);
  }, [entries, todayKey]);

  if (!readiness) return null;

  const z = zoneStyles(readiness.zone);

  return (
    <div className="rounded-lg border border-sky-500/30 bg-sky-950/25 px-3 py-2.5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-sky-100">Daily readiness</p>
          <p className="mt-0.5 text-[11px] text-sky-200/75">Uses 7-day trend + yesterday's check-in</p>
        </div>
        <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${z.chip}`}>{z.title}</span>
      </div>

      <div className="mt-2 flex items-end gap-3">
        <p className="text-2xl font-bold tabular-nums text-white">{readiness.score}</p>
        <p className={`pb-1 text-[11px] ${z.tone}`}>{readiness.recommendation}</p>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-md border border-zinc-700/80 bg-zinc-950/45 px-2 py-1.5 text-zinc-300">
          <p className="flex items-center gap-1 text-zinc-400">
            <MoonStar className="h-3 w-3" aria-hidden />
            Yesterday
          </p>
          <p className="mt-0.5 font-semibold tabular-nums text-zinc-100">
            {readiness.yesterdayScore == null ? "—" : readiness.yesterdayScore}
          </p>
        </div>
        <div className="rounded-md border border-zinc-700/80 bg-zinc-950/45 px-2 py-1.5 text-zinc-300">
          <p className="flex items-center gap-1 text-zinc-400">
            <ActivitySquare className="h-3 w-3" aria-hidden />
            7-day trend
          </p>
          <p className="mt-0.5 font-semibold tabular-nums text-zinc-100">
            {readiness.trend7d == null ? "—" : readiness.trend7d}
          </p>
        </div>
      </div>

      {readiness.signals.length > 0 ? (
        <div className="mt-2 space-y-1">
          {readiness.signals.map((s) => (
            <p key={s.key} className="text-[10px] text-zinc-300">
              {s.label}:{" "}
              <span className={s.impact >= 0 ? "text-emerald-300" : "text-rose-300"}>
                {s.impact >= 0 ? "+" : ""}
                {s.impact}
              </span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
