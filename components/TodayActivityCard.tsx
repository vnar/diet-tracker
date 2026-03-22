"use client";

import { Footprints, Moon, Scale } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { getEntryForDate } from "@/lib/calculations";
import { displayWeight } from "@/lib/units";
import { useHealthStore } from "@/lib/store";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";

export function TodayActivityCard() {
  const entries = useHealthStore((s) => s.entries);
  const unit = useHealthStore((s) => s.settings.unit);
  const today = useClientTodayKey();
  const entry = today ? getEntryForDate(entries, today) : undefined;

  const rows = [
    {
      icon: Footprints,
      label: "Steps",
      value:
        entry?.steps !== undefined ? entry.steps.toLocaleString() : "—",
    },
    {
      icon: Moon,
      label: "Sleep",
      value:
        entry?.sleep !== undefined ? `${entry.sleep} hrs` : "—",
    },
    {
      icon: Scale,
      label: "Night weight",
      value:
        entry?.nightWeight !== undefined
          ? `${displayWeight(entry.nightWeight, unit)} ${unit}`
          : "—",
    },
  ];

  return (
    <Card title="Activity & sleep" variant="surface">
      {today === null ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((r) => (
            <li
              key={r.label}
              className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-2.5"
            >
              <r.icon className="h-5 w-5 shrink-0 text-sky-600" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-slate-500">{r.label}</p>
                <p className="font-mono text-sm font-semibold text-slate-900">
                  {r.value}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
