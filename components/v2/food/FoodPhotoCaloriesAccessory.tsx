"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera } from "lucide-react";
import { track } from "@/lib/analytics";
import { trackMealStickiness } from "@/lib/mealStickinessAnalytics";
import type { DailyInputCaloriesAccessoryContext } from "@/components/DailyInput";
import {
  getMealsSuggestMatch,
  postDayMealEntry,
  postFoodLogConfirm,
  postFoodMealComplete,
  postFoodVisionEstimate,
  uploadPhotoFile,
  type MealLibraryRow,
} from "@/lib/frontend-api-client";
import type { FoodVisionEstimate } from "@/lib/food/contracts";
import { inferMealTypeFromLocalTime, isMealType, MEAL_TYPES, type MealType } from "@/lib/meals/mealTypes";

type Props = DailyInputCaloriesAccessoryContext & {
  getAccessToken: () => string | null;
  /** P1.3.1 — extended confirm + meal-complete when true. */
  mealLibraryEnabled?: boolean;
  /** IANA timezone for meal-type suggestion when vision returns null. */
  clientTimezone?: string;
  onMealsChanged?: () => void;
  /** When two instances mount (e.g. today + past days), pass unique ids to avoid duplicate DOM ids. */
  fileInputId?: string;
  errorElementId?: string;
};

const DEFAULT_FOOD_PHOTO_INPUT_ID = "food-photo-meal-file";
const DEFAULT_FOOD_PHOTO_ERR_ID = "food-photo-meal-err";

type DialogState = {
  estimate: FoodVisionEstimate;
  foodLogId: string;
  kcal: string;
  protein: string;
  dishName: string;
  initialDishName: string;
  mealType: MealType;
  saveToLibrary: boolean;
};

function normalizeFoodName(value: string): string {
  return value.trim().toLowerCase();
}

export function FoodPhotoCaloriesAccessory(props: Props) {
  const fileInputId = props.fileInputId ?? DEFAULT_FOOD_PHOTO_INPUT_ID;
  const errorElementId = props.errorElementId ?? DEFAULT_FOOD_PHOTO_ERR_ID;
  const tz =
    props.clientTimezone ?? (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "UTC");
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshingNutrition, setRefreshingNutrition] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [quickMatch, setQuickMatch] = useState<MealLibraryRow | null>(null);
  const [quickMatchDismissed, setQuickMatchDismissed] = useState(false);
  const [nutritionRefreshFailedForName, setNutritionRefreshFailedForName] = useState<string | null>(null);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDialog(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

  useEffect(() => {
    if (!dialog || !props.mealLibraryEnabled) {
      setQuickMatch(null);
      setQuickMatchDismissed(false);
      return;
    }
    let cancelled = false;
    const q = (dialog.estimate.suggestedName ?? dialog.estimate.mealLabel).trim();
    if (!q) return;
    const token = props.getAccessToken();
    if (!token) return;
    void (async () => {
      const res = await getMealsSuggestMatch(q, token);
      if (cancelled) return;
      if (res.ok && res.data.match && res.data.similarity >= 0.6) {
        setQuickMatch(res.data.match);
      } else {
        setQuickMatch(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dialog, props.mealLibraryEnabled, props.getAccessToken]);

  async function onFile(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0];
    ev.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErr("Choose an image file.");
      return;
    }
    const token = props.getAccessToken();
    if (!token) {
      setErr("Sign in required.");
      return;
    }
    setErr(null);
    setBusy(true);
    track("food_photo_uploaded", { day: props.todayKey });
    const up = await uploadPhotoFile(file, token, {
      day: props.todayKey,
      kind: "food",
    });
    if (!up.ok || !up.photoUrl) {
      setBusy(false);
      setErr(up.error ?? "Upload failed");
      return;
    }
    trackMealStickiness({
      action: "photo_uploaded",
      day: props.todayKey,
    });
    const est = await postFoodVisionEstimate(
      { photoUrl: up.photoUrl, day: props.todayKey },
      token,
    );
    setBusy(false);
    if (!est.ok) {
      track("food_estimate_returned", {
        day: props.todayKey,
        ok: false,
      });
      setErr(est.error ?? "Estimate failed");
      return;
    }
    const e = est.data.estimate;
    track("food_estimate_returned", {
      day: props.todayKey,
      ok: true,
      mealLabel: e.mealLabel,
      confidence: e.confidence,
    });
    const inferred = inferMealTypeFromLocalTime(new Date(), tz);
    const mealType: MealType =
      e.suggestedMealType != null && isMealType(e.suggestedMealType) ? e.suggestedMealType : inferred;
    const dishName = (e.suggestedName ?? e.mealLabel).trim() || e.mealLabel;
    setDialog({
      estimate: e,
      foodLogId: est.data.foodLogId,
      kcal: String(e.kcalMid),
      protein: String(e.proteinG),
      dishName,
      initialDishName: dishName,
      mealType,
      saveToLibrary: true,
    });
    setQuickMatchDismissed(false);
    setNutritionRefreshFailedForName(null);
  }

  async function acceptQuickMatch() {
    if (!dialog || !quickMatch) return;
    const token = props.getAccessToken();
    if (!token) return;
    track("meal_quick_match_accepted", {
      day: props.todayKey,
      mealId: quickMatch.id,
      foodLogId: dialog.foodLogId,
    });
    const kc = Math.round(quickMatch.estKcal);
    const pr = Math.round(quickMatch.estProteinG);
    const confirmRes = await postFoodLogConfirm(
      {
        foodLogId: dialog.foodLogId,
        confirmedKcal: kc,
        confirmedProtein: pr,
      },
      token,
    );
    if (!confirmRes.ok) {
      setErr(confirmRes.error ?? "Could not confirm food log");
      return;
    }
    const add = await postDayMealEntry(props.todayKey, { meal_id: quickMatch.id }, token);
    if (!add.ok) {
      setErr(add.error ?? "Could not log meal");
      return;
    }
    const entryId = add.data.entry?.id;
    if (entryId) {
      trackMealStickiness({
        action: "reuse_logged",
        day: props.todayKey,
        mealId: quickMatch.id,
        entryId,
        source: "quick_match",
      });
    }
    track("meal_logged_from_photo", { day: props.todayKey, mealId: quickMatch.id, quickMatch: true });
    track("meal_logged_from_library", { day: props.todayKey, mealId: quickMatch.id, source: "quick_match" });
    setErr(null);
    props.setCalories(String(kc));
    props.setProtein(String(pr));
    setDialog(null);
    props.onMealsChanged?.();
  }

  function rejectQuickMatch() {
    track("meal_quick_match_rejected", { day: props.todayKey });
    setQuickMatchDismissed(true);
  }

  async function confirmDialog() {
    if (!dialog) return;
    const token = props.getAccessToken();
    if (!token) return;
    let kcalN = Math.round(Number(dialog.kcal));
    let protN = Math.round(Number(dialog.protein));
    if (!Number.isFinite(kcalN) || !Number.isFinite(protN)) {
      setErr("Enter valid numbers.");
      return;
    }
    setSaving(true);
    const mid = dialog.estimate.kcalMid;
    const protEst = dialog.estimate.proteinG;
    const edited = kcalN !== mid || protN !== protEst;
    if (edited) {
      track("food_estimate_edited", {
        day: props.todayKey,
        foodLogId: dialog.foodLogId,
      });
    }
    track("food_estimate_confirmed", {
      day: props.todayKey,
      foodLogId: dialog.foodLogId,
      edited,
    });

    if (props.mealLibraryEnabled) {
      const dishName = dialog.dishName.trim();
      if (!dishName) {
        setSaving(false);
        setErr("Enter a dish name.");
        return;
      }
      let carbsOut =
        dialog.estimate.carbsGRange != null
          ? Math.round((dialog.estimate.carbsGRange.low + dialog.estimate.carbsGRange.high) / 2)
          : undefined;
      let fatOut =
        dialog.estimate.fatGRange != null
          ? Math.round((dialog.estimate.fatGRange.low + dialog.estimate.fatGRange.high) / 2)
          : undefined;
      const normalizedDish = normalizeFoodName(dishName);
      const normalizedInitial = normalizeFoodName(dialog.initialDishName);

      // Only refresh nutrition when the user truly changed the food name (case-insensitive).
      // This avoids duplicate lookups for unrelated edits (meal type/notes), and preserves existing behavior.
      if (
        normalizedDish &&
        normalizedDish !== normalizedInitial &&
        nutritionRefreshFailedForName !== normalizedDish
      ) {
        setRefreshingNutrition(true);
        const matchRes = await getMealsSuggestMatch(dishName, token);
        setRefreshingNutrition(false);
        if (!matchRes.ok) {
          setSaving(false);
          setNutritionRefreshFailedForName(normalizedDish);
          setErr(
            "Could not refresh nutrition for the corrected name. You can adjust calories and protein manually, then save.",
          );
          return;
        }
        if (matchRes.data.match) {
          kcalN = Math.round(Number(matchRes.data.match.estKcal));
          protN = Math.round(Number(matchRes.data.match.estProteinG));
          carbsOut = matchRes.data.match.estCarbsG != null ? Math.round(Number(matchRes.data.match.estCarbsG)) : carbsOut;
          fatOut = matchRes.data.match.estFatG != null ? Math.round(Number(matchRes.data.match.estFatG)) : fatOut;
          setDialog((d) =>
            d
              ? {
                  ...d,
                  kcal: String(kcalN),
                  protein: String(protN),
                  initialDishName: d.dishName.trim(),
                }
              : d,
          );
          setNutritionRefreshFailedForName(null);
        } else {
          setSaving(false);
          setNutritionRefreshFailedForName(normalizedDish);
          setErr(
            "No nutrition match found for the corrected name. Edit calories/protein manually, then save.",
          );
          return;
        }
      }
      const res = await postFoodMealComplete(
        {
          foodLogId: dialog.foodLogId,
          confirmedKcal: kcalN,
          confirmedProtein: protN,
          dishName,
          mealType: dialog.mealType,
          saveToLibrary: dialog.saveToLibrary,
          carbsG: carbsOut,
          fatG: fatOut,
        },
        token,
      );
      if (!res.ok) {
        setSaving(false);
        setErr(res.error ?? "Could not save meal");
        return;
      }
      setSaving(false);
      setErr(null);
      track("meal_logged_from_photo", {
        day: props.todayKey,
        foodLogId: dialog.foodLogId,
        saveToLibrary: dialog.saveToLibrary,
      });
      const completedEntryId = res.data.entry?.id;
      if (completedEntryId) {
        const libId = res.data.libraryMealId ?? null;
        trackMealStickiness({
          action: "photo_flow_completed",
          day: props.todayKey,
          foodLogId: dialog.foodLogId,
          entryId: completedEntryId,
          saveToLibrary: dialog.saveToLibrary,
          libraryMealId: libId,
          newLibraryItem: Boolean(dialog.saveToLibrary && libId),
          dishName: dishName.slice(0, 120),
        });
      }
      if (dialog.saveToLibrary) {
        track("meal_saved_to_library", { day: props.todayKey, dishName });
      }
      props.setCalories(String(kcalN));
      props.setProtein(String(protN));
      setDialog(null);
      props.onMealsChanged?.();
      return;
    }

    const confirmRes = await postFoodLogConfirm(
      {
        foodLogId: dialog.foodLogId,
        confirmedKcal: kcalN,
        confirmedProtein: protN,
      },
      token,
    );
    if (!confirmRes.ok) {
      setSaving(false);
      setErr(confirmRes.error ?? "Could not confirm food log");
    } else {
      setSaving(false);
      setErr(null);
    }
    props.setCalories(String(kcalN));
    props.setProtein(String(protN));
    setDialog(null);
  }

  const showQuickBanner =
    Boolean(props.mealLibraryEnabled && dialog && quickMatch && !quickMatchDismissed);

  return (
    <>
      <div className="relative flex shrink-0">
        <input
          ref={inputRef}
          id={fileInputId}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp,.jpg,.jpeg,.png,.gif,.webp"
          className="sr-only"
          onChange={onFile}
          tabIndex={-1}
          aria-hidden
        />
        <label
          htmlFor={fileInputId}
          className={`flex h-9 cursor-pointer items-center justify-center rounded-lg border border-zinc-600 bg-zinc-800 px-2 text-zinc-300 transition-colors hover:border-emerald-600/60 hover:text-emerald-400 ${busy || saving ? "pointer-events-none opacity-50" : ""}`}
          aria-label="Log food from photo"
          aria-busy={busy || saving}
          aria-describedby={err ? errorElementId : undefined}
        >
          <Camera className="h-4 w-4" aria-hidden />
        </label>
        {err ? (
          <span
            id={errorElementId}
            role="status"
            className="absolute left-1/2 top-full z-20 mt-1 w-max max-w-[14rem] -translate-x-1/2 rounded-md border border-rose-500/30 bg-rose-950/95 px-2 py-1 text-center text-[10px] leading-snug text-rose-200 shadow-lg"
          >
            {err}
          </span>
        ) : null}
      </div>
      {dialog && typeof document !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-4 sm:items-center"
              role="presentation"
              onMouseDown={(e) => {
                if (e.target === e.currentTarget) setDialog(null);
              }}
            >
              <div
                className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-900 p-4 shadow-xl"
                role="dialog"
                aria-modal="true"
                aria-labelledby="food-estimate-title"
              >
                <h2
                  id="food-estimate-title"
                  className="text-sm font-semibold text-zinc-100"
                >
                  Meal estimate
                </h2>
                <p className="mt-1 text-xs text-zinc-400">
                  {dialog.estimate.mealLabel} · ~{dialog.estimate.kcalLow}–
                  {dialog.estimate.kcalHigh} kcal (mid {dialog.estimate.kcalMid})
                </p>
                {refreshingNutrition ? (
                  <p className="mt-2 text-xs text-emerald-300">Refreshing nutrition for corrected food name…</p>
                ) : null}

                {showQuickBanner && quickMatch ? (
                  <div className="mt-3 rounded-lg border border-emerald-600/40 bg-emerald-950/40 p-3 text-xs text-emerald-100">
                    <p>
                      Looks like your usual <span className="font-semibold">{quickMatch.name}</span> — use that?
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded-md bg-emerald-600 px-2 py-1.5 text-[11px] font-medium text-white hover:bg-emerald-500"
                        onClick={() => void acceptQuickMatch()}
                      >
                        Yes, use it
                      </button>
                      <button
                        type="button"
                        className="rounded-md border border-zinc-600 px-2 py-1.5 text-[11px] text-zinc-300 hover:bg-zinc-800"
                        onClick={rejectQuickMatch}
                      >
                        No, this is different
                      </button>
                    </div>
                  </div>
                ) : null}

                {!showQuickBanner ? (
                  <>
                    <p className="mt-3 text-sm text-zinc-300">
                      We estimate ~{dialog.estimate.kcalMid} kcal,{" "}
                      {dialog.estimate.proteinG}g protein. Adjust?
                    </p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <label className="block text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                        Calories (kcal)
                        <input
                          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 font-mono text-sm text-zinc-100"
                          inputMode="numeric"
                          value={dialog.kcal}
                          onChange={(e) =>
                            setDialog((d) => (d ? { ...d, kcal: e.target.value } : d))
                          }
                        />
                      </label>
                      <label className="block text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                        Protein (g)
                        <input
                          className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 font-mono text-sm text-zinc-100"
                          inputMode="numeric"
                          value={dialog.protein}
                          onChange={(e) =>
                            setDialog((d) => (d ? { ...d, protein: e.target.value } : d))
                          }
                        />
                      </label>
                    </div>
                    {props.mealLibraryEnabled ? (
                      <div className="mt-4 space-y-3 border-t border-zinc-800 pt-3">
                        <label className="block text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                          Dish name
                          <input
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-800 px-2 py-2 text-sm text-zinc-100"
                            value={dialog.dishName}
                            onChange={(e) =>
                              setDialog((d) => (d ? { ...d, dishName: e.target.value } : d))
                            }
                          />
                        </label>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">
                            Meal type
                          </p>
                          <div className="mt-1 flex flex-wrap gap-1.5">
                            {MEAL_TYPES.map((t) => (
                              <button
                                key={t}
                                type="button"
                                onClick={() => setDialog((d) => (d ? { ...d, mealType: t } : d))}
                                className={`rounded-full px-2.5 py-1 text-[10px] capitalize ${
                                  dialog.mealType === t
                                    ? "bg-emerald-600 text-white"
                                    : "border border-zinc-600 bg-zinc-800 text-zinc-300 hover:border-emerald-600/50"
                                }`}
                              >
                                {t}
                              </button>
                            ))}
                          </div>
                        </div>
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
                          <input
                            type="checkbox"
                            className="rounded border-zinc-600"
                            checked={dialog.saveToLibrary}
                            onChange={(e) =>
                              setDialog((d) => (d ? { ...d, saveToLibrary: e.target.checked } : d))
                            }
                          />
                          Save to my meal library
                        </label>
                      </div>
                    ) : null}
                  </>
                ) : null}

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200"
                    onClick={() => setDialog(null)}
                  >
                    Cancel
                  </button>
                  {!showQuickBanner ? (
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={() => void confirmDialog()}
                      disabled={saving || refreshingNutrition}
                    >
                      {saving || refreshingNutrition
                        ? "Refreshing nutrition…"
                        : props.mealLibraryEnabled
                          ? "Save meal"
                          : "Use values"}
                    </button>
                  ) : null}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
