"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Mic, MicOff, Sparkles, X } from "lucide-react";
import { postVoiceDailyLogParse } from "@/lib/frontend-api-client";
import { inferMealTypeFromLocalTime } from "@/lib/meals/mealTypes";
import { inputToKg, kgToInput } from "@/lib/units";
import type { VoiceDailyFormApply, VoiceDailyParsedFields, VoiceSpokenFoodItem } from "@/lib/voiceDailyLog/types";
import { buildSpokenFoodMealsToLog } from "@/lib/voiceDailyLog/spokenFoodMealsFromReview";
import { track } from "@/lib/analytics";
import type { SubscriptionSnapshot } from "@/lib/billing/types";
import { isProUnlocked } from "@/lib/billing/proGate";
import {
  incrementVoiceParsesThisMonth,
  isVoiceParseOverFreeLimit,
} from "@/lib/billing/freeTierUsage";

/** Minimal Web Speech API surface (DOM lib typings omit `SpeechRecognition` in this toolchain). */
type WebSpeechResultList = {
  length: number;
  [index: number]: { isFinal: boolean; 0: { transcript: string } };
};

type WebSpeechRecognitionResultEvent = {
  resultIndex: number;
  results: WebSpeechResultList;
};

type WebSpeechRecognitionErrorEvent = { error: string };

type WebSpeechRecognitionInstance = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((ev: WebSpeechRecognitionResultEvent) => void) | null;
  onerror: ((ev: WebSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecCtor = new () => WebSpeechRecognitionInstance;

function getSpeechRecognitionCtor(): SpeechRecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    webkitSpeechRecognition?: SpeechRecCtor;
    SpeechRecognition?: SpeechRecCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

type VoiceError =
  | "mic_denied"
  | "no_speech"
  | "parse_failed"
  | "parse_network"
  | "parse_route"
  | "parse_gateway"
  | "parse_slow"
  | "parse_access"
  | "not_supported"
  | "unclear"
  | "no_auth"
  | "voice_free_cap";

function classifyVoiceParseFailure(errorText: string): VoiceError {
  const low = errorText.toLowerCase();
  if (low.includes("unauthorized") || errorText.includes("Request failed (401)")) return "no_auth";
  if (low.includes("voice_parse_timeout")) return "parse_slow";
  if (
    low.includes("request failed (502)") ||
    low.includes("request failed (503)") ||
    low.includes("request failed (504)")
  ) {
    return "parse_gateway";
  }
  if (low.includes("request failed (403)")) return "parse_access";
  if (low.includes("couldn't reach") || low.includes("couldn't reach")) return "parse_network";
  if (low.includes("network error")) return "parse_network";
  if (low.includes("you're offline")) return "parse_network";
  if (low.includes("timed out")) return "parse_network";
  if (low.includes("api url is http://") && low.includes("https")) return "parse_network";
  if (low.includes("request failed (404)")) return "parse_route";
  return "parse_failed";
}

function errorCopy(code: VoiceError | null): string | null {
  if (!code) return null;
  switch (code) {
    case "mic_denied":
      return "Microphone access was blocked. Allow the mic for this site in your browser settings, then try again.";
    case "no_speech":
      return "We did not catch any speech. Move closer to the mic, speak clearly, or type your update below.";
    case "parse_failed":
      return "We could not turn that into check-in fields. Edit what you said and try Parse again.";
    case "parse_network":
      return "Could not reach your health API from this browser. Check connection, VPN, and ad blockers. If saving today’s log still works, wait a moment and try Parse again.";
    case "parse_route":
      return "Voice parsing is not wired on this API yet. Deploy the latest CDK backend so API Gateway includes POST /v2/voice-daily-log/parse (same stack as food photos), then hard-refresh.";
    case "parse_gateway":
      return "The API gateway closed the request before parsing finished (often a timeout). Wait a few seconds and tap Parse again, or try a shorter sentence.";
    case "parse_slow":
      return "Parsing took too long and was stopped so the connection would not drop. Try a shorter line, then Parse again.";
    case "parse_access":
      return "The API denied this request (403). Sign out and sign back in, then try Parse again.";
    case "not_supported":
      return "Voice capture is not available in this browser. Try Chrome on desktop, or type your update below.";
    case "unclear":
      return "Add a bit more detail (for example weight and steps), then tap Parse.";
    case "no_auth":
      return "You need to be signed in (with the AWS backend enabled) to parse voice on this portal.";
    case "voice_free_cap":
      return "You’ve used this month’s free voice parses. Pro keeps voice logging generous — upgrade anytime; nothing you already saved is removed.";
    default:
      return null;
  }
}

type VoiceReviewState = {
  morning: string;
  night: string;
  calories: string;
  protein: string;
  steps: string;
  sleep: string;
  workout: boolean;
  alcohol: boolean;
  lateSnack: boolean;
  highSodium: boolean;
  mealsSummary: string;
  activityBurnHint: string;
  syncActivityToEnergy: boolean;
  foodRows: Array<{
    description: string;
    estKcal: string;
    estProteinG: string;
    includeInDaily: boolean;
  }>;
};

type Props = {
  open: boolean;
  onClose: () => void;
  unit: "kg" | "lbs";
  caloriesProteinReadOnly: boolean;
  /** When true, user can append parsed foods to the meal library + today’s meal log (additive). */
  mealLibraryEnabled?: boolean;
  /** When true with a free user, enforce monthly parse cap (localStorage). */
  proMonetizationEnabled?: boolean;
  voiceGateUserId?: string;
  subscription?: SubscriptionSnapshot | null;
  getAccessToken: () => string | null;
  onApply: (draft: VoiceDailyFormApply) => void;
};

function foodItemsToRows(items: VoiceSpokenFoodItem[]): VoiceReviewState["foodRows"] {
  return items.map((it) => ({
    description: it.description,
    estKcal: it.estKcal != null && it.estKcal > 0 ? String(it.estKcal) : "",
    estProteinG: it.estProteinG != null && it.estProteinG > 0 ? String(it.estProteinG) : "",
    includeInDaily: it.estKcal != null && it.estKcal > 0,
  }));
}

function parsedToReviewStrings(p: VoiceDailyParsedFields, unit: "kg" | "lbs"): VoiceReviewState {
  const foodRows =
    p.foodItems.length > 0 ? foodItemsToRows(p.foodItems) : foodItemsToRows([]);
  return {
    morning:
      p.morningWeightKg != null
        ? String(Math.round(kgToInput(p.morningWeightKg, unit) * 10) / 10)
        : "",
    night:
      p.nightWeightKg != null
        ? String(Math.round(kgToInput(p.nightWeightKg, unit) * 10) / 10)
        : "",
    calories: p.calories != null ? String(p.calories) : "",
    protein: p.proteinG != null ? String(p.proteinG) : "",
    steps: p.steps != null ? String(p.steps) : "",
    sleep: p.sleepHours != null ? String(p.sleepHours) : "",
    workout: p.workout === true,
    alcohol: p.alcohol === true,
    lateSnack: p.lateSnack === true,
    highSodium: p.highSodium === true,
    mealsSummary: p.mealsSummary ?? "",
    activityBurnHint: p.activityBurnHint?.trim() ?? "",
    syncActivityToEnergy: Boolean(p.activityBurnHint?.trim()),
    foodRows,
  };
}

export function VoiceDailyLogSheet(props: Props) {
  const {
    open,
    onClose,
    unit,
    caloriesProteinReadOnly,
    mealLibraryEnabled = false,
    proMonetizationEnabled = false,
    voiceGateUserId,
    subscription = null,
    getAccessToken,
    onApply,
  } = props;
  const [transcript, setTranscript] = useState("");
  const [listening, setListening] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [parsed, setParsed] = useState<VoiceDailyParsedFields | null>(null);
  const [review, setReview] = useState<VoiceReviewState | null>(null);
  const [error, setError] = useState<VoiceError | null>(null);
  const [parseDetail, setParseDetail] = useState<string | null>(null);
  const [appendTranscript, setAppendTranscript] = useState(false);
  const [appendMeals, setAppendMeals] = useState(false);
  /** When meal library is on, append checked voice foods as new day meals (additive). */
  const [saveFoodToMealLog, setSaveFoodToMealLog] = useState(false);

  const recRef = useRef<WebSpeechRecognitionInstance | null>(null);
  const startedTrackedRef = useRef(false);
  const transcribedTrackedRef = useRef(false);
  const appliedRef = useRef(false);

  const resetSession = useCallback(() => {
    setTranscript("");
    setListening(false);
    setParsing(false);
    setParsed(null);
    setReview(null);
    setError(null);
    setParseDetail(null);
    setAppendTranscript(false);
    setAppendMeals(false);
    setSaveFoodToMealLog(false);
    transcribedTrackedRef.current = false;
    recRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) return;
    appliedRef.current = false;
    resetSession();
    if (!startedTrackedRef.current) {
      startedTrackedRef.current = true;
      track("voice_log_started");
    }
  }, [open, resetSession]);

  const stopListening = useCallback(() => {
    try {
      recRef.current?.stop();
    } catch {
      /* noop */
    }
    recRef.current = null;
    setListening(false);
  }, []);

  const handleClose = useCallback(() => {
    if (!appliedRef.current) {
      track("voice_log_abandoned", {
        had_transcript: transcript.trim().length > 0,
        had_parse: parsed != null,
      });
    }
    startedTrackedRef.current = false;
    stopListening();
    onClose();
  }, [onClose, parsed, stopListening, transcript]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, handleClose]);

  const startListening = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("not_supported");
      return;
    }
    setError(null);
    stopListening();
    const rec = new Ctor();
    rec.lang = "en-US";
    rec.interimResults = true;
    rec.continuous = false;
    rec.onresult = (ev: WebSpeechRecognitionResultEvent) => {
      let chunk = "";
      for (let i = ev.resultIndex; i < ev.results.length; i += 1) {
        const r = ev.results[i];
        if (r?.isFinal) chunk += r[0]?.transcript ?? "";
      }
      if (chunk.trim()) {
        setTranscript((prev) => `${prev}${prev.trim() ? " " : ""}${chunk.trim()}`);
      }
    };
    rec.onerror = (ev: WebSpeechRecognitionErrorEvent) => {
      if (ev.error === "not-allowed") setError("mic_denied");
      else if (ev.error === "no-speech" || ev.error === "audio-capture") setError("no_speech");
      else setError("no_speech");
      setListening(false);
      recRef.current = null;
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      setTranscript((t) => {
        const next = t.trim();
        if (next && !transcribedTrackedRef.current) {
          transcribedTrackedRef.current = true;
          track("voice_log_transcribed", { source: "speech_recognition" });
        }
        return t;
      });
    };
    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      setError("not_supported");
    }
  }, [stopListening]);

  const handleParse = useCallback(async () => {
    const text = transcript.trim();
    if (!text) {
      setError("unclear");
      return;
    }
    const token = getAccessToken();
    if (!token) {
      setParseDetail(null);
      setError("no_auth");
      return;
    }
    if (
      proMonetizationEnabled &&
      voiceGateUserId &&
      !isProUnlocked(subscription) &&
      isVoiceParseOverFreeLimit(voiceGateUserId)
    ) {
      track("pro_feature_blocked", { feature: "voice_daily_parse", surface: "voice_daily_log_sheet" });
      setParseDetail(null);
      setError("voice_free_cap");
      return;
    }
    if (!transcribedTrackedRef.current) {
      transcribedTrackedRef.current = true;
      track("voice_log_transcribed", { source: "typed_or_pasted" });
    }
    setParsing(true);
    setError(null);
    setParseDetail(null);
    const res = await postVoiceDailyLogParse(text, token);
    setParsing(false);
    if (!res.ok) {
      const kind = classifyVoiceParseFailure(res.error);
      setError(kind);
      const showRawDetail =
        kind === "parse_failed" ||
        kind === "parse_slow" ||
        kind === "parse_gateway" ||
        kind === "parse_access" ||
        (kind === "no_auth" && res.error.trim().length > 0);
      setParseDetail(showRawDetail ? res.error : null);
      return;
    }
    const p = res.data.parsed;
    setParsed(p);
    setReview(parsedToReviewStrings(p, unit));
    setSaveFoodToMealLog(Boolean(mealLibraryEnabled && p.foodItems.length > 0));
    if (proMonetizationEnabled && voiceGateUserId && !isProUnlocked(subscription)) {
      incrementVoiceParsesThisMonth(voiceGateUserId);
    }
    track("voice_log_parsed", {
      confidence: p.confidence,
      unclear_count: p.unclearParts.length,
    });
  }, [
    getAccessToken,
    transcript,
    unit,
    mealLibraryEnabled,
    proMonetizationEnabled,
    voiceGateUserId,
    subscription,
  ]);

  const handleApply = useCallback(() => {
    if (!review) return;
    const morningNum = review.morning.trim() === "" ? NaN : parseFloat(review.morning);
    const nightNum = review.night.trim() === "" ? NaN : parseFloat(review.night);

    const tz =
      typeof Intl !== "undefined"
        ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC"
        : "UTC";
    const inferredMealType = inferMealTypeFromLocalTime(new Date(), tz);
    const wantMealPost =
      Boolean(mealLibraryEnabled && saveFoodToMealLog && review.foodRows.length > 0);
    const spokenFoodMealsToLog = wantMealPost
      ? buildSpokenFoodMealsToLog(review.foodRows, inferredMealType)
      : null;
    const postingMeals = Boolean(spokenFoodMealsToLog?.length);

    let foodKcalDelta = 0;
    let foodProteinDeltaG = 0;
    if (!postingMeals) {
      for (const row of review.foodRows) {
        if (!row.includeInDaily) continue;
        const k = row.estKcal.trim() === "" ? NaN : parseFloat(row.estKcal);
        const pr = row.estProteinG.trim() === "" ? NaN : parseFloat(row.estProteinG);
        if (!Number.isNaN(k) && k > 0) foodKcalDelta += Math.round(k);
        if (!Number.isNaN(pr) && pr > 0) foodProteinDeltaG += Math.round(pr);
      }
    }

    const draft: VoiceDailyFormApply = {
      morningWeightKg:
        !Number.isNaN(morningNum) && morningNum > 0 ? inputToKg(morningNum, unit) : null,
      nightWeightKg:
        review.night.trim() !== "" && !Number.isNaN(nightNum) && nightNum > 0
          ? inputToKg(nightNum, unit)
          : null,
      calories:
        postingMeals || caloriesProteinReadOnly
          ? null
          : review.calories.trim() !== ""
            ? Math.round(parseFloat(review.calories))
            : null,
      proteinG:
        postingMeals || caloriesProteinReadOnly
          ? null
          : review.protein.trim() !== ""
            ? Math.round(parseFloat(review.protein))
            : null,
      steps: review.steps.trim() !== "" ? Math.round(parseFloat(review.steps)) : null,
      sleepHours: review.sleep.trim() !== "" ? parseFloat(review.sleep) : null,
      workout: review.workout,
      alcohol: review.alcohol,
      lateSnack: review.lateSnack,
      highSodium: review.highSodium,
      mealsSummaryForNotes: review.mealsSummary.trim() || null,
      transcript: transcript.trim(),
      appendTranscriptToNotes: appendTranscript,
      appendMealsSummaryToNotes: appendMeals,
      foodKcalDelta:
        postingMeals || caloriesProteinReadOnly || foodKcalDelta <= 0 ? null : foodKcalDelta,
      foodProteinDeltaG:
        postingMeals || caloriesProteinReadOnly || foodProteinDeltaG <= 0
          ? null
          : foodProteinDeltaG,
      activityBurnHint: review.activityBurnHint.trim() || null,
      syncActivityToEnergyCard: review.syncActivityToEnergy && Boolean(review.activityBurnHint.trim()),
      spokenFoodMealsToLog,
    };
    appliedRef.current = true;
    track("voice_log_saved");
    onApply(draft);
    handleClose();
  }, [
    review,
    unit,
    caloriesProteinReadOnly,
    transcript,
    appendTranscript,
    appendMeals,
    mealLibraryEnabled,
    saveFoodToMealLog,
    onApply,
    handleClose,
  ]);

  const lowConfidence =
    parsed != null &&
    (parsed.confidence < 0.42 || (parsed.unclearParts?.length ?? 0) > 0);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-end justify-center bg-black/75 p-4 sm:items-center"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="voice-daily-title"
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-zinc-700 bg-zinc-950 p-4 shadow-2xl"
      >
        <div className="mb-3 flex items-center justify-between border-b border-zinc-800 pb-2">
          <p id="voice-daily-title" className="text-sm font-semibold text-zinc-100">
            Quick voice log
          </p>
          <button
            type="button"
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-900 hover:text-zinc-200"
            aria-label="Close"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mb-2 text-[11px] leading-snug text-zinc-500">
          Say or type a short line. Only <span className="text-zinc-400">text</span> is sent for parsing (no
          audio file). This sheet fills the form — use{" "}
          <span className="font-medium text-zinc-400">Save today</span> on the card to persist.
        </p>

        {error || parseDetail ? (
          <div className="mb-3 space-y-2">
            <p
              className={`rounded-lg border px-3 py-2 text-[11px] ${
                error === "voice_free_cap"
                  ? "border-violet-500/30 bg-violet-950/40 text-violet-100"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-200"
              }`}
            >
              {error ? errorCopy(error) : null}
              {parseDetail ? (
                <span
                  className={`mt-1 block whitespace-pre-wrap break-words font-mono text-[10px] ${
                    error === "voice_free_cap" ? "text-violet-200/90" : "text-rose-100/90"
                  }`}
                >
                  {parseDetail}
                </span>
              ) : null}
            </p>
            {error === "voice_free_cap" ? (
              <Link
                href="/account/billing"
                className="inline-flex text-[12px] font-semibold text-sky-300 hover:text-sky-200"
                onClick={() =>
                  track("upgrade_clicked", {
                    feature: "voice_daily_parse",
                    surface: "voice_daily_log_sheet",
                  })
                }
              >
                View Pro plans →
              </Link>
            ) : null}
          </div>
        ) : null}

        {lowConfidence ? (
          <p className="mb-3 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-100">
            Some of that was unclear — please fix the fields below before applying.
            {parsed?.unclearParts?.length ? (
              <span className="mt-1 block text-amber-200/90">
                Unmapped: {parsed.unclearParts.join("; ")}
              </span>
            ) : null}
          </p>
        ) : null}

        <div className="mb-2 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={listening}
            onClick={startListening}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/15 px-3 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Mic className="h-3.5 w-3.5" />
            {listening ? "Listening…" : "Speak"}
          </button>
          {listening ? (
            <button
              type="button"
              onClick={stopListening}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 bg-zinc-800 px-3 py-1.5 text-[11px] font-semibold text-zinc-200 hover:bg-zinc-700"
            >
              <MicOff className="h-3.5 w-3.5" />
              Stop
            </button>
          ) : null}
        </div>

        <label className="mb-0.5 block text-[10px] font-medium uppercase tracking-wide text-zinc-500">
          What you said
        </label>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          rows={2}
          className="mb-3 max-h-28 min-h-[2.75rem] w-full resize-y rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none ring-emerald-500/30 focus:ring-2"
          placeholder="e.g. Two bowls of grapes"
        />

        <button
          type="button"
          disabled={parsing || !transcript.trim()}
          onClick={() => void handleParse()}
          className="mb-4 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-violet-500/35 bg-violet-500/15 py-2 text-sm font-semibold text-violet-100 hover:bg-violet-500/25 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Sparkles className="h-4 w-4" />
          {parsing ? "Parsing…" : "Parse"}
        </button>

        {review ? (
          <div className="space-y-3 border-t border-zinc-800 pt-3">
            <div>
              <p className="text-xs font-semibold text-zinc-200">Review</p>
              <p className="mt-0.5 text-[10px] text-zinc-500">
                Edit if needed, then Apply. Fields you leave empty are left unchanged on the form.
              </p>
            </div>

            {mealLibraryEnabled && review.foodRows.length > 0 ? (
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-2 text-[11px] text-emerald-100/95">
                <input
                  type="checkbox"
                  checked={saveFoodToMealLog}
                  onChange={(e) => setSaveFoodToMealLog(e.target.checked)}
                  className="mt-0.5 rounded border-emerald-600/60"
                />
                <span>
                  <span className="font-medium text-emerald-50">Add checked foods to today&apos;s meal log</span>
                  <span className="mt-0.5 block text-[10px] font-normal text-emerald-200/80">
                    New library + log rows only — does not remove meals you logged earlier (e.g. lemon, then grapes
                    later).
                  </span>
                </span>
              </label>
            ) : null}

            {review.foodRows.length > 0 ? (
              <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-wide text-emerald-200/90">
                  {saveFoodToMealLog && mealLibraryEnabled
                    ? "Food & drink (meal log)"
                    : caloriesProteinReadOnly
                      ? "Food & drink"
                      : "Food & drink (adds to Today calories)"}
                </p>
                <ul className="space-y-2">
                  {review.foodRows.map((row, idx) => (
                    <li
                      key={`${row.description}-${idx}`}
                      className="flex flex-wrap items-start gap-2 rounded-md border border-zinc-800 bg-zinc-900/80 p-2"
                    >
                      <label className="flex shrink-0 items-center gap-1.5 text-[11px] text-zinc-300">
                        <input
                          type="checkbox"
                          checked={row.includeInDaily}
                          onChange={(e) => {
                            const v = e.target.checked;
                            setReview({
                              ...review,
                              foodRows: review.foodRows.map((r, i) =>
                                i === idx ? { ...r, includeInDaily: v } : r,
                              ),
                            });
                          }}
                          className="rounded border-zinc-600"
                        />
                        <span className="max-w-[10rem] truncate" title={row.description}>
                          {row.description}
                        </span>
                      </label>
                      <label className="text-[10px] text-zinc-500">
                        kcal
                        <input
                          className="ml-1 w-16 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-[11px] text-zinc-100"
                          value={row.estKcal}
                          onChange={(e) => {
                            const t = e.target.value;
                            setReview({
                              ...review,
                              foodRows: review.foodRows.map((r, i) =>
                                i === idx ? { ...r, estKcal: t } : r,
                              ),
                            });
                          }}
                          inputMode="numeric"
                        />
                      </label>
                      <label className="text-[10px] text-zinc-500">
                        protein g
                        <input
                          className="ml-1 w-14 rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-[11px] text-zinc-100"
                          value={row.estProteinG}
                          onChange={(e) => {
                            const t = e.target.value;
                            setReview({
                              ...review,
                              foodRows: review.foodRows.map((r, i) =>
                                i === idx ? { ...r, estProteinG: t } : r,
                              ),
                            });
                          }}
                          inputMode="numeric"
                        />
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[9px] text-zinc-500">
                  {saveFoodToMealLog && mealLibraryEnabled
                    ? "Uncheck a row to skip it. Meal log mode does not change the calorie fields — today’s total comes from all logged meals."
                    : caloriesProteinReadOnly
                      ? "Today’s kcal total comes from meals — turn on “meal log” above to append checked lines as new meals."
                      : "Checked rows add kcal / protein on top of the calories & protein fields in the section below."}
                </p>
              </div>
            ) : null}

            <details className="rounded-lg border border-zinc-800 bg-zinc-900/50">
              <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium text-zinc-400 hover:text-zinc-300">
                Weight, steps, sleep{!caloriesProteinReadOnly ? ", calories & protein" : ""}
              </summary>
              <div className="grid gap-2 border-t border-zinc-800 p-2 sm:grid-cols-2">
                <label className="block text-[10px] text-zinc-500">
                  Morning weight ({unit})
                  <input
                    className="mt-0.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={review.morning}
                    onChange={(e) => setReview({ ...review, morning: e.target.value })}
                    inputMode="decimal"
                  />
                </label>
                <label className="block text-[10px] text-zinc-500">
                  Night weight ({unit})
                  <input
                    className="mt-0.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={review.night}
                    onChange={(e) => setReview({ ...review, night: e.target.value })}
                    inputMode="decimal"
                  />
                </label>
                {!caloriesProteinReadOnly ? (
                  <>
                    <label className="block text-[10px] text-zinc-500">
                      Calories (kcal)
                      <input
                        className="mt-0.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                        value={review.calories}
                        onChange={(e) => setReview({ ...review, calories: e.target.value })}
                        inputMode="numeric"
                      />
                    </label>
                    <label className="block text-[10px] text-zinc-500">
                      Protein (g)
                      <input
                        className="mt-0.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                        value={review.protein}
                        onChange={(e) => setReview({ ...review, protein: e.target.value })}
                        inputMode="numeric"
                      />
                    </label>
                  </>
                ) : (
                  <p className="sm:col-span-2 text-[10px] text-zinc-500">
                    Calories and protein come from logged meals today — voice will not overwrite them here.
                  </p>
                )}
                <label className="block text-[10px] text-zinc-500">
                  Steps
                  <input
                    className="mt-0.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={review.steps}
                    onChange={(e) => setReview({ ...review, steps: e.target.value })}
                    inputMode="numeric"
                  />
                </label>
                <label className="block text-[10px] text-zinc-500">
                  Sleep (hours)
                  <input
                    className="mt-0.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    value={review.sleep}
                    onChange={(e) => setReview({ ...review, sleep: e.target.value })}
                    inputMode="decimal"
                  />
                </label>
              </div>
            </details>

            <details className="rounded-lg border border-violet-500/20 bg-violet-500/5">
              <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium text-violet-200/90 hover:text-violet-100">
                Activity → Energy card
              </summary>
              <div className="border-t border-violet-500/15 p-2">
                <input
                  className="mb-2 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-[11px] text-zinc-100"
                  value={review.activityBurnHint}
                  onChange={(e) => setReview({ ...review, activityBurnHint: e.target.value })}
                  placeholder='e.g. 25 min bike'
                />
                <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-300">
                  <input
                    type="checkbox"
                    checked={review.syncActivityToEnergy}
                    onChange={(e) =>
                      setReview({ ...review, syncActivityToEnergy: e.target.checked })
                    }
                    className="rounded border-zinc-600"
                  />
                  Prefill Energy card (run AI estimate there after Apply)
                </label>
              </div>
            </details>

            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["workout", "Workout", review.workout],
                  ["alcohol", "Alcohol", review.alcohol],
                  ["lateSnack", "Late snack", review.lateSnack],
                  ["highSodium", "High sodium", review.highSodium],
                ] as const
              ).map(([key, label, checked]) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-2 py-2 text-[11px] text-zinc-200"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setReview({ ...review, [key]: e.target.checked })}
                    className="rounded border-zinc-600"
                  />
                  {label}
                </label>
              ))}
            </div>
            <details className="rounded-lg border border-zinc-800 bg-zinc-900/50">
              <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium text-zinc-400 hover:text-zinc-300">
                Optional: meal text & notes
              </summary>
              <div className="space-y-2 border-t border-zinc-800 p-2">
                <label className="block text-[10px] text-zinc-500">
                  Meal summary (optional)
                  <textarea
                    className="mt-0.5 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
                    rows={2}
                    value={review.mealsSummary}
                    onChange={(e) => setReview({ ...review, mealsSummary: e.target.value })}
                  />
                </label>
                <p className="text-[10px] font-medium text-zinc-400">Append to day notes (optional)</p>
                <label className="flex cursor-pointer items-start gap-2 text-[11px] text-zinc-300">
                  <input
                    type="checkbox"
                    checked={appendMeals}
                    onChange={(e) => setAppendMeals(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-600"
                  />
                  Meal summary
                </label>
                <label className="flex cursor-pointer items-start gap-2 text-[11px] text-zinc-300">
                  <input
                    type="checkbox"
                    checked={appendTranscript}
                    onChange={(e) => setAppendTranscript(e.target.checked)}
                    className="mt-0.5 rounded border-zinc-600"
                  />
                  Full transcript
                </label>
              </div>
            </details>

            <button
              type="button"
              onClick={handleApply}
              className="w-full rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
            >
              Apply to today&apos;s form
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
