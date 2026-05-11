"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { nanoid } from "nanoid";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/Card";
import { InputField } from "@/components/ui/InputField";
import { Toggle } from "@/components/ui/Toggle";
import {
  getEntryForDate,
  getYesterdayKey,
} from "@/lib/calculations";
import { inputToKg, kgToInput } from "@/lib/units";
import { useHealthStore } from "@/lib/store";
import type { DailyEntry } from "@/lib/types";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";
import { useSaveEntry } from "@/hooks/useHealthActions";
import { VoiceDailyLogSheet } from "@/components/v2/voice/VoiceDailyLogSheet";
import type { VoiceDailyFormApply } from "@/lib/voiceDailyLog/types";
import {
  postDayMealEntry,
  postInsightCacheInvalidateAfterMeals,
  postMealLibraryCreate,
} from "@/lib/frontend-api-client";
import { Mic } from "lucide-react";

export type DailyInputCaloriesAccessoryContext = {
  todayKey: string;
  calories: string;
  protein: string;
  setCalories: (value: string) => void;
  setProtein: (value: string) => void;
};

export function DailyInput({
  renderCaloriesAccessory,
  caloriesProteinAggregate,
  voiceDailyLogEnabled,
  voiceMealLibrarySyncEnabled,
  getVoiceAccessToken,
  onVoiceMealsLogged,
  onVoiceEnergyActivityPrefill,
}: {
  renderCaloriesAccessory?: (ctx: DailyInputCaloriesAccessoryContext) => ReactNode;
  /** When set with readOnly, calories/protein reflect meal totals and are not editable. */
  caloriesProteinAggregate?: {
    calories: string;
    protein: string;
    readOnly: boolean;
    caption?: string;
  } | null;
  /** Cognito access token for voice parse (Next dev or AWS API). */
  voiceDailyLogEnabled?: boolean;
  /** When true, voice can append parsed foods to meal library + today’s log (additive). */
  voiceMealLibrarySyncEnabled?: boolean;
  getVoiceAccessToken?: () => string | null;
  /** After voice appends meals via API, refresh meal totals (e.g. parent refetches day meals). */
  onVoiceMealsLogged?: () => void;
  /** When voice applies an activity line for the Energy balance card. */
  onVoiceEnergyActivityPrefill?: (payload: { nonce: string; text: string }) => void;
} = {}) {
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
  const [notes, setNotes] = useState("");
  const [voiceSheetOpen, setVoiceSheetOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const habitSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    weightRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      if (habitSaveTimerRef.current) clearTimeout(habitSaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (caloriesProteinAggregate?.readOnly) {
      setCalories(caloriesProteinAggregate.calories);
      setProtein(caloriesProteinAggregate.protein);
    }
    if (todayEntry) {
      setMorning(String(kgToInput(todayEntry.morningWeight, u)));
      setNight(
        todayEntry.nightWeight != null
          ? String(kgToInput(todayEntry.nightWeight, u))
          : ""
      );
      if (!caloriesProteinAggregate?.readOnly) {
        setCalories(
          todayEntry.calories !== undefined ? String(todayEntry.calories) : ""
        );
        setProtein(
          todayEntry.protein !== undefined ? String(todayEntry.protein) : ""
        );
      }
      setSteps(todayEntry.steps !== undefined ? String(todayEntry.steps) : "");
      setSleep(todayEntry.sleep !== undefined ? String(todayEntry.sleep) : "");
      setLateSnack(todayEntry.lateSnack);
      setHighSodium(todayEntry.highSodium);
      setWorkout(todayEntry.workout ?? false);
      setAlcohol(todayEntry.alcohol ?? false);
      setNotes(todayEntry.notes ?? "");
    } else {
      setMorning("");
      setNight("");
      if (!caloriesProteinAggregate?.readOnly) {
        setCalories("");
        setProtein("");
      }
      setSteps("");
      setSleep("");
      setLateSnack(false);
      setHighSodium(false);
      setWorkout(false);
      setAlcohol(false);
      setNotes("");
    }
  }, [todayEntry, u, caloriesProteinAggregate]);

  const ph = !todayEntry && yesterdayEntry ? yesterdayEntry : null;

  const morningNum = parseFloat(morning);
  const canSave =
    morning.trim() !== "" && !Number.isNaN(morningNum) && morningNum > 0;

  const buildTodayEntry = useCallback(
    (habits: {
      workout: boolean;
      alcohol: boolean;
      lateSnack: boolean;
      highSodium: boolean;
    }): DailyEntry | null => {
      if (!today || !canSave) return null;
      const mw = inputToKg(morningNum, u);
      const nightParsed = night.trim() === "" ? NaN : parseFloat(night);
      const nightWeight =
        night.trim() === "" || Number.isNaN(nightParsed)
          ? null
          : inputToKg(nightParsed, u);
      const calOut =
        caloriesProteinAggregate?.readOnly && caloriesProteinAggregate.calories.trim() !== ""
          ? Math.round(parseFloat(caloriesProteinAggregate.calories))
          : calories.trim() === ""
            ? undefined
            : Math.round(parseFloat(calories));
      const protOut =
        caloriesProteinAggregate?.readOnly && caloriesProteinAggregate.protein.trim() !== ""
          ? Math.round(parseFloat(caloriesProteinAggregate.protein))
          : protein.trim() === ""
            ? undefined
            : Math.round(parseFloat(protein));

      return {
        id: todayEntry?.id ?? nanoid(),
        date: today,
        morningWeight: mw,
        nightWeight,
        calories: calOut,
        protein: protOut,
        steps: steps.trim() === "" ? undefined : Math.round(parseFloat(steps)),
        sleep: sleep.trim() === "" ? undefined : parseFloat(sleep),
        notes: notes.trim() === "" ? undefined : notes.trim(),
        lateSnack: habits.lateSnack,
        highSodium: habits.highSodium,
        workout: habits.workout,
        alcohol: habits.alcohol,
        photoUrl: todayEntry?.photoUrl,
      };
    },
    [
      today,
      todayEntry,
      canSave,
      morning,
      morningNum,
      u,
      night,
      calories,
      protein,
      steps,
      sleep,
      caloriesProteinAggregate,
      notes,
    ],
  );

  const applyVoiceDaily = useCallback(
    (d: VoiceDailyFormApply) => {
      if (d.morningWeightKg != null) {
        setMorning(String(Math.round(kgToInput(d.morningWeightKg, u) * 10) / 10));
      }
      if (d.nightWeightKg != null) {
        setNight(String(Math.round(kgToInput(d.nightWeightKg, u) * 10) / 10));
      }
      if (!caloriesProteinAggregate?.readOnly) {
        if (d.calories != null) setCalories(String(d.calories));
        if (d.proteinG != null) setProtein(String(d.proteinG));
        if (d.foodKcalDelta != null && d.foodKcalDelta > 0) {
          setCalories((c) => {
            const base = parseFloat(c.trim() === "" ? "0" : c) || 0;
            return String(Math.round(base + d.foodKcalDelta!));
          });
        }
        if (d.foodProteinDeltaG != null && d.foodProteinDeltaG > 0) {
          setProtein((p) => {
            const base = parseFloat(p.trim() === "" ? "0" : p) || 0;
            return String(Math.round(base + d.foodProteinDeltaG!));
          });
        }
      }
      if (d.steps != null) setSteps(String(d.steps));
      if (d.sleepHours != null) setSleep(String(d.sleepHours));
      setWorkout(d.workout);
      setAlcohol(d.alcohol);
      setLateSnack(d.lateSnack);
      setHighSodium(d.highSodium);
      if (d.appendMealsSummaryToNotes || d.appendTranscriptToNotes) {
        setNotes((prev) => {
          let n = prev.trim();
          if (d.appendMealsSummaryToNotes && d.mealsSummaryForNotes?.trim()) {
            n = n
              ? `${n}\n\nMeals (voice summary): ${d.mealsSummaryForNotes.trim()}`
              : `Meals (voice summary): ${d.mealsSummaryForNotes.trim()}`;
          }
          if (d.appendTranscriptToNotes && d.transcript.trim()) {
            n = n
              ? `${n}\n\nVoice transcript:\n${d.transcript.trim()}`
              : `Voice transcript:\n${d.transcript.trim()}`;
          }
          return n;
        });
      }
      if (d.syncActivityToEnergyCard && d.activityBurnHint?.trim()) {
        onVoiceEnergyActivityPrefill?.({
          nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          text: d.activityBurnHint.trim(),
        });
      }

      const meals = d.spokenFoodMealsToLog;
      if (meals?.length && today && getVoiceAccessToken) {
        const token = getVoiceAccessToken();
        if (token) {
          void (async () => {
            for (const item of meals) {
              const lib = await postMealLibraryCreate(
                {
                  name: item.name,
                  meal_type: item.meal_type,
                  kcal: item.kcal,
                  protein_g: item.protein_g,
                  source: "voice_daily_log",
                },
                token,
              );
              if (!lib.ok) {
                setSaveError(lib.error ?? "Could not save meal to library");
                return;
              }
              const dayRes = await postDayMealEntry(
                today,
                {
                  name: item.name,
                  meal_type: item.meal_type,
                  kcal: item.kcal,
                  protein_g: item.protein_g,
                  notes: item.notes,
                  raw_input: d.transcript.trim() || undefined,
                  source: "voice_daily_log",
                },
                token,
              );
              if (!dayRes.ok) {
                setSaveError(dayRes.error ?? "Could not log meal");
                return;
              }
            }
            await postInsightCacheInvalidateAfterMeals(token);
            onVoiceMealsLogged?.();
          })();
        }
      }
    },
    [
      u,
      today,
      caloriesProteinAggregate?.readOnly,
      getVoiceAccessToken,
      onVoiceEnergyActivityPrefill,
      onVoiceMealsLogged,
    ],
  );

  function scheduleHabitPersist(next: {
    workout: boolean;
    alcohol: boolean;
    lateSnack: boolean;
    highSodium: boolean;
  }) {
    if (!todayEntry) return;
    if (habitSaveTimerRef.current) clearTimeout(habitSaveTimerRef.current);
    habitSaveTimerRef.current = setTimeout(() => {
      habitSaveTimerRef.current = null;
      const entry = buildTodayEntry(next);
      if (!entry) return;
      setSaveError(null);
      void saveEntry(entry).then((r) => {
        if (!r.ok) setSaveError(r.error ?? "Could not save habits");
        else {
          setPulse(true);
          window.setTimeout(() => setPulse(false), 450);
        }
      });
    }, 420);
  }

  function handleSave() {
    if (!canSave || !today) return;
    const entry = buildTodayEntry({ workout, alcohol, lateSnack, highSodium });
    if (!entry) return;
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
      id="todays-log"
      animate={pulse ? { scale: [1, 1.01, 1] } : undefined}
      transition={{ duration: 0.35 }}
      className="scroll-mt-28"
    >
      <Card title="Today's log" variant="surface">
        <div className="mb-2 flex items-center justify-end gap-2">
          {voiceDailyLogEnabled && getVoiceAccessToken ? (
            <>
              <button
                type="button"
                onClick={() => setVoiceSheetOpen(true)}
                className="inline-flex items-center gap-1 rounded-md border border-sky-500/25 bg-sky-500/10 px-2 py-0.5 text-[10px] font-medium text-sky-300 hover:bg-sky-500/20"
                aria-label="Voice log today"
              >
                <Mic className="h-3 w-3" />
                Voice
              </button>
              <VoiceDailyLogSheet
                open={voiceSheetOpen}
                onClose={() => setVoiceSheetOpen(false)}
                unit={u}
                caloriesProteinReadOnly={Boolean(caloriesProteinAggregate?.readOnly)}
                mealLibraryEnabled={Boolean(voiceMealLibrarySyncEnabled)}
                getAccessToken={getVoiceAccessToken}
                onApply={applyVoiceDaily}
              />
            </>
          ) : null}
          <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
            {todayEntry ? "Saved" : "New"}
          </span>
        </div>
        {!todayEntry ? (
          <p className="mb-2 text-[11px] leading-snug text-zinc-500">
            Enter your <span className="font-medium text-zinc-400">morning weight</span>, then tap{" "}
            <span className="font-medium text-emerald-400/90">Save today</span> at the bottom. The
            weight summary above updates after a successful save.
          </p>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
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
            label={
              <>
                Night weight{" "}
                <span className="text-[9px] normal-case tracking-normal text-zinc-500">
                  (optional)
                </span>
              </>
            }
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
            readOnly={Boolean(caloriesProteinAggregate?.readOnly)}
            title={
              caloriesProteinAggregate?.readOnly && calories.trim() !== ""
                ? `Total from logged meals: ${calories} kcal (saved with Today)`
                : undefined
            }
            placeholder={
              ph?.calories !== undefined ? String(ph.calories) : ""
            }
            trailingAccessory={
              renderCaloriesAccessory && today
                ? renderCaloriesAccessory({
                    todayKey: today,
                    calories,
                    protein,
                    setCalories,
                    setProtein,
                  })
                : undefined
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
            readOnly={Boolean(caloriesProteinAggregate?.readOnly)}
            placeholder={
              ph?.protein !== undefined ? String(ph.protein) : ""
            }
          />
          {caloriesProteinAggregate?.readOnly && caloriesProteinAggregate.caption ? (
            <p className="text-[10px] text-zinc-500 sm:col-span-2">
              {caloriesProteinAggregate.caption}
            </p>
          ) : null}
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
        <details className="mt-2 rounded-lg border border-zinc-800/80 bg-zinc-900/30 px-2 py-1.5">
          <summary className="cursor-pointer select-none text-[10px] text-zinc-500">
            Notes (optional)
          </summary>
          <textarea
            id="daily-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="mt-2 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 outline-none ring-emerald-500/25 focus:ring-2"
            placeholder="Private notes for this day…"
          />
        </details>
        <div className="mt-3 border-t border-zinc-800 pt-3">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-100">
            Daily habits
          </p>
          {todayEntry ? (
            <p className="mb-2 text-[10px] text-zinc-600">
              Toggles save automatically. Alcohol on means you drank that day.
            </p>
          ) : (
            <p className="mb-2 text-[10px] text-zinc-600">
              Save today once with your morning weight; then habits sync on each tap.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2 sm:gap-x-3 sm:gap-y-2.5">
            <Toggle
              id="workout"
              label="Workout"
              habitPolarity="positive"
              checked={workout}
              onChange={(v) => {
                setWorkout(v);
                scheduleHabitPersist({
                  workout: v,
                  alcohol,
                  lateSnack,
                  highSodium,
                });
              }}
              className="min-w-0"
            />
            <Toggle
              id="alcohol"
              label="Alcohol"
              habitPolarity="negative"
              checked={alcohol}
              onChange={(v) => {
                setAlcohol(v);
                scheduleHabitPersist({
                  workout,
                  alcohol: v,
                  lateSnack,
                  highSodium,
                });
              }}
              className="min-w-0"
            />
            <Toggle
              id="lateSnack"
              label="Late snack"
              habitPolarity="negative"
              checked={lateSnack}
              onChange={(v) => {
                setLateSnack(v);
                scheduleHabitPersist({
                  workout,
                  alcohol,
                  lateSnack: v,
                  highSodium,
                });
              }}
              className="min-w-0"
            />
            <Toggle
              id="highSodium"
              label="High sodium"
              habitPolarity="negative"
              checked={highSodium}
              onChange={(v) => {
                setHighSodium(v);
                scheduleHabitPersist({
                  workout,
                  alcohol,
                  lateSnack,
                  highSodium: v,
                });
              }}
              className="min-w-0"
            />
          </div>
        </div>
        {saveError ? (
          <p className="mt-4 text-sm text-rose-400">{saveError}</p>
        ) : null}
        <div className="mt-3">
          <button
            type="button"
            disabled={!canSave}
            onClick={handleSave}
            className="w-full rounded-xl bg-emerald-500 py-2 text-sm font-semibold text-white transition-all duration-200 hover:bg-emerald-400 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {todayEntry ? "Update today" : "Save today"}
          </button>
        </div>
      </Card>
    </motion.div>
  );
}
