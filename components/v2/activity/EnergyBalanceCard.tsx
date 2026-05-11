"use client";

import { useEffect, useRef, useState } from "react";
import { Flame, Footprints, Loader2, Sparkles } from "lucide-react";
import type { DailyEntry } from "@/lib/types";
import { normalizeCoachTone, weeklyEnergyCoachLine, type CoachTone } from "@/lib/coachTone";
import {
  getEnergyWeeklySummary,
  postActivityBurnEstimate,
  postActivityLog,
  type DayMealEntryRow,
} from "@/lib/frontend-api-client";

function estimateBaselineBurn(weightKg: number): number {
  // Additive, stable heuristic: resting kcal/day ~ 22 kcal per kg.
  return Math.round(weightKg * 22);
}

function estimateStepBurn(steps?: number): number {
  if (!steps || steps <= 0) return 0;
  return Math.round(steps * 0.04);
}

function estimateActivityBurn(text: string, weightKg: number): number {
  const t = text.toLowerCase().trim();
  if (!t) return 0;
  const minMatch = t.match(/(\d+)\s*(min|mins|minute|minutes|hr|hrs|hour|hours)\b/);
  let mins = 30;
  if (minMatch) {
    const n = Number(minMatch[1]);
    const unit = minMatch[2] ?? "min";
    mins = unit.startsWith("h") ? n * 60 : n;
  }
  const met =
    t.includes("bike") || t.includes("cycling")
      ? 7
      : t.includes("mow") || t.includes("lawn")
        ? 5
        : t.includes("run") || t.includes("jog")
          ? 8
          : t.includes("walk")
            ? 3.5
            : t.includes("swim")
              ? 6
              : 4;
  // kcal/min = MET * 3.5 * kg / 200
  return Math.round((met * 3.5 * weightKg * mins) / 200);
}

type Props = {
  day: string;
  todayEntry?: DailyEntry;
  mealEntries: DayMealEntryRow[];
  getAccessToken: () => string | null;
  initialCalibrationFactor?: number;
  /** Saved coach tone for weekly summary phrasing. */
  coachTone?: CoachTone;
  /** From voice log apply: merge into activity text so user can tap AI estimate. */
  voiceActivityPrefill?: { nonce: string; text: string } | null;
  onVoiceActivityPrefillConsumed?: () => void;
};

export function EnergyBalanceCard(props: Props) {
  const weightKg = props.todayEntry?.morningWeight ?? 70;
  const consumedMeals = props.mealEntries.reduce((sum, e) => sum + (e.kcal ?? 0), 0);
  const consumed = consumedMeals > 0 ? consumedMeals : (props.todayEntry?.calories ?? 0);
  const stepBurn = estimateStepBurn(props.todayEntry?.steps);
  const [activityText, setActivityText] = useState((props.todayEntry?.notes ?? "").trim());
  const [aiBurn, setAiBurn] = useState<number | null>(null);
  const [aiConfidence, setAiConfidence] = useState<number | null>(null);
  const [aiSummary, setAiSummary] = useState<string>("");
  const [aiMinutes, setAiMinutes] = useState<number>(0);
  const [aiMet, setAiMet] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [calibration, setCalibration] = useState<number>(props.initialCalibrationFactor ?? 1);
  const [weeklyAvgNet, setWeeklyAvgNet] = useState<number | null>(null);
  const [weeklyTrend, setWeeklyTrend] = useState<"deficit" | "surplus" | "near_maintenance" | null>(null);

  const activityBurnRaw = aiBurn ?? estimateActivityBurn(activityText, weightKg);
  const activityBurn = Math.round(activityBurnRaw * calibration);
  const baselineBurn = estimateBaselineBurn(weightKg);
  const totalBurn = baselineBurn + stepBurn + activityBurn;
  const net = consumed - totalBurn;

  async function runAiEstimate() {
    const token = props.getAccessToken();
    if (!token || !activityText.trim()) return;
    setBusy(true);
    setErr(null);
    const res = await postActivityBurnEstimate(
      { activityText: activityText.trim(), weightKg },
      token,
    );
    setBusy(false);
    if (!res.ok) {
      setErr(res.error);
      return;
    }
    setAiBurn(res.data.kcalBurn);
    setAiConfidence(res.data.confidence);
    setAiSummary(res.data.activitySummary);
    setAiMinutes(res.data.minutes);
    setAiMet(res.data.met);
  }

  async function saveActivityEstimate() {
    const token = props.getAccessToken();
    if (!token || aiBurn == null) return;
    const res = await postActivityLog(
      {
        day: props.day,
        activityText,
        activitySummary: aiSummary || activityText,
        kcalBurn: aiBurn,
        met: aiMet || 1,
        minutes: aiMinutes || 0,
        confidence: aiConfidence ?? 70,
      },
      token,
    );
    if (!res.ok) setErr(res.error);
    else void loadWeeklySummary();
  }

  async function loadWeeklySummary() {
    const token = props.getAccessToken();
    if (!token) return;
    const res = await getEnergyWeeklySummary(token, props.day);
    if (!res.ok) return;
    setCalibration(res.data.calibrationFactor);
    setWeeklyAvgNet(res.data.avgNetKcal);
    setWeeklyTrend(res.data.trend);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const token = props.getAccessToken();
      if (!token) return;
      const res = await getEnergyWeeklySummary(token, props.day);
      if (cancelled || !res.ok) return;
      setCalibration(res.data.calibrationFactor);
      setWeeklyAvgNet(res.data.avgNetKcal);
      setWeeklyTrend(res.data.trend);
    })();
    return () => {
      cancelled = true;
    };
  }, [props.day, props.getAccessToken]);

  const lastVoiceNonceRef = useRef<string | null>(null);
  useEffect(() => {
    const pre = props.voiceActivityPrefill;
    if (!pre?.text.trim()) return;
    if (pre.nonce === lastVoiceNonceRef.current) return;
    lastVoiceNonceRef.current = pre.nonce;
    const t = pre.text.trim();
    setActivityText((prev) => {
      const p = prev.trim();
      if (!p) return t;
      if (p.includes(t)) return p;
      return `${p}; ${t}`;
    });
    setAiBurn(null);
    setAiConfidence(null);
    setAiSummary("");
    setAiMinutes(0);
    setAiMet(0);
    props.onVoiceActivityPrefillConsumed?.();
  }, [props.voiceActivityPrefill]);

  const tone = normalizeCoachTone(props.coachTone);

  return (
    <div className="rounded-xl border border-zinc-800/90 bg-gradient-to-b from-zinc-900/90 to-zinc-950/80 p-3 shadow-inner shadow-black/20">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10px] font-medium uppercase tracking-widest text-zinc-500">Energy balance (beta)</p>
        <span className="inline-flex items-center gap-1 text-[10px] text-violet-300">
          <Sparkles className="h-3 w-3" /> smart estimate
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/70 p-2">
          <p className="text-[10px] text-zinc-500">Consumed</p>
          <p className="font-mono text-lg text-emerald-300">{Math.round(consumed)} kcal</p>
        </div>
        <div className="rounded-lg border border-zinc-700 bg-zinc-900/70 p-2">
          <p className="text-[10px] text-zinc-500">Total burn</p>
          <p className="font-mono text-lg text-zinc-100">{Math.round(totalBurn)} kcal</p>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-400">
        <span className="inline-flex items-center gap-1"><Flame className="h-3 w-3" /> Baseline {baselineBurn}</span>
        <span className="inline-flex items-center gap-1"><Footprints className="h-3 w-3" /> Steps {stepBurn}</span>
        <span>Activity {activityBurn}</span>
      </div>
      <p className="mt-1 text-[10px] text-zinc-500">
        Total burn = baseline ({baselineBurn}) + steps ({stepBurn}) + activities ({activityBurn})
      </p>
      <div className="mt-2 flex gap-2">
        <input
          value={activityText}
          onChange={(e) => setActivityText(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-[11px] text-zinc-100"
          placeholder='Activity text (e.g. "45 min bike", "30 min lawn mowing")'
        />
        <button
          type="button"
          onClick={() => void runAiEstimate()}
          disabled={busy || !activityText.trim()}
          className="shrink-0 rounded-md border border-violet-500/30 bg-violet-500/10 px-2 py-1 text-[11px] text-violet-200 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "AI estimate"}
        </button>
      </div>
      {aiSummary ? (
        <p className="mt-1 text-[10px] text-zinc-400">
          {aiSummary}
          {aiConfidence != null ? ` · ${aiConfidence}% confidence` : ""}
        </p>
      ) : null}
      {err ? <p className="mt-1 text-[10px] text-rose-300">{err}</p> : null}
      <p className={`mt-2 text-xs ${net <= 0 ? "text-emerald-300" : "text-amber-300"}`}>
        Net calories: {Math.round(net)} kcal
      </p>
      {weeklyTrend != null && weeklyAvgNet != null ? (
        <p className="mt-2 border-t border-zinc-800/80 pt-2 text-[10px] leading-snug text-zinc-400">
          <span className="font-medium text-zinc-500">Week in review (7 days ending {props.day}): </span>
          {weeklyEnergyCoachLine(weeklyTrend, weeklyAvgNet, tone)}
        </p>
      ) : null}
      {aiBurn != null ? (
        <button
          type="button"
          onClick={() => void saveActivityEstimate()}
          className="mt-2 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 text-[10px] text-emerald-200 hover:bg-emerald-500/20"
        >
          Save activity to today
        </button>
      ) : null}
    </div>
  );
}
