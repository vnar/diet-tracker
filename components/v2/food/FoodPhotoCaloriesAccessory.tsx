"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Camera } from "lucide-react";
import { track } from "@/lib/analytics";
import type { DailyInputCaloriesAccessoryContext } from "@/components/DailyInput";
import {
  postFoodLogConfirm,
  postFoodVisionEstimate,
  uploadPhotoFile,
} from "@/lib/frontend-api-client";
import type { FoodVisionEstimate } from "@/lib/food/contracts";

type Props = DailyInputCaloriesAccessoryContext & {
  getAccessToken: () => string | null;
};

export function FoodPhotoCaloriesAccessory(props: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{
    estimate: FoodVisionEstimate;
    foodLogId: string;
    kcal: string;
    protein: string;
  } | null>(null);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDialog(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog]);

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
    setDialog({
      estimate: e,
      foodLogId: est.data.foodLogId,
      kcal: String(e.kcalMid),
      protein: String(e.proteinG),
    });
  }

  async function confirmDialog() {
    if (!dialog) return;
    const token = props.getAccessToken();
    if (!token) return;
    const kcalN = Math.round(Number(dialog.kcal));
    const protN = Math.round(Number(dialog.protein));
    if (!Number.isFinite(kcalN) || !Number.isFinite(protN)) {
      setErr("Enter valid numbers.");
      return;
    }
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
    const confirmRes = await postFoodLogConfirm(
      {
        foodLogId: dialog.foodLogId,
        confirmedKcal: kcalN,
        confirmedProtein: protN,
      },
      token,
    );
    if (!confirmRes.ok) {
      setErr(confirmRes.error ?? "Could not confirm food log");
    } else {
      setErr(null);
    }
    props.setCalories(String(kcalN));
    props.setProtein(String(protN));
    setDialog(null);
  }

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFile}
      />
      <button
        type="button"
        disabled={busy}
        title={err ?? "Estimate calories from a meal photo"}
        aria-label="Log food from photo"
        onClick={() => {
          setErr(null);
          inputRef.current?.click();
        }}
        className="flex h-9 shrink-0 items-center justify-center rounded-lg border border-zinc-600 bg-zinc-800 px-2 text-zinc-300 transition-colors hover:border-emerald-600/60 hover:text-emerald-400 disabled:opacity-50"
      >
        <Camera className="h-4 w-4" aria-hidden />
      </button>
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
                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-sm text-zinc-400 hover:text-zinc-200"
                    onClick={() => setDialog(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                    onClick={() => void confirmDialog()}
                  >
                    Use values
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
