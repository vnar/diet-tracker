"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RoadmapInfoCard } from "@/components/v2/roadmap/RoadmapInfoCard";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";
import { track } from "@/lib/analytics";

const DEFAULT_ITEMS = ["Morning meds", "Evening meds", "Vitamins / supplements"];

function storageKey(day: string) {
  return `ojas.meds.checklist.v1.${day}`;
}

function load(day: string): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(storageKey(day));
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

function save(day: string, m: Record<string, boolean>) {
  window.localStorage.setItem(storageKey(day), JSON.stringify(m));
}

export function MedicationChecklistCard() {
  const todayKey = useClientTodayKey();
  const items = DEFAULT_ITEMS;
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!todayKey) return;
    setChecked(load(todayKey));
  }, [todayKey]);

  const toggle = useCallback(
    (label: string) => {
      if (!todayKey) return;
      setChecked((prev) => {
        const next = { ...prev, [label]: !prev[label] };
        save(todayKey, next);
        track("med_checklist_toggle", { label, on: next[label] });
        return next;
      });
    },
    [todayKey],
  );

  const dayLabel = useMemo(() => todayKey ?? "—", [todayKey]);

  if (!todayKey) return null;

  return (
    <RoadmapInfoCard eyebrow="Medications" title={`Checklist for ${dayLabel}`}>
      <p className="text-[11px] text-zinc-500">
        Stored only on this device. Edit labels in your routine outside the app; this is a lightweight tick
        list.
      </p>
      <ul className="mt-2 space-y-2">
        {items.map((label) => (
          <li key={label} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`med-${label}`}
              checked={Boolean(checked[label])}
              onChange={() => toggle(label)}
              className="h-4 w-4 rounded border-zinc-600 bg-zinc-900 text-emerald-600"
            />
            <label htmlFor={`med-${label}`} className="cursor-pointer text-xs text-zinc-200">
              {label}
            </label>
          </li>
        ))}
      </ul>
    </RoadmapInfoCard>
  );
}
