"use client";

import { Check, TriangleAlert } from "lucide-react";
import type { BodyCompareAssessment } from "@/lib/photos/bodyCompareAssessmentCardModel";
import {
  metricTilesFromHighlights,
  splitHighlights,
  stallingBodyFromHighlights,
  verdictLabels,
  verdictToneFromConfidence,
  workingBodyFromHighlights,
} from "@/lib/photos/bodyCompareAssessmentCardModel";

const G = "#3DDB7A";
const WARN = "#F97316";
const RED = "#F43F5E";
const TXT = "#fafafa";
const MU = "#a1a1aa";
const MU2 = "#d4d4d8";
const BORDER = "rgba(255,255,255,0.08)";

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

function toneAccent(tone: "on_track" | "at_risk" | "off_track"): { line: string; bg: string; label: string } {
  if (tone === "on_track") {
    return { line: G, bg: "rgba(61,219,122,0.07)", label: G };
  }
  if (tone === "off_track") {
    return { line: RED, bg: "rgba(244,63,94,0.07)", label: RED };
  }
  return { line: WARN, bg: "rgba(249,115,22,0.07)", label: WARN };
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
    /(\d+(?:[.,]\d+)?(?:\/\d+)?(?:\s*(?:kg|kcal|g|h|min|days?|weeks?|wk|%))?)/gi,
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

function shortDate(d: string): string {
  const x = new Date(d + "T12:00:00");
  return x.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function ProgressPhotoInsightCard({ data }: { data: BodyCompareAssessment }) {
  const tone = verdictToneFromConfidence(data.confidence);
  const { badge, headline } = verdictLabels(tone);
  const accent = toneAccent(tone);
  const updated = formatUpdatedAgo(data.generatedAt);
  const { leaner, other } = splitHighlights(data.highlights);
  const working = workingBodyFromHighlights(leaner);
  const stalling = stallingBodyFromHighlights(other);
  const fromL = shortDate(data.timeframe.from);
  const toL = shortDate(data.timeframe.to);
  const metrics = metricTilesFromHighlights(data.highlights, data.confidence, fromL, toL);
  const tilesGreen = tone === "on_track";

  return (
    <div
      className="mt-3 overflow-hidden rounded-xl border bg-zinc-950/80"
      style={{ borderColor: BORDER, color: TXT }}
    >
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
            AI photo analysis
          </span>
        </div>
        {updated ? (
          <span className="text-[9px]" style={{ color: MU }}>
            {updated}
          </span>
        ) : null}
      </div>

      <div
        className="px-3.5 py-3"
        style={{
          borderBottom: `1px solid ${BORDER}`,
          borderLeft: `3px solid ${accent.line}`,
          backgroundColor: accent.bg,
        }}
      >
        <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: accent.label }}>
          {badge}
        </p>
        <p className="mt-1 text-[13px] font-semibold leading-[1.45]" style={{ color: TXT }}>
          <HighlightNums text={headline} numberClassName="font-semibold" />
        </p>
        <p className="mt-1 text-[11px] leading-snug" style={{ color: MU2 }}>
          <HighlightNums text={data.summary} numberClassName="font-semibold text-zinc-100" />
        </p>
        <p className="mt-1.5 text-[10px] leading-snug" style={{ color: MU }}>
          {fromL} → {toL} · {data.disclaimer}
        </p>
      </div>

      <div className="border-b border-white/[0.05] px-3.5 py-2.5">
        <div className="flex items-center gap-1.5">
          <Check className="h-[13px] w-[13px] shrink-0" style={{ color: G }} strokeWidth={2.5} />
          <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: G }}>
            What looks leaner / improved
          </span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: MU2 }}>
          <HighlightNums text={working} numberClassName="font-semibold text-[#3DDB7A]" />
        </p>
      </div>

      <div className="border-b border-white/[0.05] px-3.5 py-2.5">
        <div className="flex items-center gap-1.5">
          <TriangleAlert className="h-[13px] w-[13px] shrink-0" style={{ color: WARN }} strokeWidth={2.25} />
          <span className="text-[9px] font-bold uppercase tracking-wide" style={{ color: WARN }}>
            Uncertainty & other cues
          </span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: MU2 }}>
          <HighlightNums text={stalling} numberClassName="font-semibold text-zinc-100" />
        </p>
        <div className="mt-2 flex gap-2">
          {metrics.map((m, i) => (
            <div
              key={`${m.label}-${i}`}
              className="min-w-0 flex-1 rounded-lg px-2 py-1.5 text-center"
              style={{
                backgroundColor: tilesGreen ? "rgba(61,219,122,0.08)" : "rgba(249,115,22,0.08)",
                border: tilesGreen
                  ? "1px solid rgba(61,219,122,0.18)"
                  : "1px solid rgba(249,115,22,0.18)",
              }}
            >
              <p
                className="truncate text-lg font-bold leading-tight"
                style={{
                  color: tilesGreen ? G : WARN,
                  fontFamily: "var(--font-insight-display), ui-serif, serif",
                }}
                title={m.value}
              >
                {m.value}
              </p>
              <p className="mt-0.5 line-clamp-2 text-[10px] leading-tight" style={{ color: MU }} title={m.label}>
                {m.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      <p className="px-3.5 py-2 text-[10px] leading-snug" style={{ color: MU }}>
        Estimate only · not medical advice · images processed on our servers (Anthropic Claude).
      </p>
    </div>
  );
}
