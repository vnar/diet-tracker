"use client";

import { useEffect, useState } from "react";
import { nanoid } from "nanoid";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { InputField } from "@/components/ui/InputField";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import { getEntryForDate } from "@/lib/calculations";
import { addDaysIso, eachDayInclusive } from "@/lib/dates";
import { inputToKg, kgToInput } from "@/lib/units";
import { useHealthStore } from "@/lib/store";
import type { DailyEntry } from "@/lib/types";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";
import { useSaveEntry } from "@/hooks/useHealthActions";
import { displayWeight } from "@/lib/units";

const GRID_DAYS = 42;

function weekdayShort(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "short",
  });
}

function dayNum(iso: string): number {
  return new Date(iso + "T12:00:00").getDate();
}

function formatLong(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function PastDayGrid() {
  const entries = useHealthStore((s) => s.entries);
  const settings = useHealthStore((s) => s.settings);
  const saveEntry = useSaveEntry();
  const today = useClientTodayKey();

  const [selected, setSelected] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);

  const [morning, setMorning] = useState("");
  const [night, setNight] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [steps, setSteps] = useState("");
  const [sleep, setSleep] = useState("");
  const [lateSnack, setLateSnack] = useState(false);
  const [highSodium, setHighSodium] = useState(false);
  const [workout, setWorkout] = useState(false);
  const [alcohol, setAlcohol] = useState(false);

  const u = settings.unit;

  const gridDays = today
    ? eachDayInclusive(addDaysIso(today, -(GRID_DAYS - 1)), today)
    : [];

  const selectedEntry =
    selected && entries.length
      ? getEntryForDate(entries, selected)
      : undefined;

  useEffect(() => {
    if (!selected) return;
    const e = getEntryForDate(entries, selected);
    if (e) {
      setMorning(String(kgToInput(e.morningWeight, u)));
      setNight(
        e.nightWeight !== undefined ? String(kgToInput(e.nightWeight, u)) : ""
      );
      setCalories(e.calories !== undefined ? String(e.calories) : "");
      setProtein(e.protein !== undefined ? String(e.protein) : "");
      setSteps(e.steps !== undefined ? String(e.steps) : "");
      setSleep(e.sleep !== undefined ? String(e.sleep) : "");
      setLateSnack(e.lateSnack);
      setHighSodium(e.highSodium);
      setWorkout(e.workout ?? false);
      setAlcohol(e.alcohol ?? false);
    } else {
      setMorning("");
      setNight("");
      setCalories("");
      setProtein("");
      setSteps("");
      setSleep("");
      setLateSnack(false);
      setHighSodium(false);
      setWorkout(false);
      setAlcohol(false);
    }
  }, [selected, entries, u]);

  const morningNum = parseFloat(morning);
  const canSave =
    selected !== null &&
    morning.trim() !== "" &&
    !Number.isNaN(morningNum) &&
    morningNum > 0;

  function handleSave() {
    if (!canSave || !selected) return;
    const mw = inputToKg(morningNum, u);
    const nw =
      night.trim() === "" ? undefined : inputToKg(parseFloat(night), u);
    const entry: DailyEntry = {
      id: selectedEntry?.id ?? nanoid(),
      date: selected,
      morningWeight: mw,
      nightWeight: nw !== undefined && !Number.isNaN(nw) ? nw : undefined,
      calories:
        calories.trim() === "" ? undefined : Math.round(parseFloat(calories)),
      protein:
        protein.trim() === "" ? undefined : Math.round(parseFloat(protein)),
      steps: steps.trim() === "" ? undefined : Math.round(parseFloat(steps)),
      sleep: sleep.trim() === "" ? undefined : parseFloat(sleep),
      lateSnack,
      highSodium,
      workout,
      alcohol,
      photoUrl: selectedEntry?.photoUrl,
    };
    setSaveError(null);
    void saveEntry(entry).then((r) => {
      if (!r.ok) setSaveError(r.error ?? "Could not save");
      else {
        setPulse(true);
        window.setTimeout(() => setPulse(false), 600);
      }
    });
  }

  if (today === null) {
    return (
      <Card title="Past days" variant="surface">
        <p className="text-sm text-slate-500">Loading…</p>
      </Card>
    );
  }

  return (
    <motion.div
      animate={pulse ? { scale: [1, 1.005, 1] } : undefined}
      transition={{ duration: 0.35 }}
    >
      <Card title="Past days — grid & edit" variant="surface">
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          Last {GRID_DAYS} days: tap a cell to load or edit that day. You can
          also pick a date below.
        </p>
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Jump to date
          </label>
          <input
            type="date"
            max={today}
            value={selected ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              if (!v) {
                setSelected(null);
                return;
              }
              if (v > today) return;
              setSelected(v);
            }}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
          />
        </div>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {gridDays.map((d) => {
            const row = getEntryForDate(entries, d);
            const isToday = d === today;
            const isSel = selected === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setSelected(d)}
                className={`flex min-h-[52px] flex-col items-center justify-center rounded-xl border px-0.5 py-1.5 text-center transition-all duration-200 sm:min-h-[56px] ${
                  isSel
                    ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/60 dark:border-emerald-600 dark:bg-emerald-950/40"
                    : row
                      ? "border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-800/60 dark:bg-emerald-950/30"
                      : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/80"
                } ${isToday ? "font-semibold" : ""}`}
              >
                <span className="text-[10px] uppercase leading-none text-zinc-500 dark:text-zinc-400">
                  {weekdayShort(d)}
                </span>
                <span className="text-sm text-zinc-900 dark:text-zinc-100">
                  {dayNum(d)}
                </span>
                {row ? (
                  <span className="mt-0.5 truncate px-0.5 font-mono text-[10px] leading-none text-emerald-700 dark:text-emerald-300">
                    {displayWeight(row.morningWeight, u)}
                  </span>
                ) : (
                  <span className="mt-0.5 text-[10px] text-zinc-400">—</span>
                )}
              </button>
            );
          })}
        </div>
        {selected ? (
          <div className="mt-6 border-t border-zinc-200 pt-6 dark:border-zinc-800">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <Badge variant={selectedEntry ? "success" : "neutral"}>
                {selectedEntry ? "Saved" : "New entry"}
              </Badge>
              <span className="text-sm text-zinc-700 dark:text-zinc-300">
                {formatLong(selected)}
              </span>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <InputField
                id="pastMorningWeight"
                label="Morning weight"
                unit={u}
                inputMode="decimal"
                required
                value={morning}
                onChange={(e) => setMorning(e.target.value)}
                placeholder="0"
              />
              <InputField
                id="pastNightWeight"
                label="Night weight (optional)"
                unit={u}
                inputMode="decimal"
                value={night}
                onChange={(e) => setNight(e.target.value)}
                placeholder=""
              />
              <InputField
                id="pastCalories"
                label="Calories"
                unit="kcal"
                inputMode="numeric"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder=""
              />
              <InputField
                id="pastProtein"
                label="Protein"
                unit="g"
                inputMode="numeric"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder=""
              />
              <InputField
                id="pastSteps"
                label="Steps"
                inputMode="numeric"
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                placeholder=""
              />
              <InputField
                id="pastSleep"
                label="Sleep"
                unit="h"
                inputMode="decimal"
                value={sleep}
                onChange={(e) => setSleep(e.target.value)}
                placeholder=""
              />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Toggle
                id="pastWorkout"
                label="Workout / training"
                checked={workout}
                onChange={setWorkout}
              />
              <Toggle
                id="pastAlcohol"
                label="Alcohol"
                checked={alcohol}
                onChange={setAlcohol}
              />
              <Toggle
                id="pastLateSnack"
                label="Late snack"
                checked={lateSnack}
                onChange={setLateSnack}
              />
              <Toggle
                id="pastHighSodium"
                label="High sodium day"
                checked={highSodium}
                onChange={setHighSodium}
              />
            </div>
            {saveError ? (
              <p className="mt-4 text-sm text-rose-600 dark:text-rose-400">
                {saveError}
              </p>
            ) : null}
            <div className="mt-6">
              <button
                type="button"
                disabled={!canSave}
                onClick={handleSave}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 font-semibold text-white transition-all duration-200 hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              >
                Save this day
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-6 text-sm text-zinc-500 dark:text-zinc-400">
            Select a day in the grid or use the date picker to edit past data.
          </p>
        )}
      </Card>
    </motion.div>
  );
}
