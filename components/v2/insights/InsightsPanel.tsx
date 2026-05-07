"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ThumbsDown, ThumbsUp } from "lucide-react";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { track } from "@/lib/analytics";
import {
  getInsightsV2,
  submitInsightFeedback,
} from "@/lib/frontend-api-client";
import { isInsightsSourceLabelEnabled } from "@/lib/featureFlags";
import type { Insight, InsightVote } from "@/lib/insights/types";

export function InsightsPanel({ accessToken }: { accessToken: string }) {
  const { user } = useCognitoAuth();
  const showSourceLabel = useMemo(
    () => isInsightsSourceLabelEnabled(user?.id),
    [user?.id],
  );
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [voted, setVoted] = useState<Record<string, InsightVote>>({});

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const result = await getInsightsV2(accessToken);
      if (cancelled) return;
      if (!result.ok) {
        setError(result.error);
      } else {
        setError(null);
      }
      const next = result.ok ? result.data.insights : [];
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
    await submitInsightFeedback({ insightId, vote }, accessToken);
  }

  if (loading) {
    return <p className="text-[15px] font-medium text-slate-400">Loading…</p>;
  }

  if (insights.length === 0) {
    return (
      <div className="space-y-2">
        <p className="text-[15px] font-medium leading-relaxed text-slate-400">
          No nudges right now — keep logging.
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
    <ul className="flex flex-col gap-2.5">
      {insights.map((ins) => {
        const generationSource = ins.generationSource ?? "rules";
        return (
        <li
          key={ins.id}
          className="rounded-xl border border-slate-600/80 border-l-4 border-l-sky-500 bg-slate-900/60 p-3.5"
        >
          <p className="text-[15px] font-medium leading-relaxed tracking-wide text-slate-200">
            {ins.headline}
          </p>
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
            <p className="mt-1 text-xs leading-relaxed text-slate-400">{ins.detail}</p>
          ) : null}
          <p className="mt-1 text-xs text-emerald-300">{ins.action}</p>
          <div className="mt-2 flex items-center gap-4 text-xs">
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
            <button
              type="button"
              onClick={() => void handleVote(ins.id, "up")}
              className={`inline-flex items-center gap-1 ${
                voted[ins.id] === "up"
                  ? "text-emerald-300"
                  : "text-slate-400 hover:text-slate-300"
              }`}
              aria-label="Helpful insight"
            >
              <ThumbsUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => void handleVote(ins.id, "down")}
              className={`inline-flex items-center gap-1 ${
                voted[ins.id] === "down"
                  ? "text-rose-300"
                  : "text-slate-400 hover:text-slate-300"
              }`}
              aria-label="Not helpful insight"
            >
              <ThumbsDown className="h-3.5 w-3.5" />
            </button>
          </div>
          {expanded[ins.id] ? (
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-400">
              {ins.why.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>
          ) : null}
        </li>
        );
      })}
    </ul>
  );
}
