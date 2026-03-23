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
        entry?.nightWeight != null
          ? `${displayWeight(entry.nightWeight, unit)} ${unit}`
          : "—",
    },
  ];

  return (
    <Card title="Activity & sleep" variant="surface">
      {today === null ? (
        <p className="text-xs text-zinc-600">Loading…</p>
      ) : (
        <ul className="flex flex-col">
          {rows.map((r, index) => (
            <li key={r.label}>
              {index > 0 ? <div className="border-t border-zinc-800/60" /> : null}
              <div className="flex items-center justify-between py-2">
                <div className="flex items-center gap-2">
                  <r.icon className="h-[13px] w-[13px] flex-shrink-0 text-zinc-500" aria-hidden />
                  <span className="text-xs text-zinc-400">{r.label}</span>
                </div>
                <p className="font-mono text-sm text-zinc-100">{r.value}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
