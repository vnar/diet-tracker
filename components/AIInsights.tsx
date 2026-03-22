"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { getEntryForDate } from "@/lib/calculations";
import {
  generateInsights,
  getYesterdayEntry,
  lastSevenEntries,
} from "@/lib/insights";
import { useHealthStore } from "@/lib/store";
import type { Insight } from "@/lib/types";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";

function iconFor(severity: Insight["severity"]) {
  switch (severity) {
    case "warning":
      return <AlertTriangle className="h-5 w-5 shrink-0" />;
    case "success":
      return <CheckCircle2 className="h-5 w-5 shrink-0" />;
    case "info":
      return <Info className="h-5 w-5 shrink-0" />;
    default:
      return <Sparkles className="h-5 w-5 shrink-0" />;
  }
}

function borderFor(severity: Insight["severity"]) {
  switch (severity) {
    case "warning":
      return "border-l-rose-500 text-rose-800 dark:text-rose-200";
    case "success":
      return "border-l-emerald-500 text-emerald-800 dark:text-emerald-200";
    case "info":
      return "border-l-zinc-400 text-zinc-800 dark:text-zinc-200";
    default:
      return "border-l-zinc-500 text-zinc-700 dark:text-zinc-300";
  }
}

export function AIInsights() {
  const entries = useHealthStore((s) => s.entries);
  const today = useClientTodayKey();
  const todayEntry = today ? getEntryForDate(entries, today) : undefined;

  let insights: Insight[] = [];
  if (today && todayEntry) {
    const yesterday = getYesterdayEntry(entries, today);
    const last7 = lastSevenEntries(entries);
    insights = generateInsights(todayEntry, yesterday, last7);
  }

  return (
    <Card title="Insight of the day" variant="surface">
      {today === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : !todayEntry ? (
        <p className="text-sm text-slate-500">
          Log a few days to unlock your first insight.
        </p>
      ) : insights.length === 0 ? (
        <p className="text-sm text-slate-500">
          No nudges right now — keep logging.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {insights.map((ins) => (
            <li
              key={ins.id}
              className={`flex gap-3 rounded-xl border border-slate-200 border-l-4 bg-slate-50/90 p-4 text-slate-800 ${borderFor(
                ins.severity
              )}`}
            >
              {iconFor(ins.severity)}
              <p className="text-sm leading-relaxed">{ins.message}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
