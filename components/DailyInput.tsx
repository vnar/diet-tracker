"use client";

import { useEffect, useRef, useState } from "react";
import { nanoid } from "nanoid";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { InputField } from "@/components/ui/InputField";
import { Toggle } from "@/components/ui/Toggle";
import { Badge } from "@/components/ui/Badge";
import {
  getEntryForDate,
  getYesterdayKey,
} from "@/lib/calculations";
import { inputToKg, kgToInput } from "@/lib/units";
import { useHealthStore } from "@/lib/store";
import type { DailyEntry } from "@/lib/types";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";
import { useSaveEntry } from "@/hooks/useHealthActions";

export function DailyInput() {
  const entries = useHealthStore((s) => s.entries);
  const settings = useHealthStore((s) => s.settings);
  const saveEntry = useSaveEntry();
  const [saveError, setSaveError] = useState<string | null>(null);

  const today = useClientTodayKey();
  const yesterdayKey = today ? getYesterdayKey(today) : "";
  const yesterdayEntry =
    today && yesterdayKey
      ? getEntryForDate(entries, yesterdayKey)
      : undefined;
  const todayEntry = today ? getEntryForDate(entries, today) : undefined;

  const u = settings.unit;
  const weightRef = useRef<HTMLInputElement>(null);

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
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    weightRef.current?.focus();
  }, []);

  useEffect(() => {
    if (todayEntry) {
      setMorning(String(kgToInput(todayEntry.morningWeight, u)));
      setNight(
        todayEntry.nightWeight != null
          ? String(kgToInput(todayEntry.nightWeight, u))
          : ""
      );
      setCalories(
        todayEntry.calories !== undefined ? String(todayEntry.calories) : ""
      );
      setProtein(
        todayEntry.protein !== undefined ? String(todayEntry.protein) : ""
      );
      setSteps(todayEntry.steps !== undefined ? String(todayEntry.steps) : "");
      setSleep(todayEntry.sleep !== undefined ? String(todayEntry.sleep) : "");
      setLateSnack(todayEntry.lateSnack);
      setHighSodium(todayEntry.highSodium);
      setWorkout(todayEntry.workout ?? false);
      setAlcohol(todayEntry.alcohol ?? false);
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
  }, [todayEntry, u]);

  const ph = !todayEntry && yesterdayEntry ? yesterdayEntry : null;

  const morningNum = parseFloat(morning);
  const canSave =
    morning.trim() !== "" && !Number.isNaN(morningNum) && morningNum > 0;

  function handleSave() {
    if (!canSave || !today) return;
    const mw = inputToKg(morningNum, u);
    const nightParsed = night.trim() === "" ? NaN : parseFloat(night);
    const nightWeight =
      night.trim() === "" || Number.isNaN(nightParsed)
        ? null
        : inputToKg(nightParsed, u);
    const entry: DailyEntry = {
      id: todayEntry?.id ?? nanoid(),
      date: today,
      morningWeight: mw,
      nightWeight,
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
      photoUrl: todayEntry?.photoUrl,
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
      <Card title="Today's log" variant="surface">
        <p className="text-sm text-slate-400">Loading…</p>
      </Card>
    );
  }

  return (
    <motion.div
      animate={pulse ? { scale: [1, 1.01, 1] } : undefined}
      transition={{ duration: 0.35 }}
    >
      <Card title="Today's log" variant="surface">
        <div className="mb-5 flex flex-wrap items-center gap-2">
          {todayEntry ? (
            <Badge variant="success">Updated today</Badge>
          ) : (
            <Badge variant="neutral">New entry</Badge>
          )}
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <InputField
            id="morningWeight"
            ref={weightRef}
            label="Morning weight"
            unit={u}
            tone="dark"
            inputMode="decimal"
            required
            value={morning}
            onChange={(e) => setMorning(e.target.value)}
            placeholder={ph ? String(kgToInput(ph.morningWeight, u)) : "0"}
          />
          <InputField
            id="nightWeight"
            label="Night weight (optional)"
            unit={u}
            tone="dark"
            inputMode="decimal"
            value={night}
            onChange={(e) => setNight(e.target.value)}
            placeholder={
              ph?.nightWeight != null
                ? String(kgToInput(ph.nightWeight, u))
                : ""
            }
          />
          <InputField
            id="calories"
            label="Calories"
            unit="kcal"
            tone="dark"
            inputMode="numeric"
            value={calories}
            onChange={(e) => setCalories(e.target.value)}
            placeholder={
              ph?.calories !== undefined ? String(ph.calories) : ""
            }
          />
          <InputField
            id="protein"
            label="Protein"
            unit="g"
            tone="dark"
            inputMode="numeric"
            value={protein}
            onChange={(e) => setProtein(e.target.value)}
            placeholder={
              ph?.protein !== undefined ? String(ph.protein) : ""
            }
          />
          <InputField
            id="steps"
            label="Steps"
            tone="dark"
            inputMode="numeric"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder={ph?.steps !== undefined ? String(ph.steps) : ""}
          />
          <InputField
            id="sleep"
            label="Sleep"
            unit="h"
            tone="dark"
            inputMode="decimal"
            value={sleep}
            onChange={(e) => setSleep(e.target.value)}
            placeholder={ph?.sleep !== undefined ? String(ph.sleep) : ""}
          />
        </div>
        <div className="mt-6 grid gap-3.5 sm:grid-cols-2">
          <Toggle
            id="workout"
            label="Workout / training"
            checked={workout}
            onChange={setWorkout}
          />
          <Toggle
            id="alcohol"
            label="Alcohol"
            checked={alcohol}
            onChange={setAlcohol}
          />
          <Toggle
            id="lateSnack"
            label="Late snack"
            checked={lateSnack}
            onChange={setLateSnack}
          />
          <Toggle
            id="highSodium"
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
            Save today
          </button>
        </div>
      </Card>
    </motion.div>
  );
}
