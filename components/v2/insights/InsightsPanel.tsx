"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, ThumbsDown, ThumbsUp } from "lucide-react";
import { track } from "@/lib/analytics";
import {
  getInsightsV2,
  submitInsightFeedback,
} from "@/lib/frontend-api-client";
import type { Insight, InsightVote } from "@/lib/insights/types";

export function InsightsPanel({ accessToken }: { accessToken: string }) {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [voted, setVoted] = useState<Record<string, InsightVote>>({});

  useEffect(() => {
    let cancelled = false;
    async function run() {
      const result = await getInsightsV2(accessToken);
      if (cancelled) return;
      const next = result.ok ? result.data.insights : [];
      setInsights(next);
      setLoading(false);
      next.forEach((insight) => {
        track("insight_shown", { insight_id: insight.id, category: insight.category });
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
      <p className="text-[15px] font-medium leading-relaxed text-slate-400">
        No nudges right now — keep logging.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {insights.map((ins) => (
        <li
          key={ins.id}
          className="rounded-xl border border-slate-600/80 border-l-4 border-l-sky-500 bg-slate-900/60 p-3.5"
        >
          <p className="text-[15px] font-medium leading-relaxed tracking-wide text-slate-200">
            {ins.headline}
          </p>
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
      ))}
    </ul>
  );
}
