"use client";

import { useCallback, useEffect, useState } from "react";
import { RoadmapInfoCard } from "@/components/v2/roadmap/RoadmapInfoCard";
import { track } from "@/lib/analytics";

const LS_KEY = "ojas.community.challengeLabel.v1";

export function CommunityLocalChallengePanel() {
  const [label, setLabel] = useState("");
  const [saved, setSaved] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const v = window.localStorage.getItem(LS_KEY);
    if (v) setSaved(v);
  }, []);

  const onSave = useCallback(() => {
    const t = label.trim();
    if (!t) return;
    window.localStorage.setItem(LS_KEY, t);
    setSaved(t);
    track("community_challenge_saved", { len: t.length });
  }, [label]);

  return (
    <RoadmapInfoCard eyebrow="Community" title="Private challenge label (local only)">
      <p>
        Set a short team or challenge name — stored only in this browser. Full group features are still in
        development.
      </p>
      {saved ? (
        <p className="rounded-md bg-zinc-800/80 px-2 py-1 text-xs text-zinc-200">
          Current: <span className="font-semibold text-emerald-300">{saved}</span>
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. May step challenge"
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-emerald-600"
        />
        <button
          type="button"
          onClick={onSave}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
        >
          Save locally
        </button>
      </div>
    </RoadmapInfoCard>
  );
}
