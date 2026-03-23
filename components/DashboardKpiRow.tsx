"use client";

import {
  getEntryForDate,
  getYesterdayKey,
  priorLoggedEntry,
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
  if (kgDelta === null) return "text-slate-400";
  if (kgDelta > 0) return "text-rose-400";
  if (kgDelta < 0) return "text-emerald-400";
  return "text-slate-400";
}

/** For week-over-week *average* change: negative kg delta = average dropped (usually good). */
function weekAvgDeltaClass(kgDelta: number | null): string {
  if (kgDelta === null) return "text-slate-400";
  if (kgDelta < 0) return "text-emerald-400";
  if (kgDelta > 0) return "text-rose-400";
  return "text-slate-400";
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
  const comparisonEntry =
    today && todayEntry
      ? (yesterdayEntry ?? priorLoggedEntry(entries, today))
      : null;
  const dayDelta =
    todayEntry && comparisonEntry
      ? weightDeltaKg(todayEntry, comparisonEntry)
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
          ? yesterdayEntry
            ? `${fmtDelta(dayDelta, u)} since yesterday`
            : `${fmtDelta(dayDelta, u)} vs prior weigh-in`
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
      subClass: "text-amber-400",
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
            ? "text-emerald-400"
            : "text-slate-400"
          : "text-slate-400",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4 lg:gap-5 lg:items-stretch">
      {kpis.map((k) => (
        <div
          key={k.title}
          className="flex min-h-[168px] flex-col justify-between rounded-2xl border border-slate-600/50 bg-slate-800/95 p-5 shadow-lg shadow-black/45 backdrop-blur-sm"
        >
          <div>
            <p className="ui-overline mb-3">{k.title}</p>
            <p className="ui-metric min-h-[2.5rem] text-2xl font-semibold leading-none text-slate-50">
              {k.value}
            </p>
          </div>
          <p
            className={`mt-4 text-[13px] font-medium leading-snug ${k.subClass}`}
          >
            {k.sub}
          </p>
        </div>
      ))}
    </div>
  );
}
