"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { getEntryForDate } from "@/lib/calculations";
import { generateInsights, getYesterdayEntry } from "@/lib/insights";
import { useHealthStore } from "@/lib/store";
import type { Insight } from "@/lib/types";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";

function iconFor(severity: Insight["severity"]) {
  switch (severity) {
    case "warning":
      return (
        <AlertTriangle className="h-5 w-5 shrink-0 text-amber-400" />
      );
    case "success":
      return (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
      );
    case "info":
      return <Info className="h-5 w-5 shrink-0 text-sky-400" />;
    default:
      return <Sparkles className="h-5 w-5 shrink-0 text-slate-400" />;
  }
}

function borderFor(severity: Insight["severity"]) {
  switch (severity) {
    case "warning":
      return "border-l-rose-400 text-rose-200";
    case "success":
      return "border-l-emerald-400 text-emerald-200";
    case "info":
      return "border-l-sky-500 text-slate-200";
    default:
      return "border-l-slate-500 text-slate-300";
  }
}

export function AIInsights() {
  const entries = useHealthStore((s) => s.entries);
  const today = useClientTodayKey();
  const todayEntry = today ? getEntryForDate(entries, today) : undefined;

  let insights: Insight[] = [];
  if (today && todayEntry) {
    const yesterday = getYesterdayEntry(entries, today);
    insights = generateInsights(todayEntry, yesterday, entries);
  }

  return (
    <Card title="Insights" variant="surface">
      {today === null ? (
        <p className="text-[15px] font-medium text-slate-400">Loading…</p>
      ) : !todayEntry ? (
        <p className="text-[15px] font-medium leading-relaxed text-slate-400">
          Log a few days to unlock your first insight.
        </p>
      ) : insights.length === 0 ? (
        <p className="text-[15px] font-medium leading-relaxed text-slate-400">
          No nudges right now — keep logging.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {insights.map((ins) => (
            <li
              key={ins.id}
              className={`flex gap-2.5 rounded-xl border border-slate-600/80 border-l-4 bg-slate-900/60 p-3.5 ${borderFor(
                ins.severity
              )}`}
            >
              {iconFor(ins.severity)}
              <p className="text-[15px] font-medium leading-relaxed tracking-wide text-slate-200">
                {ins.message}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
