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

function formatGoalDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const GOAL_DATE_TOOLTIP =
  "This date is the goal deadline saved in your settings — it is not calculated from your weight. The countdown above is calendar days from today to that date.";

const GOAL_DATE_PAST_TOOLTIP =
  "That goal date is still the one stored in your settings; update it there if you want a new deadline.";

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

  const kpis: Array<{
    title: string;
    value: string;
    sub: string;
    subClass: string;
    subTooltip?: string;
  }> = [
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
      title: "Countdown to goal date",
      value:
        daysLeft === null
          ? "—"
          : daysLeft < 0
            ? "Date passed"
            : daysLeft === 0
              ? "Due today"
              : daysLeft === 1
                ? "1 day left"
                : `${daysLeft} days left`,
      sub:
        daysLeft !== null && daysLeft >= 0
          ? `Target: ${formatGoalDate(settings.targetDate)}`
          : daysLeft !== null && daysLeft < 0
            ? `Was ${formatGoalDate(settings.targetDate)} — update target in settings`
            : "Log today and set a target date in settings",
      subClass:
        daysLeft !== null && daysLeft >= 0
          ? "text-emerald-400"
          : "text-zinc-400",
      subTooltip:
        daysLeft !== null && daysLeft >= 0
          ? GOAL_DATE_TOOLTIP
          : daysLeft !== null && daysLeft < 0
            ? GOAL_DATE_PAST_TOOLTIP
            : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {kpis.map((k) => (
        <div
          key={k.title}
          className="flex min-h-[96px] flex-col gap-1.5 rounded-2xl border border-zinc-800 bg-zinc-900 p-3.5"
        >
          <div className="flex items-center justify-between">
            <p className="text-[9px] font-medium uppercase tracking-widest text-zinc-500">
              {k.title}
            </p>
          </div>
          <p className="font-mono text-xl font-semibold tracking-tight text-zinc-100">
            {k.value}
          </p>
          <p
            className={`text-[10px] ${k.subClass} ${
              k.subTooltip ? "cursor-help" : ""
            }`}
            title={k.subTooltip}
          >
            {k.sub}
          </p>
        </div>
      ))}
    </div>
  );
}
