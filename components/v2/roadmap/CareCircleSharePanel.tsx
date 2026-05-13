"use client";

import { useCallback, useState } from "react";
import { useHealthStore } from "@/lib/store";
import { useClientTodayKey } from "@/hooks/useClientTodayKey";
import { buildCareShareSummaryText } from "@/lib/roadmap/buildCareShareSummary";
import { track } from "@/lib/analytics";
import { RoadmapInfoCard } from "@/components/v2/roadmap/RoadmapInfoCard";

export function CareCircleSharePanel() {
  const entries = useHealthStore((s) => s.entries);
  const unit = useHealthStore((s) => s.settings.unit);
  const todayKey = useClientTodayKey();
  const [msg, setMsg] = useState<string | null>(null);

  const onCopy = useCallback(async () => {
    if (!todayKey) return;
    const text = buildCareShareSummaryText({ entries, asOfDate: todayKey, unit, days: 7 });
    try {
      await navigator.clipboard.writeText(text);
      setMsg("Copied to clipboard. Paste into email or notes for your coach.");
      track("care_circle_summary_copied", { chars: text.length });
    } catch {
      setMsg("Clipboard blocked — select and copy manually from a desktop browser.");
    }
  }, [entries, todayKey, unit]);

  return (
    <RoadmapInfoCard eyebrow="Care circle" title="Share a 7-day log summary">
      <p>
        Builds plain text from your recent entries on this device only. Nothing is uploaded. Always confirm
        accuracy before sending.
      </p>
      <button
        type="button"
        onClick={() => void onCopy()}
        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
      >
        Copy summary text
      </button>
      {msg ? <p className="text-[11px] text-emerald-300/90">{msg}</p> : null}
    </RoadmapInfoCard>
  );
}
