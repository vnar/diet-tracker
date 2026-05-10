"use client";

import { useCallback, useState } from "react";
import {
  Activity,
  ChartLine,
  Check,
  Footprints,
  HeartPulse,
  Moon,
  Target,
  ThumbsDown,
  ThumbsUp,
  TriangleAlert,
  Utensils,
} from "lucide-react";
import { track } from "@/lib/analytics";
import { submitInsightFeedback } from "@/lib/frontend-api-client";
import type { AiInsightActionIcon, AiInsightStructured } from "@/lib/insights/aiInsightStructured";
import type { Insight, InsightVote } from "@/lib/insights/types";

const G = "#3DDB7A";
const WARN = "#F97316";
const RED = "#F43F5E";
const BLUE = "#60A5FA";
const TXT = "#fafafa";
const MU = "#a1a1aa";
const MU2 = "#d4d4d8";
const BORDER = "rgba(255,255,255,0.08)";

function verdictAccent(status: AiInsightStructured["verdict"]["status"]): {
  line: string;
  bg: string;
  label: string;
  labelText: string;
} {
  if (status === "on_track") {
    return {
      line: G,
      bg: "rgba(61,219,122,0.07)",
      label: G,
      labelText: "On track",
    };
  }
  if (status === "off_track") {
    return {
      line: RED,
      bg: "rgba(244,63,94,0.07)",
      label: RED,
      labelText: "Off track",
    };
  }
  return {
    line: WARN,
    bg: "rgba(249,115,22,0.07)",
    label: WARN,
    labelText: "Rate at risk",
  };
}

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

function HighlightNums({
  text,
  numberClassName,
}: {
  text: string;
  numberClassName: string;
}) {
  if (!text) return null;
  const parts = text.split(
    /(\d+(?:[.,]\d+)?(?:\/\d+)?(?:\s*(?:kg|kcal|g|h|min|days?|weeks?|wk))?)/gi,
  );
  return (
    <>
      {parts.map((p, i) =>
        /^\d/.test(p) ? (
          <span key={`${i}-${p.slice(0, 8)}`} className={numberClassName}>
            {p}
          </span>
        ) : (
          <span key={`${i}-t`}>{p}</span>
        ),
      )}
    </>
  );
}

function ActionIcon({ icon }: { icon: AiInsightActionIcon }) {
  const cls = "mt-px h-3.5 w-3.5 shrink-0";
  const style = { color: BLUE };
  switch (icon) {
    case "walk":
      return <Footprints className={cls} style={style} strokeWidth={2} />;
    case "food":
      return <Utensils className={cls} style={style} strokeWidth={2} />;
    case "moon":
      return <Moon className={cls} style={style} strokeWidth={2} />;
    case "heart":
      return <HeartPulse className={cls} style={style} strokeWidth={2} />;
    case "run":
      return <Activity className={cls} style={style} strokeWidth={2} />;
    default:
      return <Footprints className={cls} style={style} strokeWidth={2} />;
  }
}

export function AiInsightCardV2({
  insight,
  accessToken,
  showSourceLabel,
}: {
  insight: Insight;
  accessToken: string;
  showSourceLabel: boolean;
}) {
  const s = insight.structured;
  if (!s) return null;

  const [vote, setVote] = useState<InsightVote | undefined>();
  const [negOpen, setNegOpen] = useState(false);
  const [negText, setNegText] = useState("");

  const accent = verdictAccent(s.verdict.status);
  const tilesGreen = s.verdict.status === "on_track";
  const updated = formatUpdatedAgo(insight.generatedAt);

  const submitFeedback = useCallback(
    async (v: InsightVote, comment?: string) => {
      const apiVote: InsightVote =
        v === "up" ? "helpful" : v === "down" ? "not_helpful" : v;
      track("insight_voted", { insight_id: insight.id, vote: apiVote });
      if (apiVote === "helpful" || apiVote === "not_helpful") {
        track("ai_nudge_helpful", { insight_id: insight.id, helpful: apiVote === "helpful" });
      }
      await submitInsightFeedback(
        {
          insightId: insight.id,
          vote: apiVote,
          ...(apiVote === "not_helpful" && comment?.trim()
            ? { comment: comment.trim(), feedbackType: "negative" as const }
            : {}),
        },
        accessToken,
      );
      setVote(apiVote);
      if (apiVote === "helpful") setNegOpen(false);
    },
    [accessToken, insight.id],
  );

  const generationSource = insight.generationSource ?? "rules";
  const hasWorking = s.working.body.trim().length > 0;
  const hasStalling =
    s.stalling.body.trim().length > 0 ||
    s.stalling.metrics.some((m) => m.value !== "—" || m.label !== "—");
  const hasActions = s.actions.some((a) => a.action !== "—");
  const hasPrediction = s.prediction.headline.trim().length > 0;
  const hideEmptySecondary =
    !hasWorking && !hasStalling && !hasActions && !hasPrediction;

  return (
    <div
      className="overflow-hidden rounded-xl border bg-zinc-950/80"
      style={{ borderColor: BORDER, color: TXT }}
    >
      {/* Zone 1 header */}
      <div
        className="flex items-center justify-between px-3.5 pb-2.5 pt-[13px]"
        style={{ borderBottom: `1px solid ${BORDER}` }}
      >
        <div className="flex items-center gap-2">
          <span
            className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full"
            style={{ backgroundColor: G, boxShadow: `0 0 8px ${G}` }}
          />
          <span
            className="text-[9px] font-bold uppercase tracking-[1.4px]"
            style={{ color: G }}
          >
            AI analysis
          </span>
        </div>
        {updated ? (
          <span className="text-[9px]" style={{ color: MU }}>
            {updated}
          </span>
        ) : null}
      </div>

      {/* Zone 2 verdict */}
      <div
        className="px-3.5 py-3"
        style={{
          borderBottom: `1px solid ${BORDER}`,
          borderLeft: `3px solid ${accent.line}`,
          backgroundColor: accent.bg,
        }}
      >
        <p
          className="text-[10px] font-bold uppercase tracking-wide"
          style={{ color: accent.label }}
        >
          {accent.labelText}
        </p>
        <p className="mt-1 text-[13px] font-semibold leading-[1.45]" style={{ color: TXT }}>
          <HighlightNums text={s.verdict.headline} numberClassName="font-semibold" />
        </p>
        {s.verdict.detail.trim() ? (
          <p className="mt-1 text-[11px] leading-snug" style={{ color: MU2 }}>
            {s.verdict.detail}
          </p>
        ) : null}
      </div>

      {!hideEmptySecondary ? (
        <>
          {s.working.body.trim() ? (
            <div className="border-b border-white/[0.05] px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <Check className="h-[13px] w-[13px] shrink-0" style={{ color: G }} strokeWidth={2.5} />
                <span
                  className="text-[9px] font-bold uppercase tracking-wide"
                  style={{ color: G }}
                >
                  What&apos;s working
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed" style={{ color: MU2 }}>
                <HighlightNums
                  text={s.working.body}
                  numberClassName="font-semibold text-[#3DDB7A]"
                />
              </p>
            </div>
          ) : null}

          {hasStalling ? (
            <div className="border-b border-white/[0.05] px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <TriangleAlert
                  className="h-[13px] w-[13px] shrink-0"
                  style={{ color: WARN }}
                  strokeWidth={2.25}
                />
                <span
                  className="text-[9px] font-bold uppercase tracking-wide"
                  style={{ color: WARN }}
                >
                  What&apos;s stalling you
                </span>
              </div>
              {s.stalling.body.trim() ? (
                <p className="mt-1.5 text-xs leading-relaxed" style={{ color: MU2 }}>
                  <HighlightNums
                    text={s.stalling.body}
                    numberClassName="font-semibold text-zinc-100"
                  />
                </p>
              ) : null}
              <div className="mt-2 flex gap-2">
                {s.stalling.metrics.map((m, i) => (
                  <div
                    key={`${m.label}-${i}`}
                    className="flex-1 rounded-lg px-2 py-1.5 text-center"
                    style={{
                      backgroundColor: tilesGreen
                        ? "rgba(61,219,122,0.08)"
                        : "rgba(249,115,22,0.08)",
                      border: tilesGreen
                        ? "1px solid rgba(61,219,122,0.18)"
                        : "1px solid rgba(249,115,22,0.18)",
                    }}
                  >
                    <p
                      className="text-lg font-bold leading-tight"
                      style={{
                        color: tilesGreen ? G : WARN,
                        fontFamily: "var(--font-insight-display), ui-serif, serif",
                      }}
                    >
                      {m.value}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-tight" style={{ color: MU }}>
                      {m.label}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {s.actions.some((a) => a.action !== "—") ? (
            <div className="px-3.5 py-2.5">
              <div className="flex items-center gap-1.5">
                <Target className="h-[13px] w-[13px] shrink-0" style={{ color: BLUE }} strokeWidth={2.25} />
                <span
                  className="text-[9px] font-bold uppercase tracking-wide"
                  style={{ color: BLUE }}
                >
                  Do this today
                </span>
              </div>
              <div className="mt-2 flex flex-col gap-1.5">
                {s.actions.map((a, i) => (
                  <div
                    key={`${a.action}-${i}`}
                    className="flex items-start gap-2 rounded-lg px-2.5 py-2"
                    style={{
                      backgroundColor: "rgba(96,165,250,0.07)",
                      border: "1px solid rgba(96,165,250,0.15)",
                    }}
                  >
                    <ActionIcon icon={a.icon} />
                    <p className="text-xs leading-relaxed" style={{ color: MU2 }}>
                      <span className="font-semibold" style={{ color: TXT }}>
                        {a.action}
                      </span>
                      {a.reason && a.reason !== "—" ? (
                        <>
                          {" "}
                          <span style={{ color: MU2 }}>— {a.reason}</span>
                        </>
                      ) : null}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {s.prediction.headline.trim() ? (
            <div
              className="mx-3.5 mb-3 flex items-center gap-2.5 rounded-lg px-2.5 py-2.5"
              style={{
                backgroundColor: "rgba(61,219,122,0.07)",
                border: "1px solid rgba(61,219,122,0.18)",
              }}
            >
              <ChartLine className="h-4 w-4 shrink-0" style={{ color: G }} strokeWidth={2} />
              <div>
                <p className="text-[11px] font-semibold leading-snug" style={{ color: G }}>
                  {s.prediction.headline}
                </p>
                {s.prediction.basis.trim() ? (
                  <p className="mt-0.5 text-[10px] leading-snug" style={{ color: MU }}>
                    {s.prediction.basis}
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {showSourceLabel ? (
        <p className="px-3.5 pb-2 text-[10px] text-zinc-500">
          {generationSource === "llm" ? "AI-generated card" : "Deterministic fallback"}
        </p>
      ) : null}

      {/* Feedback */}
      <div
        className="flex items-center justify-between px-3.5 py-2"
        style={{ borderTop: "1px solid rgba(255,255,255,0.05)" }}
      >
        <span className="text-[10px] opacity-[0.28]" style={{ color: MU }}>
          Was this useful?
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void submitFeedback("helpful")}
            disabled={vote !== undefined}
            className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-2.5 py-1 text-[11px] transition hover:border-[rgba(61,219,122,0.3)] hover:text-[#3DDB7A] disabled:opacity-50"
            style={{ color: MU }}
          >
            <ThumbsUp className="h-3 w-3" strokeWidth={2} />
            Yes
          </button>
          <button
            type="button"
            onClick={() => setNegOpen(true)}
            disabled={vote !== undefined}
            className="inline-flex items-center gap-1 rounded-md border border-white/[0.08] px-2.5 py-1 text-[11px] transition hover:border-[rgba(249,115,22,0.3)] hover:text-[#F97316] disabled:opacity-50"
            style={{ color: MU }}
          >
            <ThumbsDown className="h-3 w-3" strokeWidth={2} />
            No
          </button>
        </div>
      </div>
      {negOpen && vote === undefined ? (
        <div className="border-t border-white/[0.05] px-3.5 pb-3 pt-2">
          <label className="text-[10px]" style={{ color: MU }}>
            What was wrong?
            <textarea
              value={negText}
              onChange={(e) => setNegText(e.target.value)}
              rows={2}
              className="mt-1 w-full resize-none rounded-md border border-white/10 bg-zinc-900/80 px-2 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600"
              placeholder="Optional — helps improve the card"
            />
          </label>
          <button
            type="button"
            onClick={() => void submitFeedback("not_helpful", negText)}
            className="mt-2 text-[11px] font-medium text-sky-400 hover:text-sky-300"
          >
            Send feedback
          </button>
        </div>
      ) : null}
    </div>
  );
}
