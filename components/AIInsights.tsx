"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, ThumbsDown, ThumbsUp } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { useCognitoAuth } from "@/components/CognitoAuthProvider";
import { isInsightsV2Enabled } from "@/lib/featureFlags";
import {
  getInsightsV2,
  isAwsBackendEnabled,
  submitInsightFeedback,
} from "@/lib/frontend-api-client";
import type { InsightCard, InsightVote } from "@/lib/insights/types";

export function AIInsights() {
  const [insights, setInsights] = useState<InsightCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [voted, setVoted] = useState<Record<string, InsightVote>>({});
  const { status, getAccessToken, user } = useCognitoAuth();
  const v2Enabled = useMemo(() => isInsightsV2Enabled(user?.id), [user?.id]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!v2Enabled || !isAwsBackendEnabled() || status !== "authenticated") {
        if (!cancelled) {
          setInsights([]);
          setLoading(false);
        }
        return;
      }
      const token = getAccessToken();
      if (!token) {
        if (!cancelled) {
          setInsights([]);
          setLoading(false);
        }
        return;
      }
      const result = await getInsightsV2(token);
      if (cancelled) return;
      setInsights(result.ok ? result.data.insights : []);
      setLoading(false);
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [getAccessToken, status, v2Enabled]);

  async function handleVote(insightId: string, vote: InsightVote) {
    setVoted((prev) => ({ ...prev, [insightId]: vote }));
    const token = getAccessToken();
    if (!token) return;
    await submitInsightFeedback({ insightId, vote }, token);
  }

  return (
    <Card title="Insights" variant="surface">
      {loading ? (
        <p className="text-[15px] font-medium text-slate-400">Loading…</p>
      ) : insights.length === 0 ? (
        <p className="text-[15px] font-medium leading-relaxed text-slate-400">
          No nudges right now — keep logging.
        </p>
      ) : (
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
              <div className="mt-2 flex items-center gap-4 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    setExpanded((prev) => ({ ...prev, [ins.id]: !prev[ins.id] }))
                  }
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
      )}
    </Card>
  );
}
