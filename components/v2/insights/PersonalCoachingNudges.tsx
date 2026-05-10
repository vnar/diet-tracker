"use client";

import { useEffect, useId, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronUp, Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { track } from "@/lib/analytics";
import type { AiNudge, PersonalizedCoachingApiPayload } from "@/lib/aiNudges/types";
import { submitInsightFeedback } from "@/lib/frontend-api-client";

function categoryLabel(c: AiNudge["category"]): string {
  switch (c) {
    case "weight_trend":
      return "Weight trend";
    case "habit_pattern":
      return "Habits";
    case "nutrition_pattern":
      return "Nutrition";
    case "sleep_recovery":
      return "Sleep";
    case "plateau":
      return "Plateau";
    case "goal_progress":
      return "Goal";
    default:
      return "Insight";
  }
}

export function PersonalCoachingNudges(props: {
  accessToken: string;
  coaching: PersonalizedCoachingApiPayload;
}) {
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({});
  const [rated, setRated] = useState<Record<string, "helpful" | "not_helpful">>({});
  const [nudgesSectionOpen, setNudgesSectionOpen] = useState(true);

  useEffect(() => {
    if (props.coaching.gated) {
      track("ai_nudge_generated", { count: 0, gated: true });
      return;
    }
    track("ai_nudge_generated", { count: props.coaching.nudges.length, gated: false });
  }, [props.coaching.gated, props.coaching.nudges.length]);

  if (props.coaching.gated) {
    return (
      <div
        className="mt-4 rounded-xl border border-amber-500/20 bg-gradient-to-b from-amber-950/35 to-slate-950/40 p-4 shadow-sm shadow-black/20 ring-1 ring-amber-500/10"
        role="region"
        aria-label="Pro coaching"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 ring-1 ring-amber-400/20">
            <Sparkles className="h-4 w-4 text-amber-200" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[13px] font-semibold tracking-tight text-amber-50">
              Personalized coaching (Pro)
            </p>
            <p className="text-[12px] leading-relaxed text-amber-100/85">
              Deeper nudges from your own logs are included with an active Pro plan. This is wellness
              guidance, not medical advice.
            </p>
            <Link
              href="/account/billing"
              className="inline-flex items-center gap-1 rounded-md text-[12px] font-semibold text-sky-300 transition hover:text-sky-200"
              onClick={() => track("ai_nudge_upgrade_clicked", { from: "insights_coaching" })}
            >
              View plans
              <span aria-hidden className="text-sky-400/80">
                →
              </span>
            </Link>
          </div>
        </div>
        <details className="group mt-3 border-t border-amber-500/15 pt-3">
          <summary className="cursor-pointer list-none text-[10px] font-medium text-slate-500 transition hover:text-slate-400 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1">
              Medical disclaimer
              <ChevronDown className="h-3 w-3 shrink-0 transition group-open:rotate-180" aria-hidden />
            </span>
          </summary>
          <p className="mt-2 text-[10px] leading-relaxed text-slate-500">{props.coaching.globalSafetyNotice}</p>
        </details>
      </div>
    );
  }

  if (props.coaching.nudges.length === 0) return null;

  const visibleCount = props.coaching.nudges.filter((n) => !dismissed[n.id]).length;

  return (
    <div className="mt-4" role="region" aria-label="Personalized nudges from your logs">
      <button
        type="button"
        onClick={() => setNudgesSectionOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg px-0.5 py-1.5 text-left transition hover:bg-slate-800/40"
        aria-expanded={nudgesSectionOpen}
      >
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Personalized nudges
          </span>
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-violet-200/90 ring-1 ring-violet-400/20">
            {visibleCount}
          </span>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-[10px] font-medium text-slate-500">
          {nudgesSectionOpen ? "Hide" : "Show"}
          {nudgesSectionOpen ? (
            <ChevronUp className="h-4 w-4 text-slate-400" aria-hidden />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" aria-hidden />
          )}
        </span>
      </button>

      {nudgesSectionOpen ? (
        <div className="mt-2 flex flex-col gap-3">
          {props.coaching.nudges.map((nudge) =>
            dismissed[nudge.id] ? null : (
              <NudgeRow
                key={nudge.id}
                nudge={nudge}
                accessToken={props.accessToken}
                globalNotice={props.coaching.globalSafetyNotice}
                rated={rated[nudge.id]}
                onRate={(r) => setRated((prev) => ({ ...prev, [nudge.id]: r }))}
                onDismiss={() => {
                  setDismissed((d) => ({ ...d, [nudge.id]: true }));
                  track("ai_nudge_dismissed", { nudge_id: nudge.id, category: nudge.category });
                  void submitInsightFeedback(
                    { insightId: nudge.id, vote: "dismiss" },
                    props.accessToken,
                  );
                }}
              />
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function NudgeRow(props: {
  nudge: AiNudge;
  accessToken: string;
  globalNotice: string;
  rated?: "helpful" | "not_helpful";
  onRate: (r: "helpful" | "not_helpful") => void;
  onDismiss: () => void;
}) {
  const { nudge } = props;
  const [whyOpen, setWhyOpen] = useState(false);
  const disclaimerId = useId();

  useEffect(() => {
    track("ai_nudge_viewed", { nudge_id: nudge.id, category: nudge.category });
  }, [nudge.id, nudge.category]);

  async function rate(r: "helpful" | "not_helpful") {
    props.onRate(r);
    track("ai_nudge_helpful", { nudge_id: nudge.id, helpful: r === "helpful" });
    await submitInsightFeedback({ insightId: nudge.id, vote: r }, props.accessToken);
  }

  const confPct = Math.round(nudge.confidence * 100);

  return (
    <article className="overflow-hidden rounded-xl border border-slate-600/60 border-l-[3px] border-l-violet-500 bg-slate-900/55 shadow-sm shadow-black/25 ring-1 ring-white/[0.04]">
      <div className="flex items-start justify-between gap-3 p-4 pb-0">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-violet-200/95">
            {categoryLabel(nudge.category)}
          </span>
          <span
            className="rounded-full bg-slate-800/90 px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-300 ring-1 ring-slate-600/60"
            title="Heuristic confidence from how much you logged"
          >
            {confPct}% confidence
          </span>
        </div>
        <button
          type="button"
          aria-label="Dismiss this nudge"
          title="Dismiss"
          className="-m-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-800 hover:text-slate-200"
          onClick={props.onDismiss}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-2 px-4 pb-4 pt-2">
        <h3 className="text-[15px] font-semibold leading-snug tracking-tight text-slate-50">{nudge.title}</h3>
        <p className="text-[13px] leading-relaxed text-slate-400">{nudge.message}</p>

        {nudge.supportingEvidence.length > 0 ? (
          <div className="border-t border-slate-700/50 pt-3">
            <button
              type="button"
              id={`${disclaimerId}-why-trigger`}
              onClick={() => setWhyOpen((v) => !v)}
              className="flex w-full items-center justify-between gap-2 rounded-md py-1 text-left text-[11px] font-semibold text-sky-300/95 transition hover:text-sky-200"
              aria-expanded={whyOpen}
              aria-controls={`${disclaimerId}-why-panel`}
            >
              <span>Why you&apos;re seeing this</span>
              {whyOpen ? (
                <ChevronUp className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
              ) : (
                <ChevronDown className="h-4 w-4 shrink-0 opacity-80" aria-hidden />
              )}
            </button>
            {whyOpen ? (
              <ul
                id={`${disclaimerId}-why-panel`}
                className="mt-2 space-y-2.5 border-l-2 border-sky-500/25 pl-3 text-[12px] leading-relaxed text-slate-400"
              >
                {nudge.supportingEvidence.map((line, i) => (
                  <li key={`${nudge.id}-ev-${i}`} className="flex gap-2.5">
                    <span
                      className="mt-2 h-1 w-1 shrink-0 rounded-full bg-sky-400/60"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">{line}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <details className="group rounded-lg bg-slate-950/40 ring-1 ring-slate-700/40">
          <summary className="cursor-pointer list-none px-3 py-2 text-[10px] font-medium text-slate-500 transition hover:text-slate-400 [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1.5">
              Not medical advice
              <ChevronDown className="h-3 w-3 shrink-0 opacity-70 transition group-open:rotate-180" aria-hidden />
            </span>
          </summary>
          <p className="border-t border-slate-800/80 px-3 pb-2.5 pt-2 text-[10px] leading-relaxed text-slate-500">
            {nudge.safetyNotice ?? props.globalNotice}
          </p>
        </details>

        <div className="flex flex-col gap-2 border-t border-slate-700/50 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[10px] text-slate-600">Was this useful?</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={props.rated !== undefined}
              className={`inline-flex min-h-9 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                props.rated === "helpful"
                  ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-200"
                  : "border-slate-600/70 bg-slate-800/50 text-slate-300 hover:border-emerald-500/30 hover:bg-slate-800"
              }`}
              onClick={() => void rate("helpful")}
            >
              <ThumbsUp className="h-3.5 w-3.5" aria-hidden />
              Helpful
            </button>
            <button
              type="button"
              disabled={props.rated !== undefined}
              className={`inline-flex min-h-9 min-w-[5.5rem] items-center justify-center gap-1.5 rounded-full border px-3 text-[12px] font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                props.rated === "not_helpful"
                  ? "border-rose-500/40 bg-rose-950/35 text-rose-200"
                  : "border-slate-600/70 bg-slate-800/50 text-slate-300 hover:border-rose-500/30 hover:bg-slate-800"
              }`}
              onClick={() => void rate("not_helpful")}
            >
              <ThumbsDown className="h-3.5 w-3.5" aria-hidden />
              Not helpful
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}
