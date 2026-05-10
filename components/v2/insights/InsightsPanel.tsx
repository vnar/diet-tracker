"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ThumbsDown, ThumbsUp } from "lucide-react";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { PersonalCoachingNudges } from "@/components/v2/insights/PersonalCoachingNudges";
import { track } from "@/lib/analytics";
import type { PersonalizedCoachingApiPayload } from "@/lib/aiNudges/types";
import {
  getInsightsV2,
  submitInsightFeedback,
} from "@/lib/frontend-api-client";
import { isInsightsSourceLabelEnabled } from "@/lib/featureFlags";
import { renderInsightEmphasis } from "@/lib/insights/renderRichPhrases";
import type { Insight, InsightVote } from "@/lib/insights/types";
import { AiInsightCardV2 } from "@/components/v2/insights/AiInsightCardV2";

function formatUpdatedAgo(iso: string | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const mins = Math.floor((Date.now() - t) / 60000);
  if (mins < 1) return "Updated just now";
  if (mins < 60) return `Updated ${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `Updated ${hrs} hr${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  return `Updated ${days} day${days === 1 ? "" : "s"} ago`;
}

export function InsightsPanel({ accessToken }: { accessToken: string }) {
  const { user } = useCognitoAuth();
  const showSourceLabel = useMemo(
    () => isInsightsSourceLabelEnabled(user?.id),
    [user?.id],
  );
  const [insights, setInsights] = useState<Insight[]>([]);
  const [personalizedCoaching, setPersonalizedCoaching] = useState<
    PersonalizedCoachingApiPayload | undefined
  >();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [voted, setVoted] = useState<Record<string, InsightVote>>({});
  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      const result = await getInsightsV2(accessToken);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
      } else {
        setError(null);
      }
      const next = result.ok ? result.data.insights : [];
      setPersonalizedCoaching(result.ok ? result.data.personalizedCoaching : undefined);
      setInsights(next);
      setLoading(false);
      next.forEach((insight) => {
        track("insight_shown", {
          insight_id: insight.id,
          category: insight.category,
          generation_source: insight.generationSource ?? "rules",
        });
        if (insight.category === "plateau") {
          track("plateau_alert_viewed", {
            insight_id: insight.id,
            generation_source: insight.generationSource ?? "rules",
          });
        }
      });
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  async function handleVote(insightId: string, vote: InsightVote) {
    setVoted((prev) => ({ ...prev, [insightId]: vote }));
    track("insight_voted", { insight_id: insightId, vote });
    if (vote === "helpful" || vote === "not_helpful") {
      track("ai_nudge_helpful", { insight_id: insightId, helpful: vote === "helpful" });
    }
    await submitInsightFeedback({ insightId, vote }, accessToken);
  }

  if (loading) {
    return <p className="text-[15px] font-medium text-slate-400">Loading…</p>;
  }

  if (insights.length === 0 && !personalizedCoaching) {
    return (
      <div className="space-y-2">
        <p className="text-[15px] font-medium leading-relaxed text-slate-400">
          No insight available right now.
        </p>
        {error ? (
          <p className="text-xs text-rose-300">
            Insights unavailable: {error}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5">
    <ul className="flex flex-col gap-2.5">
      {insights.map((ins) => {
        const generationSource = ins.generationSource ?? "rules";
        const updatedLabel = formatUpdatedAgo(ins.generatedAt);

        if (ins.structured) {
          return (
            <li key={ins.id} className="list-none">
              <AiInsightCardV2
                insight={ins}
                accessToken={accessToken}
                showSourceLabel={showSourceLabel}
              />
            </li>
          );
        }

        return (
        <li
          key={ins.id}
          className="rounded-xl border border-slate-600/80 border-l-4 border-l-sky-500 bg-slate-900/60 p-4 shadow-sm shadow-black/20"
        >
          <p className="text-[15px] font-normal leading-[1.55] tracking-wide text-slate-200 antialiased">
            {renderInsightEmphasis(ins.headline)}
          </p>
          {updatedLabel ? (
            <p className="mt-1 text-[9px] text-slate-500">{updatedLabel}</p>
          ) : null}
          {showSourceLabel ? (
            <p
              className="mt-1 max-w-prose text-[11px] font-medium leading-snug text-slate-500"
              title={
                generationSource === "llm"
                  ? "Headline and detail were rewritten by a language model; supporting facts still come from your logs and rules."
                  : ins.generationSource === undefined
                    ? "Older API responses may omit the source field. Redeploy the latest Lambda so this label reflects AI vs rules accurately."
                    : "Headline and detail come directly from deterministic rules applied to your entries (no generative rewrite)."
              }
            >
              {generationSource === "llm"
                ? "AI-generated copy"
                : "Rule-based (deterministic)"}
            </p>
          ) : null}
          {ins.detail ? (
            <p className="mt-2 text-[13px] leading-relaxed text-slate-400">
              {renderInsightEmphasis(ins.detail, {
                strongClassName: "font-semibold text-slate-300",
              })}
            </p>
          ) : null}
          {ins.action ? (
            <p className="mt-2 text-[13px] font-medium leading-relaxed text-emerald-300/95">
              {renderInsightEmphasis(ins.action, {
                strongClassName: "font-semibold text-emerald-200",
              })}
            </p>
          ) : null}
          <div className="mt-3 flex min-h-10 flex-wrap items-center gap-x-4 gap-y-2 text-xs">
            {ins.why.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                const nextExpanded = !expanded[ins.id];
                setExpanded((prev) => ({ ...prev, [ins.id]: nextExpanded }));
                if (nextExpanded) {
                  track("insight_why_expanded", { insight_id: ins.id });
                }
              }}
              className="inline-flex items-center gap-1 text-sky-300 hover:text-sky-200"
            >
              Why?
              {expanded[ins.id] ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            ) : null}
            <button
              type="button"
              onClick={() => void handleVote(ins.id, "helpful")}
              className={`inline-flex items-center gap-1 ${
                voted[ins.id] === "helpful" || voted[ins.id] === "up"
                  ? "text-emerald-300"
                  : "text-slate-400 hover:text-slate-300"
              }`}
              aria-label="Helpful insight"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void handleVote(ins.id, "not_helpful")}
              className={`inline-flex items-center gap-1 ${
                voted[ins.id] === "not_helpful" || voted[ins.id] === "down"
                  ? "text-rose-300"
                  : "text-slate-400 hover:text-slate-300"
              }`}
              aria-label="Not helpful insight"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </div>
          {expanded[ins.id] && ins.why.length > 0 ? (
            <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[12px] leading-relaxed text-slate-400">
              {ins.why.map((point) => (
                <li key={point}>{renderInsightEmphasis(point)}</li>
              ))}
            </ul>
          ) : null}
        </li>
        );
      })}
    </ul>
    {insights.length > 0 && personalizedCoaching ? (
      <div
        className="my-1 h-px w-full bg-gradient-to-r from-transparent via-slate-600/50 to-transparent"
        aria-hidden
      />
    ) : null}
    {personalizedCoaching ? (
      <PersonalCoachingNudges accessToken={accessToken} coaching={personalizedCoaching} />
    ) : null}
    </div>
  );
}
