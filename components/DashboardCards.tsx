"use client";

import { Card } from "@/components/ui/Card";
import {
  getEntryForDate,
  getTodayKey,
  getYesterdayKey,
  rollingSevenDayAverage,
  weightDeltaKg,
  daysUntilTarget,
} from "@/lib/calculations";
import { displayWeight, kgToLbs } from "@/lib/units";
import { useHealthStore } from "@/lib/store";

function fmtDelta(kgDelta: number, unit: "kg" | "lbs"): string {
  const v = unit === "kg" ? kgDelta : kgToLbs(kgDelta);
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)} ${unit}`;
}

export function DashboardCards() {
  const entries = useHealthStore((s) => s.entries);
  const settings = useHealthStore((s) => s.settings);
  const today = getTodayKey();
  const yKey = getYesterdayKey(today);
  const todayEntry = getEntryForDate(entries, today);
  const yesterdayEntry =
    entries.find((e) => e.date === yKey) ?? null;

  const u = settings.unit;
  const currentKg = todayEntry?.morningWeight;
  const delta =
    todayEntry && yesterdayEntry
      ? weightDeltaKg(todayEntry, yesterdayEntry)
      : null;

  const sevenAvg = rollingSevenDayAverage(entries, today);
  const remainingKg =
    currentKg !== undefined
      ? Math.abs(settings.goalWeight - currentKg)
      : null;

  const daysLeft = daysUntilTarget(settings.targetDate);

  const items: {
    title: string;
    value: string;
    sub: string;
    valueClass?: string;
  }[] = [
    {
      title: "Today's weight",
      value:
        currentKg !== undefined
          ? `${displayWeight(currentKg, u)} ${u}`
          : "—",
      sub: "Morning reading",
    },
    {
      title: "Change",
      value:
        delta !== null ? fmtDelta(delta, u) : "—",
      sub: "vs yesterday",
      valueClass:
        delta === null
          ? undefined
          : delta > 0
            ? "text-rose-600 dark:text-rose-400"
            : delta < 0
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-zinc-500",
    },
    {
      title: "7-day average",
      value:
        sevenAvg !== null
          ? `${displayWeight(sevenAvg, u)} ${u}`
          : "—",
      sub: "Rolling average",
    },
    {
      title: "Total progress",
      value: `${displayWeight(settings.startWeight, u)} → ${
        currentKg !== undefined ? displayWeight(currentKg, u) : "—"
      } → ${displayWeight(settings.goalWeight, u)}`,
      sub: "Start → current → goal",
    },
    {
      title: "Remaining",
      value:
        remainingKg !== null
          ? `${displayWeight(remainingKg, u)} ${u}`
          : "—",
      sub: "To goal",
    },
    {
      title: "Countdown",
      value: `T${daysLeft >= 0 ? "-" : "+"}${Math.abs(daysLeft)} days`,
      sub: "To target date",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {items.map((item) => (
        <Card key={item.title}>
          <p className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            {item.title}
          </p>
          <p
            className={`mt-2 font-mono text-lg font-semibold text-zinc-900 dark:text-zinc-100 ${item.valueClass ?? ""}`}
          >
            {item.value}
          </p>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            {item.sub}
          </p>
        </Card>
      ))}
    </div>
  );
}
