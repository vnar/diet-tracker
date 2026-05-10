"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, ThumbsDown, ThumbsUp, X } from "lucide-react";
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

  useEffect(() => {
    if (props.coaching.gated) {
      track("ai_nudge_generated", { count: 0, gated: true });
      return;
    }
    track("ai_nudge_generated", { count: props.coaching.nudges.length, gated: false });
  }, [props.coaching.gated, props.coaching.nudges.length]);

  if (props.coaching.gated) {
    return (
      <div className="mt-3 rounded-xl border border-amber-500/25 bg-amber-950/25 p-4">
        <div className="flex items-start gap-2">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1 space-y-2">
            <p className="text-[13px] font-semibold text-amber-100">Personalized coaching (Pro)</p>
            <p className="text-[12px] leading-relaxed text-amber-100/80">
              Deeper nudges from your own logs are included with an active Pro plan. This is wellness
              guidance, not medical advice.
            </p>
            <Link
              href="/account/billing"
              className="inline-flex text-[12px] font-semibold text-sky-300 hover:text-sky-200"
              onClick={() => track("ai_nudge_upgrade_clicked", { from: "insights_coaching" })}
            >
              View plans →
            </Link>
          </div>
        </div>
        <p className="mt-3 text-[10px] leading-snug text-slate-500">{props.coaching.globalSafetyNotice}</p>
      </div>
    );
  }

  if (props.coaching.nudges.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Personalized nudges</p>
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
  useEffect(() => {
    track("ai_nudge_viewed", { nudge_id: nudge.id, category: nudge.category });
  }, [nudge.id, nudge.category]);

  async function rate(r: "helpful" | "not_helpful") {
    props.onRate(r);
    track("ai_nudge_helpful", { nudge_id: nudge.id, helpful: r === "helpful" });
    await submitInsightFeedback({ insightId: nudge.id, vote: r }, props.accessToken);
  }

  return (
    <div className="rounded-xl border border-slate-600/70 border-l-4 border-l-violet-500 bg-slate-900/50 p-3.5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-300/90">
          {categoryLabel(nudge.category)} · {Math.round(nudge.confidence * 100)}% confidence
        </p>
        <button
          type="button"
          aria-label="Dismiss nudge"
          className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
          onClick={props.onDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="mt-1.5 text-[14px] font-medium leading-snug text-slate-100">{nudge.title}</p>
      <p className="mt-1.5 text-[12px] leading-relaxed text-slate-400">{nudge.message}</p>
      {nudge.supportingEvidence.length > 0 ? (
        <div className="mt-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Why you&apos;re seeing this</p>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-[11px] leading-relaxed text-slate-400">
            {nudge.supportingEvidence.map((line, i) => (
              <li key={`${nudge.id}-ev-${i}`}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="mt-2 text-[10px] leading-snug text-slate-500">{nudge.safetyNotice ?? props.globalNotice}</p>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-[11px]">
        <button
          type="button"
          disabled={props.rated !== undefined}
          className={`inline-flex items-center gap-1 ${
            props.rated === "helpful" ? "text-emerald-300" : "text-slate-400 hover:text-slate-200"
          } disabled:opacity-60`}
          onClick={() => void rate("helpful")}
        >
          <ThumbsUp className="h-3.5 w-3.5" />
          Helpful
        </button>
        <button
          type="button"
          disabled={props.rated !== undefined}
          className={`inline-flex items-center gap-1 ${
            props.rated === "not_helpful" ? "text-rose-300" : "text-slate-400 hover:text-slate-200"
          } disabled:opacity-60`}
          onClick={() => void rate("not_helpful")}
        >
          <ThumbsDown className="h-3.5 w-3.5" />
          Not helpful
        </button>
      </div>
    </div>
  );
}
