"use client";

import {
  getEntryForDate,
  getYesterdayKey,
  rollingSevenDayAverage,
  sevenDayAvgDeltaVsPriorWeek,
  weightDeltaKg,
  daysUntilTarget,
} from "@/lib/calculations";
import { displayWeight, kgToLbs } from "@/lib/units";
import { useHealthStore } from "@/lib/store";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";

function fmtDelta(kgDelta: number, unit: "kg" | "lbs"): string {
  const v = unit === "kg" ? kgDelta : kgToLbs(kgDelta);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)} ${unit}`;
}

function deltaClass(kgDelta: number | null): string {
  if (kgDelta === null) return "text-slate-500";
  if (kgDelta > 0) return "text-rose-600";
  if (kgDelta < 0) return "text-emerald-600";
  return "text-slate-500";
}

/** For week-over-week *average* change: negative kg delta = average dropped (usually good). */
function weekAvgDeltaClass(kgDelta: number | null): string {
  if (kgDelta === null) return "text-slate-500";
  if (kgDelta < 0) return "text-emerald-600";
  if (kgDelta > 0) return "text-rose-600";
  return "text-slate-500";
}

export function DashboardKpiRow() {
  const entries = useHealthStore((s) => s.entries);
  const settings = useHealthStore((s) => s.settings);
  const today = useClientTodayKey();
  const yKey = today ? getYesterdayKey(today) : "";
  const todayEntry = today ? getEntryForDate(entries, today) : undefined;
  const yesterdayEntry =
    today && yKey ? (entries.find((e) => e.date === yKey) ?? null) : null;

  const u = settings.unit;
  const currentKg = todayEntry?.morningWeight;
  const dayDelta =
    todayEntry && yesterdayEntry
      ? weightDeltaKg(todayEntry, yesterdayEntry)
      : null;

  const sevenAvg =
    today ? rollingSevenDayAverage(entries, today) : null;
  const weekAvgDelta =
    today ? sevenDayAvgDeltaVsPriorWeek(entries, today) : null;

  const remainingKg =
    currentKg !== undefined
      ? Math.abs(settings.goalWeight - currentKg)
      : null;

  const daysLeft = today
    ? daysUntilTarget(settings.targetDate, today)
    : null;

  const weeksLeft =
    daysLeft !== null ? Math.max(1, Math.round(Math.abs(daysLeft) / 7)) : null;

  const onTrack =
    daysLeft !== null &&
    daysLeft >= 0 &&
    (weekAvgDelta === null || weekAvgDelta <= 0);

  const kpis = [
    {
      title: "Today's weight",
      value:
        currentKg !== undefined
          ? `${displayWeight(currentKg, u)} ${u}`
          : "—",
      sub:
        dayDelta !== null
          ? `${fmtDelta(dayDelta, u)} since yesterday`
          : "Log morning weight",
      subClass: deltaClass(dayDelta),
    },
    {
      title: "7-day average",
      value:
        sevenAvg !== null
          ? `${displayWeight(sevenAvg, u)} ${u}`
          : "—",
      sub:
        weekAvgDelta !== null
          ? `${fmtDelta(weekAvgDelta, u)} vs prior week`
          : "Needs a few weeks of data",
      subClass: weekAvgDeltaClass(weekAvgDelta),
    },
    {
      title: "Target",
      value: `${displayWeight(settings.goalWeight, u)} ${u}`,
      sub:
        remainingKg !== null
          ? `${displayWeight(remainingKg, u)} ${u} to go`
          : "—",
      subClass: "text-amber-600",
    },
    {
      title: "Goal horizon",
      value:
        daysLeft !== null && weeksLeft !== null
          ? daysLeft >= 0
            ? `~${weeksLeft} wk`
            : "Past target"
          : "—",
      sub:
        daysLeft !== null && daysLeft >= 0
          ? onTrack
            ? "On track"
            : "Keep logging"
          : daysLeft !== null && daysLeft < 0
            ? "Update target date?"
            : "Set entries",
      subClass:
        daysLeft !== null && daysLeft >= 0
          ? onTrack
            ? "text-emerald-600"
            : "text-slate-500"
          : "text-slate-500",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
      {kpis.map((k) => (
        <div
          key={k.title}
          className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-lg shadow-slate-900/10 dark:border-white/10 dark:shadow-black/35"
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {k.title}
          </p>
          <p className="mt-2 font-mono text-xl font-semibold tabular-nums text-slate-900">
            {k.value}
          </p>
          <p className={`mt-1 text-xs font-medium ${k.subClass}`}>{k.sub}</p>
        </div>
      ))}
    </div>
  );
}
