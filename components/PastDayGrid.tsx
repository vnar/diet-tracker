"use client";

import { useEffect, useState } from "react";
import { nanoid } from "nanoid";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
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

const LS_SECTION = "healthos-ui-pastdays-open";
const LS_CALENDAR = "healthos-ui-pastdays-calendar-open";

function usePersistentBool(
  key: string,
  defaultValue: boolean
): [boolean, (next: boolean) => void] {
  const [v, setV] = useState(defaultValue);

  useEffect(() => {
    try {
      const s = localStorage.getItem(key);
      if (s === "1") setV(true);
      else if (s === "0") setV(false);
    } catch {
      /* ignore */
    }
  }, [key]);

  const set = (next: boolean) => {
    setV(next);
    try {
      localStorage.setItem(key, next ? "1" : "0");
    } catch {
      /* ignore */
    }
  };

  return [v, set];
}

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

  const [sectionOpen, setSectionOpen] = usePersistentBool(LS_SECTION, false);
  const [calendarOpen, setCalendarOpen] = usePersistentBool(
    LS_CALENDAR,
    false
  );

  const [selected, setSelected] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);

  const [morning, setMorning] = useState("");
  const [night, setNight] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [steps, setSteps] = useState("");
  const [sleep, setSleep] = useState("");
  const [notes, setNotes] = useState("");
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
        e.nightWeight != null ? String(kgToInput(e.nightWeight, u)) : ""
      );
      setCalories(e.calories !== undefined ? String(e.calories) : "");
      setProtein(e.protein !== undefined ? String(e.protein) : "");
      setSteps(e.steps !== undefined ? String(e.steps) : "");
      setSleep(e.sleep !== undefined ? String(e.sleep) : "");
      setNotes(e.notes ?? "");
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
      setNotes("");
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
    const nightParsed = night.trim() === "" ? NaN : parseFloat(night);
    const nightWeight =
      night.trim() === "" || Number.isNaN(nightParsed)
        ? null
        : inputToKg(nightParsed, u);
    const entry: DailyEntry = {
      id: selectedEntry?.id ?? nanoid(),
      date: selected,
      morningWeight: mw,
      nightWeight,
      calories:
        calories.trim() === "" ? undefined : Math.round(parseFloat(calories)),
      protein:
        protein.trim() === "" ? undefined : Math.round(parseFloat(protein)),
      steps: steps.trim() === "" ? undefined : Math.round(parseFloat(steps)),
      sleep: sleep.trim() === "" ? undefined : parseFloat(sleep),
      notes: notes.trim() === "" ? undefined : notes.trim(),
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
        <p className="text-sm text-slate-400">Loading…</p>
      </Card>
    );
  }

  return (
    <motion.div
      animate={pulse ? { scale: [1, 1.005, 1] } : undefined}
      transition={{ duration: 0.35 }}
    >
      <Card variant="surface">
        <button
          type="button"
          onClick={() => setSectionOpen(!sectionOpen)}
          className="group mb-0 flex w-full items-center justify-between gap-4 rounded-xl text-left transition-colors hover:bg-slate-700/25 -mx-1 px-1 py-0.5"
          aria-expanded={sectionOpen}
        >
          <div className="min-w-0">
            <h3 className="ui-card-title-lg">
              Past days — grid &amp; edit
            </h3>
            <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-slate-500">
              {sectionOpen
                ? "Collapse when you don’t need it."
                : "Expand to pick a date or use the optional calendar."}
            </p>
          </div>
          <ChevronDown
            className={`h-6 w-6 shrink-0 text-slate-500 transition-transform duration-200 group-hover:text-slate-400 ${
              sectionOpen ? "rotate-180" : ""
            }`}
            aria-hidden
          />
        </button>

        {sectionOpen ? (
          <div className="mt-6 space-y-6 border-t border-slate-600/50 pt-6">
            <p className="text-[15px] leading-relaxed text-slate-400">
              Use{" "}
              <strong className="font-semibold text-slate-300">Jump to date</strong>{" "}
              for a quick path — the 42-day grid is optional when you want a
              visual scan.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <label className="ui-label">Jump to date</label>
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
                className="rounded-lg border border-slate-600 bg-slate-950/50 px-3 py-2 text-sm text-slate-100 [color-scheme:dark]"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setCalendarOpen(!calendarOpen)}
                className="rounded-xl border border-slate-600/80 bg-slate-900/80 px-4 py-2.5 text-sm font-semibold tracking-wide text-slate-200 shadow-sm transition-colors hover:border-slate-500 hover:bg-slate-800"
                aria-expanded={calendarOpen}
              >
                {calendarOpen
                  ? "Hide 42-day calendar"
                  : "Show 42-day calendar"}
              </button>
              <span className="text-[13px] font-medium text-slate-500">
                Optional — not required if you use the date picker.
              </span>
            </div>

            {calendarOpen ? (
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
                          ? "border-sky-500 bg-sky-950/50 ring-2 ring-sky-500/50"
                          : row
                            ? "border-emerald-700/50 bg-emerald-950/35"
                            : "border-slate-600 bg-slate-900/50"
                      } ${isToday ? "font-semibold" : ""}`}
                    >
                      <span className="text-[10px] uppercase leading-none text-slate-400">
                        {weekdayShort(d)}
                      </span>
                      <span className="text-sm text-slate-100">
                        {dayNum(d)}
                      </span>
                      {row ? (
                        <span className="mt-0.5 truncate px-0.5 font-mono text-[10px] leading-none text-emerald-400">
                          {displayWeight(row.morningWeight, u)}
                        </span>
                      ) : (
                        <span className="mt-0.5 text-[10px] text-slate-500">
                          —
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {selected ? (
          <div className="mt-8 border-t border-slate-600/50 pt-8">
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <Badge variant={selectedEntry ? "success" : "neutral"}>
                {selectedEntry ? "Saved" : "New entry"}
              </Badge>
              <span className="text-base font-semibold tracking-wide text-slate-200">
                {formatLong(selected)}
              </span>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <InputField
                id="pastMorningWeight"
                label="Morning weight"
                unit={u}
                tone="dark"
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
                tone="dark"
                inputMode="decimal"
                value={night}
                onChange={(e) => setNight(e.target.value)}
                placeholder=""
              />
              <InputField
                id="pastCalories"
                label="Calories"
                unit="kcal"
                tone="dark"
                inputMode="numeric"
                value={calories}
                onChange={(e) => setCalories(e.target.value)}
                placeholder=""
              />
              <InputField
                id="pastProtein"
                label="Protein"
                unit="g"
                tone="dark"
                inputMode="numeric"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
                placeholder=""
              />
              <InputField
                id="pastSteps"
                label="Steps"
                tone="dark"
                inputMode="numeric"
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                placeholder=""
              />
              <InputField
                id="pastSleep"
                label="Sleep"
                unit="h"
                tone="dark"
                inputMode="decimal"
                value={sleep}
                onChange={(e) => setSleep(e.target.value)}
                placeholder=""
              />
            </div>
            <div className="mt-5">
              <label
                htmlFor="pastNotes"
                className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400"
              >
                Notes
              </label>
              <textarea
                id="pastNotes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional context for this day..."
                rows={3}
                className="w-full rounded-xl border border-slate-600 bg-slate-900/60 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
              />
            </div>
            <div className="mt-6 grid gap-3.5 sm:grid-cols-2">
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
              <p className="mt-4 text-sm text-rose-400">{saveError}</p>
            ) : null}
            <div className="mt-6">
              <button
                type="button"
                disabled={!canSave}
                onClick={handleSave}
                className="w-full rounded-xl bg-sky-600 px-4 py-3 font-semibold text-white shadow-lg shadow-sky-900/30 transition-all duration-200 hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
              >
                Save this day
              </button>
            </div>
          </div>
            ) : (
              <p className="text-sm text-slate-400">
                Choose a date above to load or create an entry for that day.
              </p>
            )}
          </div>
        ) : null}
      </Card>
    </motion.div>
  );
}
